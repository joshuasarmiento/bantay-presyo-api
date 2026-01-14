// server.js - Simplified Direct-Call Parser
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const { JSDOM } = require('jsdom');
const PDFParser = require('pdf-parse');

const app = express();
const apiKey = process.env.API_KEY || 'vldqKFnIG2IHawV8lPsOjEgoG6zmkEay7u7f2IUr5pGQL9bO63PkU0iCVZPwRQ4atO1sX86Yt2LYqwjFjQKD8Ek835apFjgjWGY4mrkhA0CB0Xbwm1YOWi86KKbLc5nK';

app.use(cors());

// Auth check - prevents 401 errors
const authenticate = (req, res, next) => {
    if (req.method === 'OPTIONS') return next();
    const auth = req.headers.authorization;
    if (!auth || auth !== `Bearer ${apiKey}`) return res.status(401).json({ error: 'Unauthorized' });
    next();
};

async function getLinks() {
    try {
        const { data } = await axios.get("https://www.da.gov.ph/price-monitoring/");
        const dom = new JSDOM(data);
        const links = [];
        dom.window.document.querySelectorAll('a').forEach(a => {
            if (a.href.endsWith('.pdf')) {
                links.push({ date: a.textContent.trim(), url: a.href.startsWith('http') ? a.href : 'https://www.da.gov.ph' + a.href });
            }
        });
        return links;
    } catch (e) { return []; }
}

async function extractData(url) {
    try {
        const res = await axios.get(url, { responseType: 'arraybuffer' });
        const pdf = await PDFParser(Buffer.from(res.data));
        const lines = pdf.text.split('\n');
        const items = [];
        let category = 'GENERAL';

        lines.forEach(line => {
            const t = line.trim();
            if (!t || t.toLowerCase().includes('prevailing')) return;
            
            // Matches 2026 PDF: "Commodity","Spec","Price"
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

app.get('/proxy', authenticate, async (req, res) => {
    const { endpoint, date } = req.query;
    const links = await getLinks();

    if (endpoint === 'daily_links') return res.json(links);
    
    if (endpoint === 'data') {
        const target = new Date(date).toISOString().split('T')[0];
        const match = links.find(l => new Date(l.date).toISOString().split('T')[0] === target);
        if (!match) return res.status(404).json({ error: 'PDF not found' });
        const results = await extractData(match.url);
        return res.json(results);
    }
    res.status(400).send('Invalid');
});

app.listen(3000);