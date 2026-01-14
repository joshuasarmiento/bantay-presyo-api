const express = require('express');
const cors = require('cors');
const axios = require('axios');
const { JSDOM } = require('jsdom');
const PDFParser = require('pdf-parse');

const app = express();

// Use environment variables for production security
const apiKey = process.env.API_KEY;
const allowedOrigins = process.env.ALLOWED_ORIGINS || 'https://bantaypresyo.vercel.app';

// 1. Optimized CORS for Production
app.use(cors({
    origin: (origin, callback) => {
        // Allow requests with no origin (like mobile apps or curl) 
        // or check against allowed origins
        if (!origin || allowedOrigins.split(',').includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true
}));

app.use(express.json());

// 2. Production Auth Middleware
const authenticate = (req, res, next) => {
    if (req.method === 'OPTIONS') return next();
    const auth = req.headers.authorization;
    if (!auth || auth !== `Bearer ${apiKey}`) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
};

// --- Logic Functions ---

async function getLinks() {
    try {
        const { data } = await axios.get("https://www.da.gov.ph/price-monitoring/", {
            headers: { 'User-Agent': 'Mozilla/5.0' },
            timeout: 10000 
        });
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

async function extractData(url) {
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
                    category
                });
            } else if (t === t.toUpperCase() && t.length > 5) {
                category = t.replace(/[",]/g, '').trim();
            }
        });
        return { data: items };
    } catch (e) { return { data: [] }; }
}

// --- Routes ---

app.get('/api/proxy', authenticate, async (req, res) => {
    const { endpoint, date } = req.query;
    const links = await getLinks();

    if (endpoint === 'daily_links') return res.json(links);
    
    if (endpoint === 'data') {
        const target = new Date(date).toISOString().split('T')[0];
        const match = links.find(l => {
            try { return new Date(l.date).toISOString().split('T')[0] === target; }
            catch(e) { return false; }
        });
        
        if (!match) return res.status(404).json({ error: 'Data for this date is not available.' });
        const results = await extractData(match.url);
        return res.json(results);
    }
    res.status(400).json({ error: 'Invalid Endpoint' });
});

// For Vercel, we export the app instead of calling app.listen()
// This allows Vercel to handle the server startup
module.exports = app;