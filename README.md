# 💸 BantayPresyo API (Backend)

A Node.js/Express server that scrapes and parses the Department of Agriculture (DA) Price Monitoring PDF reports for the National Capital Region (NCR).

## 🚀 Features
- **PDF Scraping:** Automatically fetches the latest "Daily Price Index" links from the DA website.
- **Smart Parsing:** Extracts commodity names, specifications, and prevailing prices using `pdf-parse`.
- **Direct Proxy:** Handles data requests internally to ensure fast response times and secure API key authentication.
- **2026 Compatible:** Optimized for the latest DA report formats including `$n/a$` price handling.

## 🛠️ Setup
1. **Install dependencies:**
   ```bash
   npm install

```

2. **Environment Variables:**
Create a `.env` file or export the following:
* `PORT`: Default is 3000
* `API_KEY`: Your secure authorization string


3. **Start the server:**
```bash
node server.js

```



## 📡 API Endpoints

* `GET /proxy?endpoint=daily_links` - Returns available PDF report dates.
* `GET /proxy?endpoint=data&date=January 14, 2026` - Returns parsed commodity data for a specific date.


# 💸 BantayPresyo Production Server

Production-grade API for scraping and parsing Department of Agriculture price reports.

## 🛠 Deployment on Vercel
1. Connect your GitHub repository to Vercel.
2. Set the **Framework Preset** to `Other`.
3. Add the `API_KEY` and `ALLOWED_ORIGINS` in the Vercel Project Settings.
4. Deploy.

## 🔒 Security Measures
- **CORS Strictness:** Only allows requests from the frontend domain.
- **Serverless Scaling:** Automatically scales with traffic without managing a VPS.
- **Bearer Authentication:** All endpoints require a valid API key in the header:
  `Authorization: Bearer <YOUR_API_KEY>`

## 📈 Performance
The parser includes timeouts (`10s` for web scraping, `15s` for PDF parsing) to ensure functions do not hang and exceed Vercel's execution limits.
---