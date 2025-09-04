# Bantay Presyo Backend

## Overview
Bantay Presyo Backend is a Node.js/Express.js application that scrapes and serves retail price data from the Department of Agriculture's Price Monitoring page (https://www.da.gov.ph/price-monitoring/). It provides APIs to fetch daily PDF links and extract commodity price data for use in the Bantay Presyo frontend.

## Features
- Scrapes daily price index PDF links from the Department of Agriculture website.
- Parses PDF files to extract commodity price data.
- Provides RESTful endpoints to retrieve available dates and price data.
- Supports CORS for specific origins.
- Includes logging with Winston and daily log rotation.
- Health check endpoint for monitoring.

## Prerequisites
- Node.js (v16 or higher)
- npm
- Vercel CLI (for deployment)

## Installation
1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd bantay-presyo-backend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Set environment variables:
   - `PORT`: The port to run the server (default: 3000).
   - `ALLOWED_ORIGINS`: Comma-separated list of allowed CORS origins (e.g., `http://localhost:5173,https://your-vercel-app.vercel.app`).
   - `NODE_ENV`: Set to `production` for production or leave unset for development.

   Example `.env` file:
   ```env
   PORT=3000
   ALLOWED_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
   NODE_ENV=development
   ```

## Usage
1. Start the server:
   ```bash
   npm start
   ```
2. The server will run on `http://localhost:3000` (or the specified `PORT`).

## API Endpoints
- **GET /daily_links**
  - Returns a list of available PDF links with dates and file sizes.
  - Query parameter: `limit` (optional, limits the number of results).
  - Example: `GET /daily_links?limit=10`

- **GET /data**
  - Returns price data for a specific date.
  - Query parameter: `date` (required, format: "MMMM D, YYYY").
  - Example: `GET /data?date=September%204,%202025`

- **GET /health**
  - Returns the server status and current timestamp.
  - Example: `GET /health`

## Logging
- Logs are stored in the `logs/` directory with daily rotation.
- Logs are retained for 14 days and zipped to save space.
- In development mode (`NODE_ENV !== production`), logs are also output to the console.

## Dependencies
- `express`: Web framework for Node.js.
- `cors`: Middleware for enabling CORS.
- `axios`: HTTP client for scraping.
- `jsdom`: DOM parser for HTML scraping.
- `pdf-parse`: PDF text extraction.
- `winston`: Logging library.
- `winston-daily-rotate-file`: Log rotation for Winston.

## License
MIT License