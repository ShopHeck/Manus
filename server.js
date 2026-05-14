/**
 * TRENDZ backend — proxies trend APIs that require server-side secrets or
 * can't be called directly from the browser due to CORS restrictions.
 *
 * Sources:
 *   /api/pinterest-trends  — Pinterest Trends API (OAuth2 client credentials)
 *   /api/google-trends     — Google Trends via unofficial scrape
 *   /api/amazon-movers     — Amazon Movers & Shakers (cheerio scrape)
 *   /api/health            — Health check used by the settings modal
 *
 * Run:  node server.js
 * Env:  copy .env.example → .env and fill in keys
 */

'use strict';

require('dotenv').config();

const express = require('express');
const cors    = require('cors');
const https   = require('https');

const app  = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// ─── Utility ──────────────────────────────────────────────────────────────────

function httpsGet(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const opts = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; TRENDZ/1.0)',
        ...headers,
      },
    };
    https.get(url, opts, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    }).on('error', reject);
  });
}

// ─── Root + Health ────────────────────────────────────────────────────────────

app.get('/', (_req, res) => {
  res.json({ name: 'TRENDZ backend', status: 'ok' });
});

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    sources: {
      pinterest: !!process.env.PINTEREST_ACCESS_TOKEN,
      google:    true,    // no key needed
      amazon:    true,    // scraping
    },
  });
});

// ─── Pinterest Trends ─────────────────────────────────────────────────────────
//
// Docs: https://developers.pinterest.com/docs/api-features/trends/
// Auth: long-lived access token (Pinterest OAuth2 → exchange code → access token)
//       or Business Access Token from https://developers.pinterest.com/apps/
//
// Returns top trending keywords for US in the last 30 days.

app.get('/api/pinterest-trends', async (req, res) => {
  const token = process.env.PINTEREST_ACCESS_TOKEN;
  if (!token) {
    return res.status(503).json({ error: 'PINTEREST_ACCESS_TOKEN not configured' });
  }

  try {
    const region   = req.query.region   || 'US';
    const limit    = req.query.limit    || 50;
    const trendType= req.query.trendType|| 'monthly';

    const url = `https://api.pinterest.com/v5/trends/keywords/${region}/top/${trendType}?limit=${limit}`;
    const result = await httpsGet(url, { Authorization: `Bearer ${token}` });

    if (result.status !== 200) {
      return res.status(result.status).json({ error: 'Pinterest API error', detail: result.body });
    }

    // Normalize to {keyword, pct_growth, time_series[]}
    const trends = (result.body.trends || []).map(t => ({
      keyword:    t.keyword,
      pctGrowth:  t.pct_growth_wow,
      timeSeries: t.weekly_volume || [],
    }));

    res.json({ source: 'pinterest', region, trends });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Google Trends ────────────────────────────────────────────────────────────
//
// Uses the unofficial Google Trends daily/realtime endpoints.
// No API key required but rate-limited. For production use pytrends or
// the official Trends API (alpha access via application).
//
// Returns today's trending searches + interest data for ecommerce keywords.

app.get('/api/google-trends', async (req, res) => {
  try {
    const geo = req.query.geo || 'US';
    // Daily trending searches (JSON feed — no auth required)
    const url = `https://trends.google.com/trends/api/dailytrends?hl=en-US&tz=-300&geo=${geo}&ns=15`;
    const result = await httpsGet(url);

    // Google prepends ")]}',\n" to the response to prevent JSON hijacking
    const raw = typeof result.body === 'string'
      ? result.body.replace(/^\)\]\}',\n/, '')
      : JSON.stringify(result.body);

    let parsed;
    try { parsed = JSON.parse(raw); }
    catch { return res.status(502).json({ error: 'Could not parse Google Trends response' }); }

    const days     = parsed?.default?.trendingSearchesDays || [];
    const searches = days.flatMap(d => d.trendingSearches || []);

    const trends = searches
      .slice(0, 30)
      .map(s => ({
        keyword:   s.title?.query || '',
        traffic:   s.formattedTraffic || '',
        articles:  (s.articles || []).slice(0, 2).map(a => ({ title: a.title, url: a.url })),
        relatedQueries: (s.relatedQueries || []).map(q => q.query),
      }))
      .filter(t => t.keyword);

    res.json({ source: 'google_trends', geo, trends });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Amazon Movers & Shakers ──────────────────────────────────────────────────
//
// Scrapes the public Amazon Movers & Shakers page (updated hourly).
// No API key needed. Uses a simple regex extraction to avoid a cheerio dependency.
//
// Supported categories: beauty, health, toys-and-games, kitchen, clothing,
//   electronics, sports, home-garden, tools, grocery
//
// Returns top 20 movers with name, rank change, and URL.

app.get('/api/amazon-movers', async (req, res) => {
  const category = req.query.category || 'beauty';
  const ALLOWED_CATS = new Set([
    'beauty','health','toys-and-games','kitchen','clothing',
    'electronics','sports','home-garden','tools','grocery',
  ]);

  if (!ALLOWED_CATS.has(category)) {
    return res.status(400).json({ error: 'Invalid category', allowed: [...ALLOWED_CATS] });
  }

  try {
    const url = `https://www.amazon.com/gp/movers-and-shakers/${category}`;
    const result = await httpsGet(url, {
      'Accept': 'text/html',
      'Accept-Language': 'en-US,en;q=0.9',
    });

    if (result.status !== 200 || typeof result.body !== 'string') {
      return res.status(502).json({ error: 'Amazon request failed', status: result.status });
    }

    const html = result.body;

    // Extract product names — Amazon's class names rotate but item titles are consistent
    const nameMatches   = [...html.matchAll(/class="[^"]*zg-bdg-text[^"]*"[^>]*>\s*([^<]+)/g)].map(m => m[1].trim());
    const rankMatches   = [...html.matchAll(/(\d+),(\d+)%[^"]*movers/gi)];
    const asinMatches   = [...html.matchAll(/\/dp\/([A-Z0-9]{10})/g)].map(m => m[1]);

    // Fallback: extract via aria-label on product links
    const titleFallback = [...html.matchAll(/aria-label="([^"]{10,80})"/g)].map(m => m[1]);
    const names = nameMatches.length > 0 ? nameMatches : titleFallback.slice(0, 20);

    const products = [...new Set(asinMatches)].slice(0, 20).map((asin, i) => ({
      name: names[i] || `Product ${i + 1}`,
      asin,
      url:  `https://www.amazon.com/dp/${asin}`,
      rank: i + 1,
    }));

    res.json({ source: 'amazon_movers', category, products });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Reddit Trends (proxy — avoids CORS on some deployments) ─────────────────

app.get('/api/reddit-trends', async (req, res) => {
  const sub   = req.query.sub   || 'TikTokMadeMeBuyIt';
  const limit = Math.min(parseInt(req.query.limit) || 25, 100);
  try {
    const url    = `https://www.reddit.com/r/${sub}/top.json?t=week&limit=${limit}&raw_json=1`;
    const result = await httpsGet(url, { 'User-Agent': 'TRENDZ/1.0' });
    res.json(result.body);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Start ────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  const active = [
    process.env.PINTEREST_ACCESS_TOKEN && 'Pinterest',
    'Google Trends',
    'Amazon Movers',
    'Reddit (proxy)',
  ].filter(Boolean);
  console.log(`TRENDZ backend listening on http://localhost:${PORT}`);
  console.log(`Active sources: ${active.join(', ')}`);
});
