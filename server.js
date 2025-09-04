const express = require('express');
const cors = require('cors');
const axios = require('axios');
const { JSDOM } = require('jsdom');
const PDFParser = require('pdf-parse');
const winston = require('winston');
require('winston-daily-rotate-file');

const app = express();
const port = process.env.PORT || 3000;

// Configure CORS
const allowedOrigins = process.env.ALLOWED_ORIGINS 
  ? process.env.ALLOWED_ORIGINS.split(',')
  : ['http://localhost:5173', 'https://bantay-presyo.vercel.app'];

app.use(cors({
  origin: allowedOrigins,
  credentials: true
}));

app.use(express.json());

// Set up logging
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'price-api' },
  transports: [
    new winston.transports.DailyRotateFile({
      filename: 'logs/app-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxSize: '20m',
      maxFiles: '14d'
    })
  ]
});

if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.simple()
  }));
}

// Helper function to clean date string
function cleanDate(dateStr) {
  return dateStr.replace(/[,\s]+/g, ' ').trim();
}

// Get category mapping
function getCategoryMapping() {
  return {
    'A': 'IMPORTED COMMERCIAL RICE',
    'B': 'LOCAL COMMERCIAL RICE', 
    'C': 'CORN',
    'D': 'FISH',
    'E': 'LIVESTOCK & POULTRY PRODUCTS',
    'F': 'LOWLAND VEGETABLES',
    'G': 'HIGHLAND VEGETABLES',
    'H': 'SPICES',
    'I': 'FRUITS',
    'J': 'OTHER BASIC COMMODITIES'
  };
}

// Parse text line as commodity entry
function parseTextLine(line, currentCategory) {
  line = line.trim();
  if (!line) return { data: null, success: false };
  
  const parts = line.split(/\s+/);
  if (!parts.length || !/^\d+$/.test(parts[0])) {
    return { data: null, success: false };
  }
  
  const number = parts[0];
  const remaining = parts.slice(1).join(' ');
  
  let price = 'n/a';
  let commodity = '';
  let specification = '';
  
  // Look for price patterns at the end
  const pricePatterns = [
    /(\d+\.\d+)$/,  // decimal number at end
    /(n\/a)$/i,     // n/a at end (case insensitive)
    /(\d+)$/        // whole number at end
  ];
  
  for (const pattern of pricePatterns) {
    const match = remaining.match(pattern);
    if (match) {
      price = match[1];
      const beforePrice = remaining.substring(0, match.index).trim();
      
      if (beforePrice) {
        const words = beforePrice.split(/\s+/);
        if (words.length >= 1) {
          commodity = words[0];
          if (words.length > 1) {
            specification = words.slice(1).join(' ');
          }
        }
      }
      break;
    }
  }
  
  if (commodity) {
    return {
      data: {
        number,
        commodity,
        specification,
        price,
        category: currentCategory || 'UNKNOWN'
      },
      success: true
    };
  }
  
  return { data: null, success: false };
}

// Scrape PDF links from the main page
async function getDailyPdfLinks() {
  const url = "https://www.da.gov.ph/price-monitoring/";
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
  };
  
  try {
    const response = await axios.get(url, { headers });
    
    if (response.status !== 200) {
      logger.error(`Failed to fetch PDF links: Status ${response.status}`);
      return [];
    }
    
    const dom = new JSDOM(response.data);
    const document = dom.window.document;
    
    // Find the Daily Price Index section
    let sectionHeader = null;
    const h3Elements = document.querySelectorAll('h3');
    
    for (const h3 of h3Elements) {
      if (h3.textContent.includes('Daily Price Index')) {
        sectionHeader = h3;
        break;
      }
    }
    
    if (!sectionHeader) {
      logger.warn('Daily Price Index section not found');
      return [];
    }
    
    // Find the next table after the header
    let table = sectionHeader.nextElementSibling;
    while (table && table.tagName !== 'TABLE') {
      table = table.nextElementSibling;
    }
    
    if (!table) {
      logger.warn('Table not found after Daily Price Index header');
      return [];
    }
    
    const links = [];
    const rows = table.querySelectorAll('tr');
    
    for (const row of rows) {
      const cols = row.querySelectorAll('td, th');
      if (cols.length >= 2) {
        const firstCol = cols[0];
        const secondCol = cols[1];
        const aTag = firstCol.querySelector('a');
        
        if (aTag && aTag.href.endsWith('.pdf')) {
          const date = cleanDate(aTag.textContent.trim());
          const fileSize = secondCol.textContent.trim();
          let pdfUrl = aTag.href;
          
          if (pdfUrl.startsWith('/')) {
            pdfUrl = 'https://www.da.gov.ph' + pdfUrl;
          }
          
          links.push({
            date,
            file_size: fileSize,
            url: pdfUrl
          });
        }
      }
    }
    
    return links;
  } catch (error) {
    logger.error(`Error fetching PDF links: ${error.message}`);
    return [];
  }
}

