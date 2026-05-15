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
const path    = require('path');
const fs      = require('fs');

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

app.get('/api/health', (req, res) => {
  const apifyHeader = req.get('x-apify-token');
  res.json({
    ok: true,
    sources: {
      reddit:    true,    // backend proxy available
      pinterest: !!process.env.PINTEREST_ACCESS_TOKEN,
      google:    true,    // no key needed
      amazon:    true,    // scraping
      tiktok:    !!apifyHeader || !!process.env.APIFY_API_TOKEN,
    },
  });
});

// ─── Pinterest Trends ─────────────────────────────────────────────────────────

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

app.get('/api/google-trends', async (req, res) => {
  try {
    const geo = req.query.geo || 'US';
    const url = `https://trends.google.com/trends/api/dailytrends?hl=en-US&tz=-300&geo=${geo}&ns=15`;
    const result = await httpsGet(url);

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
    const nameMatches   = [...html.matchAll(/class="[^"]*zg-bdg-text[^"]*"[^>]*>\s*([^<]+)/g)].map(m => m[1].trim());
    const asinMatches   = [...html.matchAll(/\/dp\/([A-Z0-9]{10})/g)].map(m => m[1]);
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

// ─── TikTok (Apify) ───────────────────────────────────────────────────────────

function httpsRequest(method, url, headers = {}, body = null) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const opts = {
      method,
      hostname: u.hostname,
      path:     u.pathname + u.search,
      headers:  {
        'User-Agent':   'TRENDZ/1.0',
        'Content-Type': 'application/json',
        ...headers,
      },
    };
    const req = https.request(opts, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', reject);
    if (body) req.write(typeof body === 'string' ? body : JSON.stringify(body));
    req.end();
  });
}

app.get('/api/tiktok-trends', async (req, res) => {
  const token = req.get('x-apify-token') || process.env.APIFY_API_TOKEN;
  if (!token) {
    return res.status(503).json({ error: 'Apify token not configured. Set it in Settings or APIFY_API_TOKEN env.' });
  }

  const keyword = String(req.query.keyword || 'tiktokmademebuyit').slice(0, 80);
  const limit   = Math.min(parseInt(req.query.limit, 10) || 20, 50);

  try {
    const actor = 'clockworks~tiktok-scraper';
    const url   = `https://api.apify.com/v2/acts/${actor}/run-sync-get-dataset-items?token=${encodeURIComponent(token)}&timeout=60`;
    const input = {
      hashtags:           [keyword.replace(/^#/, '')],
      resultsPerPage:     limit,
      shouldDownloadVideos: false,
      shouldDownloadCovers: false,
      proxyConfiguration: { useApifyProxy: true },
    };
    const result = await httpsRequest('POST', url, {}, input);

    if (result.status !== 200 && result.status !== 201) {
      return res.status(result.status || 502).json({ error: 'Apify request failed', detail: result.body });
    }

    const items = Array.isArray(result.body) ? result.body : [];
    const videos = items.slice(0, limit).map(it => ({
      id:        String(it.id ?? it.aweme_id ?? ''),
      caption:   String(it.text ?? it.desc ?? ''),
      plays:     Number(it.playCount ?? it.play_count ?? 0),
      likes:     Number(it.diggCount ?? it.digg_count ?? 0),
      shares:    Number(it.shareCount ?? it.share_count ?? 0),
      comments:  Number(it.commentCount ?? it.comment_count ?? 0),
      hashtags:  (it.hashtags || []).map(h => h.name || h.title || h).filter(Boolean),
      url:       String(it.webVideoUrl ?? it.video_url ?? ''),
      thumbnail: it.videoMeta?.coverUrl ?? it.cover ?? null,
      author:    String(it.authorMeta?.name ?? it.author?.uniqueId ?? ''),
      createdAt: Number(it.createTimeISO ? Date.parse(it.createTimeISO) / 1000 : it.createTime || 0),
    })).filter(v => v.id);

    res.json({ source: 'tiktok', keyword, videos });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Shopify launch ───────────────────────────────────────────────────────────

app.post('/api/shopify/launch', async (req, res) => {
  const shopDomain   = req.get('x-shopify-shop')  || process.env.SHOPIFY_SHOP_DOMAIN;
  const accessToken  = req.get('x-shopify-token') || process.env.SHOPIFY_ADMIN_TOKEN;

  if (!shopDomain || !accessToken) {
    return res.status(503).json({ error: 'Shopify not configured. Set Shop Domain and Admin Access Token in Settings.' });
  }

  const { title, descriptionHtml, tags, productType, vendor, price, sourceUrl } = req.body || {};
  if (!title) return res.status(400).json({ error: 'Missing title' });

  const mutation = `
    mutation productCreate($input: ProductInput!) {
      productCreate(input: $input) {
        product { id title handle onlineStorePreviewUrl }
        userErrors { field message }
      }
    }`;

  const variables = {
    input: {
      title:           String(title).slice(0, 255),
      descriptionHtml: descriptionHtml ? String(descriptionHtml).slice(0, 5000) : undefined,
      tags:            Array.isArray(tags) ? tags.slice(0, 20).map(String) : undefined,
      productType:     productType ? String(productType).slice(0, 80) : undefined,
      vendor:          vendor ? String(vendor).slice(0, 80) : 'Manus Trends',
      status:          'DRAFT',
      variants:        price ? [{ price: String(price) }] : undefined,
      metafields:      sourceUrl ? [{
        namespace: 'manus',
        key:       'source_url',
        type:      'single_line_text_field',
        value:     String(sourceUrl).slice(0, 500),
      }] : undefined,
    },
  };

  try {
    const url = `https://${shopDomain.replace(/^https?:\/\//, '')}/admin/api/2024-10/graphql.json`;
    const result = await httpsRequest('POST', url, {
      'X-Shopify-Access-Token': accessToken,
    }, { query: mutation, variables });

    if (result.status >= 400) {
      return res.status(result.status).json({ error: 'Shopify request failed', detail: result.body });
    }
    const data   = result.body?.data?.productCreate;
    const errors = data?.userErrors || [];
    if (errors.length > 0) {
      return res.status(422).json({ error: 'Shopify validation failed', errors });
    }
    const product = data?.product;
    if (!product) {
      return res.status(502).json({ error: 'Empty Shopify response', detail: result.body });
    }

    const gid    = product.id || '';
    const numeric = gid.split('/').pop();
    const adminUrl = `https://${shopDomain.replace(/^https?:\/\//, '')}/admin/products/${numeric}`;

    res.json({
      ok:         true,
      productId:  product.id,
      handle:     product.handle,
      adminUrl,
      previewUrl: product.onlineStorePreviewUrl || null,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/shopify/health', async (req, res) => {
  const shopDomain  = req.get('x-shopify-shop')  || process.env.SHOPIFY_SHOP_DOMAIN;
  const accessToken = req.get('x-shopify-token') || process.env.SHOPIFY_ADMIN_TOKEN;
  if (!shopDomain || !accessToken) return res.status(503).json({ ok: false, error: 'not configured' });

  try {
    const url = `https://${shopDomain.replace(/^https?:\/\//, '')}/admin/api/2024-10/graphql.json`;
    const result = await httpsRequest('POST', url, {
      'X-Shopify-Access-Token': accessToken,
    }, { query: '{ shop { name myshopifyDomain } }' });
    if (result.status >= 400) return res.status(result.status).json({ ok: false, detail: result.body });
    const shop = result.body?.data?.shop;
    if (!shop) return res.status(502).json({ ok: false, detail: result.body });
    res.json({ ok: true, shop });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── Reddit Trends (proxy) ────────────────────────────────────────────────────

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

// ─── Static frontend ──────────────────────────────────────────────────────────
// Serve the Vite build output when it exists (Railway production).
// In local dev the Vite dev server runs separately on :5173.

const DIST = path.join(__dirname, 'apps', 'web', 'dist');
if (fs.existsSync(DIST)) {
  app.use(express.static(DIST));
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api')) {
      res.sendFile(path.join(DIST, 'index.html'));
    }
  });
}

// ─── Start ────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  const active = [
    process.env.PINTEREST_ACCESS_TOKEN && 'Pinterest',
    'Google Trends',
    'Amazon Movers',
    'Reddit (proxy)',
    process.env.APIFY_API_TOKEN && 'TikTok (Apify)',
  ].filter(Boolean);
  console.log(`TRENDZ backend listening on http://localhost:${PORT}`);
  console.log(`Active sources: ${active.join(', ')}`);
});
