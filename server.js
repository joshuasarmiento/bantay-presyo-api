const express = require('express');
const cors = require('cors');
const axios = require('axios');
const { JSDOM } = require('jsdom');
const PDFParser = require('pdf-parse');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const { query, validationResult } = require('express-validator');

const app = express();
const port = process.env.PORT || 3000;

// const allowedOrigins = process.env.ALLOWED_ORIGINS || 'http://localhost:5173';

// const allowedOrigins = process.env.ALLOWED_ORIGINS|| 'https://bantaypresyo.vercel.app/';
const allowedOrigins = process.env.ALLOWED_ORIGINS || 'https://bantaypresyo.vercel.app';
const apiKey = process.env.API_KEY || 'vldqKFnIG2IHawV8lPsOjEgoG6zmkEay7u7f2IUr5pGQL9bO63PkU0iCVZPwRQ4atO1sX86Yt2LYqwjFjQKD8Ek835apFjgjWGY4mrkhA0CB0Xbwm1YOWi86KKbLc5nK'; 

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      connectSrc: ["'self'", 'https://www.da.gov.ph', 'http://localhost:3000']
    }
  }
}));

app.use(cors({
  origin: (origin, callback) => {
    console.log(`Request origin: ${origin}`);
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.error(`CORS blocked for origin: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));

app.use(rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per window
  message: 'Too many requests from this IP, please try again later.'
}));

// API key authentication middleware
const authenticateApiKey = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || authHeader !== `Bearer ${apiKey}`) {
    return res.status(401).json({ error: 'Unauthorized: Invalid or missing API key' });
  }
  next();
};

app.use(express.json());

// Helper function to clean date string
const cleanDate = (input) => {
  const date = new Date(input);
  if (isNaN(date)) return null;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`; // e.g., "2025-09-02"
};

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
  
  const pricePatterns = [
    /(\d+\.\d{1,2})$/, // decimal number (e.g., 56.61, 45.9)
    /(n\/a)$/i,        // n/a (case insensitive)
    /(\d+)$/,          // whole number (e.g., 300)
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
          specification = words.length > 1 ? words.slice(1).join(' ') : '';
        }
      }
      break;
    }
  }
  
  if (!commodity) {
    return { data: null, success: false };
  }
  
  return {
    data: {
      number,
      commodity,
      specification: specification || 'N/A',
      price,
      category: currentCategory || 'UNKNOWN'
    },
    success: true
  };
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
      return [];
    }
    
    const dom = new JSDOM(response.data);
    const document = dom.window.document;
    
    let sectionHeader = null;
    const h3Elements = document.querySelectorAll('h3');
    
    for (const h3 of h3Elements) {
      if (h3.textContent.includes('Daily Price Index')) {
        sectionHeader = h3;
        break;
      }
    }
    
    if (!sectionHeader) {
      return [];
    }
    
    let table = sectionHeader.nextElementSibling;
    while (table && table.tagName !== 'TABLE') {
      table = table.nextElementSibling;
    }
    
    if (!table) {
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
          const dateText = aTag.textContent.trim();
          const date = cleanDate(dateText);
          const fileSize = secondCol.textContent.trim();
          let pdfUrl = aTag.href;
          
          if (pdfUrl.startsWith('/')) {
            pdfUrl = 'https://www.da.gov.ph' + pdfUrl;
          }
          
          links.push({
            date: date || dateText, // Fallback to raw text if parsing fails
            file_size: fileSize,
            url: pdfUrl
          });
        }
      }
    }
    
    return links;
  } catch (error) {
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
      return { data: [], notes: [] };
    }
    
    const data = [];
    let notes = [];
    let currentCategory = null;
    let inNotesSection = false;
    const categoryMapping = getCategoryMapping();
    
    const pdfData = await PDFParser(Buffer.from(response.data));
    const text = pdfData.text;
    
    if (!text) {
      return { data: [], notes: [] };
    }
    
    const lines = text.split('\n');
    
    for (const line of lines) {
      const trimmedLine = line.trim();
      if (!trimmedLine) continue;
      
      // Check for notes section
      if (trimmedLine.toLowerCase().startsWith('note') || trimmedLine.toLowerCase().startsWith('notes')) {
        inNotesSection = true;
        continue;
      }
      
      if (inNotesSection) {
        // Collect notes, excluding empty lines or redundant headers
        if (!trimmedLine.match(/^(Page \d+ of \d+|ANNEX|PREVAILING RETAIL|COMMODITY|SPECIFICATION|PRICE PER UNIT)/i)) {
          notes.push(trimmedLine);
        }
        continue;
      }
      
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
    
    // Sort data by number
    // data.sort((a, b) => {
    //   const numA = parseInt(a.number);
    //   const numB = parseInt(b.number);
    //   if (isNaN(numA)) return 1;
    //   if (isNaN(numB)) return -1;
    //   return numA - numB;
    // });
    data.sort((a, b) => {
      const numA = parseInt(a.number, 10);
      const numB = parseInt(b.number, 10);
      if (isNaN(numA) || isNaN(numB)) {
        console.error(`Invalid number in sorting: ${numA} or ${numB}`);
        return 0;
      }
      return numA - numB;
    });

    // Clean up notes: remove duplicates and empty entries
    notes = [...new Set(notes.filter(note => note.trim() && !note.match(/^\d+$/)))];
    
    return { data, notes };
  } catch (error) {
    return { data: [], notes: [] };
  }
}

// Routes
app.get('/daily_links', authenticateApiKey, async (req, res) => {
  try {
    const links = await getDailyPdfLinks();
    const limit = req.query.limit ? parseInt(req.query.limit) : null;
    
    const result = limit ? links.slice(0, limit) : links;
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/data', authenticateApiKey, [
  query('date').matches(/^[A-Za-z]+ \d{1,2}, \d{4}$/).withMessage('Invalid date format. Use MMMM D, YYYY')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: errors.array()[0].msg });
    }

    const dateQuery = req.query.date;
    
    if (!dateQuery) {
      return res.status(400).json({ error: 'Missing "date" query parameter' });
    }
    
    // Validate MMMM D, YYYY format (e.g., "September 2, 2025")
    if (!/^[A-Za-z]+ \d{1,2}, \d{4}$/.test(dateQuery)) {
      return res.status(400).json({ error: 'Invalid date format. Use MMMM D, YYYY (e.g., September 2, 2025)' });
    }
    
    const cleanQuery = cleanDate(dateQuery);
    if (!cleanQuery) {
      return res.status(400).json({ error: `Invalid date: ${dateQuery}` });
    }
    
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
    
    const { data, notes } = await extractPdfData(pdfUrl);
    
    res.json({
      date: dateQuery,
      pdf_url: pdfUrl,
      data,
      notes
    });
  } catch (error) {
    console.error('Server error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

app.use((err, req, res, next) => {
  res.status(500).json({ error: 'Internal server error' });
});

app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});