// Extract data from PDF
async function extractPdfData(pdfUrl) {
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
  };
  
  try {
    const response = await axios.get(pdfUrl, { 
      headers,
      responseType: 'arraybuffer'
    });
    
    if (response.status !== 200) {
      logger.error(`Failed to download PDF: ${pdfUrl}, Status ${response.status}`);
      return [];
    }
    
    const data = [];
    let currentCategory = null;
    const categoryMapping = getCategoryMapping();
    
    // Parse PDF
    const pdfData = await PDFParser(Buffer.from(response.data));
    const text = pdfData.text;
    
    if (!text) {
      logger.warn(`No text extracted from PDF: ${pdfUrl}`);
      return [];
    }
    
    const lines = text.split('\n');
    
    for (const line of lines) {
      const trimmedLine = line.trim();
      if (!trimmedLine) continue;
      
      // Check for category letters (single letter A-J)
      if (trimmedLine.length === 1 && categoryMapping[trimmedLine.toUpperCase()]) {
        currentCategory = categoryMapping[trimmedLine.toUpperCase()];
        continue;
      }
      
      // Check for category descriptions
      for (const [letter, desc] of Object.entries(categoryMapping)) {
        if (trimmedLine.toUpperCase().includes(desc)) {
          currentCategory = desc;
          break;
        }
      }
      
      // Try to parse as commodity data
      const { data: parsedData, success } = parseTextLine(trimmedLine, currentCategory);
      if (success && parsedData) {
        data.push(parsedData);
      }
    }
    
    // Sort by number
    data.sort((a, b) => {
      const numA = parseInt(a.number);
      const numB = parseInt(b.number);
      if (isNaN(numA)) return 1;
      if (isNaN(numB)) return -1;
      return numA - numB;
    });
    
    return data;
  } catch (error) {
    logger.error(`Error parsing PDF: ${pdfUrl}, ${error.message}`);
    return [];
  }
}

// Routes
app.get('/daily_links', async (req, res) => {
  try {
    const links = await getDailyPdfLinks();
    const limit = req.query.limit ? parseInt(req.query.limit) : null;
    
    const result = limit ? links.slice(0, limit) : links;
    res.json(result);
  } catch (error) {
    logger.error(`Error in /daily_links: ${error.message}`);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/data', async (req, res) => {
  try {
    const dateQuery = req.query.date;
    
    if (!dateQuery) {
      return res.status(400).json({ error: 'Missing "date" query parameter' });
    }
    
    const cleanQuery = cleanDate(dateQuery);
    const links = await getDailyPdfLinks();
    
    let pdfUrl = null;
    for (const link of links) {
      if (cleanDate(link.date) === cleanQuery) {
        pdfUrl = link.url;
        break;
      }
    }
    
    if (!pdfUrl) {
      const availableDates = links.slice(0, 5).map(link => link.date);
      return res.status(404).json({
        error: `No PDF found for the given date: ${dateQuery}. Available dates: ${availableDates.join(', ')}`
      });
    }
    
    const data = await extractPdfData(pdfUrl);
    
    res.json({
      date: dateQuery,
      pdf_url: pdfUrl,
      data
    });
  } catch (error) {
    logger.error(`Error in /data: ${error.message}`);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Error handling middleware
app.use((err, req, res, next) => {
  logger.error(`Unhandled error: ${err.message}`, err);
  res.status(500).json({ error: 'Internal server error' });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Start server
app.listen(port, () => {
  logger.info(`Server running on port ${port}`);
  console.log(`Server running on port ${port}`);
});