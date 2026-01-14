const express = require('express');
const cors = require('cors');
const axios = require('axios');
const { JSDOM } = require('jsdom');
const PDFParser = require('pdf-parse');

const app = express();
const apiKey = process.env.API_KEY || 'vldqKFnIG2IHawV8lPsOjEgoG6zmkEay7u7f2IUr5pGQL9bO63PkU0iCVZPwRQ4atO1sX86Yt2LYqwjFjQKD8Ek835apFjgjWGY4mrkhA0CB0Xbwm1YOWi86KKbLc5nK';

// Production-ready CORS
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : true,
  credentials: true
}));

app.use(express.json());

const authenticate = (req, res, next) => {
  if (req.method === 'OPTIONS') return next();
  const auth = req.headers.authorization;
  if (!auth || auth !== `Bearer ${apiKey}`) return res.status(401).json({ error: 'Unauthorized' });
  next();
};

// --- Internal Helper Functions ---

const toISODate = (d) => {
  const date = new Date(d);
  return isNaN(date) ? null : date.toISOString().split('T')[0];
};

async function getDailyLinks() {
  try {
    const { data } = await axios.get("https://www.da.gov.ph/price-monitoring/", { timeout: 10000 });
    const dom = new JSDOM(data);
    const links = [];
    dom.window.document.querySelectorAll('a').forEach(a => {
      if (a.href.endsWith('.pdf')) {
        links.push({ 
          date: a.textContent.trim(), 
          url: a.href.startsWith('http') ? a.href : 'https://www.da.gov.ph' + a.href 
        });
      }
    });
    return links;
  } catch (e) { return []; }
}

async function parsePDF(url) {
  try {
    const res = await axios.get(url, { responseType: 'arraybuffer', timeout: 15000 });
    const pdf = await PDFParser(Buffer.from(res.data));
    const lines = pdf.text.split('\n');
    const items = [];
    let category = 'GENERAL';

    lines.forEach(line => {
      const t = line.trim();
      if (!t || t.toLowerCase().includes('prevailing')) return;
      
      const match = t.match(/\s+([\d,.]+|(?:\$)?n\/a(?:\$)?)$/i);
      if (match) {
        items.push({
          commodity: t.substring(0, match.index).replace(/[",]/g, '').trim(),
          price: match[1].replace(/\$/g, ''),
          category: category
        });
      } else if (t === t.toUpperCase() && t.length > 5) {
        category = t.replace(/[",]/g, '').trim();
      }
    });
    return { data: items };
  } catch (e) { return { data: [] }; }
}

// --- Routes ---

app.get('/proxy', authenticate, async (req, res) => {
  const { endpoint, date } = req.query;
  const links = await getDailyLinks();

  if (endpoint === 'daily_links') return res.json(links);
  
  if (endpoint === 'data') {
    const target = toISODate(date);
    const match = links.find(l => toISODate(l.date) === target);
    if (!match) return res.status(404).json({ error: 'Data not found for this date.' });
    
    const results = await parsePDF(match.url);
    return res.json(results);
  }
  res.status(400).send('Invalid');
});

// Production Export
module.exports = app;

// Local Listener
if (process.env.NODE_ENV !== 'production') {
  const port = 3000;
  app.listen(port, () => console.log(`🚀 Server: http://localhost:${port}`));
}