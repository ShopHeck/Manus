/**
 * TRENDZ backend — proxies trend APIs that require server-side secrets or
 * can't be called directly from the browser due to CORS restrictions.
 *
 * Sources / endpoints:
 *   GET  /api/health              — Health check; reports which features are live
 *   GET  /api/pinterest-trends    — Pinterest Trends API (OAuth2 bearer token)
 *   GET  /api/google-trends       — Google Trends via unofficial scrape
 *   GET  /api/amazon-movers       — Amazon Movers & Shakers (HTML scrape)
 *   GET  /api/reddit-trends       — Reddit top posts (public JSON)
 *   GET  /api/image-search        — Product image lookup (Pexels → Unsplash)
 *   POST /api/shopify/launch      — Create Shopify draft product (Admin API)
 *   GET  /api/shopify/health      — Test Shopify credentials
 *   POST /api/ai/generate-copy    — Claude AI product copy generation
 *   GET  /api/suppliers/search    — CJDropshipping + AliExpress supplier lookup
 *   GET  /api/competitors/search  — Google Shopping competitor scrape
 *
 * Run:  node server.js
 * Env:  copy apps/server/.env.example → apps/server/.env and fill in keys
 *
 * RATE-LIMIT / SCRAPING NOTES
 * ─────────────────────────────
 * Google Trends and Amazon are scraped without auth — use with care in production.
 * Google Shopping scraping (/api/competitors/search) is unauthenticated HTML scraping
 * and can trigger CAPTCHAs under heavy load. Cache results on the client where possible.
 * CJDropshipping tokens are cached in-process for 23 h.
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

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    sources: {
      pinterest:       !!process.env.PINTEREST_ACCESS_TOKEN,
      google:          true,
      amazon:          true,
      aiCopy:          !!process.env.ANTHROPIC_API_KEY,
      cjDropshipping:  !!(process.env.CJDROPSHIPPING_EMAIL && process.env.CJDROPSHIPPING_PASSWORD),
      aliExpress:      !!process.env.ALIEXPRESS_APP_KEY,
      shopify:         true,
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
    const region    = req.query.region    || 'US';
    const limit     = req.query.limit     || 50;
    const trendType = req.query.trendType || 'monthly';

    const url    = `https://api.pinterest.com/v5/trends/keywords/${region}/top/${trendType}?limit=${limit}`;
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
    const geo    = req.query.geo || 'US';
    const url    = `https://trends.google.com/trends/api/dailytrends?hl=en-US&tz=-300&geo=${geo}&ns=15`;
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
        keyword:        s.title?.query || '',
        traffic:        s.formattedTraffic || '',
        articles:       (s.articles || []).slice(0, 2).map(a => ({ title: a.title, url: a.url })),
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
  const category  = req.query.category || 'beauty';
  const ALLOWED   = new Set([
    'beauty','health','toys-and-games','kitchen','clothing',
    'electronics','sports','home-garden','tools','grocery',
  ]);

  if (!ALLOWED.has(category)) {
    return res.status(400).json({ error: 'Invalid category', allowed: [...ALLOWED] });
  }

  try {
    const url    = `https://www.amazon.com/gp/movers-and-shakers/${category}`;
    const result = await httpsGet(url, { Accept: 'text/html', 'Accept-Language': 'en-US,en;q=0.9' });

    if (result.status !== 200 || typeof result.body !== 'string') {
      return res.status(502).json({ error: 'Amazon request failed', status: result.status });
    }

    const html         = result.body;
    const nameMatches  = [...html.matchAll(/class="[^"]*zg-bdg-text[^"]*"[^>]*>\s*([^<]+)/g)].map(m => m[1].trim());
    const asinMatches  = [...html.matchAll(/\/dp\/([A-Z0-9]{10})/g)].map(m => m[1]);
    const titleFallback= [...html.matchAll(/aria-label="([^"]{10,80})"/g)].map(m => m[1]);
    const names        = nameMatches.length > 0 ? nameMatches : titleFallback.slice(0, 20);

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

// ─── Reddit Trends ────────────────────────────────────────────────────────────

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

// ─── Image Search ─────────────────────────────────────────────────────────────

app.get('/api/image-search', async (req, res) => {
  const q = (req.query.q || '').trim();
  if (!q) return res.status(400).json({ error: 'q is required' });

  const pexels   = process.env.PEXELS_API_KEY;
  const unsplash = process.env.UNSPLASH_ACCESS_KEY;

  if (pexels) {
    try {
      const encoded = encodeURIComponent(q);
      const result  = await httpsGet(
        `https://api.pexels.com/v1/search?query=${encoded}&per_page=1`,
        { Authorization: pexels },
      );
      const photo = result.body?.photos?.[0];
      if (photo) return res.json({ url: photo.src.medium, source: 'pexels' });
    } catch { /* fall through */ }
  }

  if (unsplash) {
    try {
      const encoded = encodeURIComponent(q);
      const result  = await httpsGet(
        `https://api.unsplash.com/search/photos?query=${encoded}&per_page=1`,
        { Authorization: `Client-ID ${unsplash}` },
      );
      const photo = result.body?.results?.[0];
      if (photo) return res.json({ url: photo.urls.small, source: 'unsplash' });
    } catch { /* fall through */ }
  }

  res.json({ url: null, source: 'none' });
});

// ─── Shopify domain validation ────────────────────────────────────────────────
// Prevents SSRF: only *.myshopify.com domains may be used as fetch targets.
function isValidShopifyDomain(shop) {
  return typeof shop === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9-]*\.myshopify\.com$/.test(shop);
}

// ─── Shopify: Health ──────────────────────────────────────────────────────────

app.get('/api/shopify/health', async (req, res) => {
  const shop  = req.headers['x-shopify-shop'];
  const token = req.headers['x-shopify-token'];
  if (!shop || !token) {
    return res.status(400).json({ ok: false, error: 'x-shopify-shop and x-shopify-token headers required' });
  }
  if (!isValidShopifyDomain(shop)) {
    return res.status(400).json({ ok: false, error: 'Invalid Shopify shop domain — must end with .myshopify.com' });
  }

  try {
    const response = await fetch(`https://${shop}/admin/api/2024-10/shop.json`, {
      headers: { 'X-Shopify-Access-Token': token },
    });
    if (!response.ok) {
      return res.status(response.status).json({ ok: false, error: `Shopify returned HTTP ${response.status}` });
    }
    const data = await response.json();
    res.json({ ok: true, shop: { name: data.shop?.name, domain: data.shop?.domain } });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── Shopify: Launch product ──────────────────────────────────────────────────

app.post('/api/shopify/launch', async (req, res) => {
  const shop  = req.headers['x-shopify-shop'];
  const token = req.headers['x-shopify-token'];
  if (!shop || !token) {
    return res.status(400).json({ ok: false, error: 'x-shopify-shop and x-shopify-token headers required' });
  }
  if (!isValidShopifyDomain(shop)) {
    return res.status(400).json({ ok: false, error: 'Invalid Shopify shop domain — must end with .myshopify.com' });
  }

  const { title, descriptionHtml, tags, productType, vendor, price, sourceUrl, metaTitle, metaDescription } = req.body;
  if (!title) return res.status(400).json({ ok: false, error: 'title is required' });

  const mutation = `
    mutation productCreate($input: ProductInput!) {
      productCreate(input: $input) {
        product { id onlineStoreUrl }
        userErrors { field message }
      }
    }
  `;

  const tagList = Array.isArray(tags)
    ? tags.join(', ')
    : (typeof tags === 'string' ? tags : '');

  const variables = {
    input: {
      title:           String(title).slice(0, 255),
      descriptionHtml: descriptionHtml || '',
      tags:            tagList,
      productType:     productType || '',
      vendor:          vendor || 'Manus Trends',
      status:          'DRAFT',
      variants:        [{ price: String(price || '29.99') }],
    },
  };

  try {
    const response = await fetch(`https://${shop}/admin/api/2024-10/graphql.json`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token },
      body:    JSON.stringify({ query: mutation, variables }),
    });

    const data     = await response.json();
    const gqlErrors= data.errors;
    const userErrors = data.data?.productCreate?.userErrors;

    if (gqlErrors?.length) {
      return res.status(422).json({ ok: false, error: gqlErrors[0].message, errors: gqlErrors });
    }
    if (userErrors?.length) {
      return res.status(422).json({ ok: false, error: userErrors[0].message, errors: userErrors });
    }

    const product   = data.data?.productCreate?.product;
    if (!product) return res.status(502).json({ ok: false, error: 'No product returned from Shopify' });

    const productId = product.id;
    const numericId = productId.replace('gid://shopify/Product/', '');
    const adminUrl  = `https://${shop}/admin/products/${numericId}`;

    // Optionally attach SEO metafields if provided
    if ((metaTitle || metaDescription) && numericId) {
      const seoMutation = `
        mutation productUpdate($input: ProductInput!) {
          productUpdate(input: $input) { userErrors { field message } }
        }
      `;
      await fetch(`https://${shop}/admin/api/2024-10/graphql.json`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token },
        body: JSON.stringify({
          query: seoMutation,
          variables: {
            input: {
              id: productId,
              seo: {
                title:       metaTitle       || undefined,
                description: metaDescription || undefined,
              },
            },
          },
        }),
      }).catch(() => {}); // non-fatal
    }

    res.json({ ok: true, productId, adminUrl });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── AI Copy Generation ───────────────────────────────────────────────────────
// Requires: ANTHROPIC_API_KEY
// Optional: ANTHROPIC_CLAUDE_MODEL (default: claude-opus-4-7)

app.post('/api/ai/generate-copy', async (req, res) => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(503).json({ error: 'ANTHROPIC_API_KEY not configured' });
  }

  const { product, competitors, supplier } = req.body || {};
  if (!product?.name) return res.status(400).json({ error: 'product is required' });

  const model  = process.env.ANTHROPIC_CLAUDE_MODEL || 'claude-opus-4-7';
  const prompt = buildCopyPrompt(product, competitors, supplier);

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method:  'POST',
      headers: {
        'Content-Type':    'application/json',
        'x-api-key':       apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: 1800,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      return res.status(502).json({ error: err.error?.message || `Claude API error: ${response.status}` });
    }

    const data = await response.json();
    const text = data?.content?.[0]?.text ?? '';

    // Extract first JSON object from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return res.status(502).json({ error: 'Claude did not return valid JSON copy' });
    }

    let raw;
    try { raw = JSON.parse(jsonMatch[0]); }
    catch { return res.status(502).json({ error: 'Failed to parse Claude response as JSON' }); }

    // Normalise the full schema so the client never receives partial / typed-incorrectly data.
    // Arrays default to [] and strings default to '' rather than crashing the UI's .map() calls.
    const copy = {
      title:           String(raw.title           || '').trim(),
      description:     String(raw.description     || '').trim(),
      benefits:        Array.isArray(raw.benefits)  ? raw.benefits.map(String)  : [],
      tags:            Array.isArray(raw.tags)       ? raw.tags.map(String)      : [],
      metaTitle:       String(raw.metaTitle        || '').trim().slice(0, 60),
      metaDescription: String(raw.metaDescription  || '').trim().slice(0, 160),
      variantCopy:     raw.variantCopy ? String(raw.variantCopy).trim() : undefined,
    };

    if (!copy.title || !copy.description) {
      return res.status(502).json({ error: 'Incomplete copy returned — please retry' });
    }

    res.json({ ok: true, copy });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

function buildCopyPrompt(product, competitors, supplier) {
  const competitorSection = Array.isArray(competitors) && competitors.length
    ? `\nCompetitor listings found online:\n${competitors.slice(0, 4).map(c =>
        `  - ${c.store}: "${c.title}" at ${c.price ? `$${c.price}` : 'unknown price'}`
      ).join('\n')}\nDifferentiate the copy from these competitors.`
    : '';

  const supplierSection = supplier
    ? `\nVerified supplier: ${supplier.source === 'cjdropshipping' ? 'CJDropshipping' : 'AliExpress'}, cost $${supplier.cost?.toFixed(2)}, shipping ~$${supplier.shipping?.toFixed(2)}`
    : '';

  return `You are an expert Shopify product copywriter specialising in trending consumer products and dropshipping.

PRODUCT DATA
  Name: ${product.name}
  Category: ${product.category}
  Viral Score: ${Math.round(product.viralScore?.total ?? 0)}/100
  Market Saturation: ${product.saturation?.total ?? 0}/100 (lower = more opportunity)
  Trend Sources: ${(product.sources || []).map(s => s.label).join(', ')}
  Tags: ${(product.tags || []).join(', ')}
  First seen trending: ${product.firstSeen || 'recently'}${supplierSection}${competitorSection}

TASK
Generate compelling, conversion-optimised Shopify product listing copy.
Return ONLY valid JSON — no markdown, no explanation, no code fence.

SCHEMA
{
  "title": "Product title (60-80 chars, front-load the keyword, no brand placeholder)",
  "description": "<p>2-3 HTML paragraphs covering what makes this trending, who it's for, and key benefits. Avoid generic filler.</p>",
  "benefits": ["Benefit 1 (customer outcome)", "Benefit 2", "Benefit 3", "Benefit 4", "Benefit 5"],
  "tags": ["tag1", "tag2", "tag3", "tag4", "tag5", "tag6"],
  "metaTitle": "SEO meta title 50-60 chars with primary keyword",
  "metaDescription": "SEO meta description 145-160 chars with a soft call-to-action",
  "variantCopy": "Short description for variant selectors (colour, size, material) — omit if not applicable"
}`;
}

// ─── Supplier Search ──────────────────────────────────────────────────────────
// Requires (at least one):
//   CJDropshipping: CJDROPSHIPPING_EMAIL + CJDROPSHIPPING_PASSWORD
//   AliExpress:     ALIEXPRESS_APP_KEY   + ALIEXPRESS_APP_SECRET

// In-process CJDropshipping token cache
let _cjToken       = null;
let _cjTokenExpiry = 0;

async function getCJToken() {
  if (_cjToken && Date.now() < _cjTokenExpiry) return _cjToken;

  const email    = process.env.CJDROPSHIPPING_EMAIL;
  const password = process.env.CJDROPSHIPPING_PASSWORD;
  if (!email || !password) return null;

  try {
    const res  = await fetch('https://developers.cjdropshipping.com/api2.0/v1/authentication/getAccessToken', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (data.code === 200 && data.data?.accessToken) {
      _cjToken       = data.data.accessToken;
      _cjTokenExpiry = Date.now() + 23 * 60 * 60 * 1000; // 23 h
      return _cjToken;
    }
  } catch { /* fall through */ }
  return null;
}

async function searchCJDropshipping(query) {
  const token = await getCJToken();
  if (!token) return [];

  try {
    const res  = await fetch('https://developers.cjdropshipping.com/api2.0/v1/product/list', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'CJ-Access-Token': token },
      body:    JSON.stringify({ productName: query, pageNum: 1, pageSize: 5 }),
    });
    const data = await res.json();
    if (data.code !== 200) return [];

    return (data.data?.list || []).map((p, i) => ({
      id:         `cj-${p.pid || i}`,
      source:     'cjdropshipping',
      title:      p.productName || query,
      cost:       parseFloat(p.sellPrice || p.variants?.[0]?.variantSellPrice || '0'),
      shipping:   parseFloat(p.shippingTime || '0') > 0 ? 4.99 : 2.99, // estimate
      moq:        parseInt(p.productUnit || '1', 10),
      rating:     parseFloat(p.productRating || '4.5'),
      orderCount: parseInt(p.productSalesNum || '0', 10),
      imageUrl:   p.productImage || null,
      url:        `https://cjdropshipping.com/product/${p.pid}.html`,
    }));
  } catch { return []; }
}

async function searchAliExpress(query) {
  const appKey    = process.env.ALIEXPRESS_APP_KEY;
  const appSecret = process.env.ALIEXPRESS_APP_SECRET;

  if (!appKey || !appSecret) return [];

  // AliExpress Affiliate API — requires HMAC-SHA256 signature
  const crypto = require('crypto');
  const method  = 'aliexpress.affiliate.product.query';
  const params  = {
    app_key:    appKey,
    method,
    timestamp:  new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14),
    format:     'json',
    v:          '2.0',
    keywords:   query,
    page_no:    '1',
    page_size:  '5',
    target_currency: 'USD',
    target_language: 'EN',
  };

  const sorted = Object.keys(params).sort().map(k => `${k}${params[k]}`).join('');
  const sign   = crypto.createHmac('sha256', appSecret).update(appSecret + sorted + appSecret).digest('hex').toUpperCase();
  params.sign  = sign;

  const qs = new URLSearchParams(params).toString();

  try {
    const res  = await fetch(`https://api.taobao.com/router/rest?${qs}`);
    const data = await res.json();
    const products = data?.aliexpress_affiliate_product_query_response?.resp_result?.result?.products?.product || [];

    return products.map((p, i) => ({
      id:         `ae-${p.product_id || i}`,
      source:     'aliexpress',
      title:      p.product_title || query,
      cost:       parseFloat(p.target_sale_price || p.target_original_price || '0'),
      shipping:   parseFloat(p.ship_to_days?.toString() || '0') > 0 ? 3.99 : 1.99,
      moq:        1,
      rating:     parseFloat(p.evaluate_rate?.replace('%', '') || '85') / 20, // convert % to 0-5
      orderCount: parseInt(p.lastest_volume || '0', 10),
      imageUrl:   p.product_main_image_url || null,
      url:        p.promotion_link || `https://www.aliexpress.com/item/${p.product_id}.html`,
    }));
  } catch { return []; }
}

app.get('/api/suppliers/search', async (req, res) => {
  const q        = (req.query.q || '').trim();
  const category = (req.query.category || '').trim();
  if (!q) return res.status(400).json({ error: 'q is required' });

  const hasCJ  = !!(process.env.CJDROPSHIPPING_EMAIL && process.env.CJDROPSHIPPING_PASSWORD);
  const hasAE  = !!(process.env.ALIEXPRESS_APP_KEY  && process.env.ALIEXPRESS_APP_SECRET);

  if (!hasCJ && !hasAE) {
    return res.json({ suppliers: [], unconfigured: true });
  }

  try {
    const searchQuery = category ? `${q} ${category}` : q;
    const [cjResults, aeResults] = await Promise.allSettled([
      hasCJ ? searchCJDropshipping(searchQuery) : Promise.resolve([]),
      hasAE ? searchAliExpress(searchQuery)     : Promise.resolve([]),
    ]);

    const suppliers = [
      ...(cjResults.status === 'fulfilled' ? cjResults.value : []),
      ...(aeResults.status === 'fulfilled' ? aeResults.value : []),
    ]
      .filter(s => s.cost > 0)
      .sort((a, b) => b.orderCount - a.orderCount)
      .slice(0, 6);

    res.json({ suppliers });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Competitor Search (Google Shopping scrape) ───────────────────────────────
// No API key required, but subject to rate limiting / CAPTCHAs.
// Results are scraped from Google Shopping search HTML.
// RISK: Google may block requests; add a caching layer or paid proxy in production.

app.get('/api/competitors/search', async (req, res) => {
  const q        = (req.query.q || '').trim();
  if (!q) return res.status(400).json({ error: 'q is required' });

  try {
    const encoded = encodeURIComponent(q);
    const url     = `https://www.google.com/search?tbm=shop&q=${encoded}&hl=en&gl=US&num=10`;
    const result  = await httpsGet(url, {
      'Accept':          'text/html,application/xhtml+xml',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'identity',
    });

    if (result.status !== 200 || typeof result.body !== 'string') {
      return res.json({ competitors: [], rateLimit: result.status === 429 || result.status === 503 });
    }

    const html        = result.body;
    const competitors = parseGoogleShoppingHTML(html, q);
    res.json({ competitors });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

function parseGoogleShoppingHTML(html, fallbackQuery) {
  const results = [];

  // Schema.org JSON-LD embedded in page
  const jsonLdMatches = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/gi)];
  for (const match of jsonLdMatches) {
    try {
      const schema = JSON.parse(match[1]);
      const items  = Array.isArray(schema) ? schema : schema['@graph'] ? schema['@graph'] : [schema];
      for (const item of items) {
        if (item['@type'] === 'Product' && item.name) {
          const offer = item.offers?.offers?.[0] || item.offers;
          results.push({
            store:    item.brand?.name || extractDomain(item.url || ''),
            title:    item.name,
            price:    offer?.price ? parseFloat(offer.price) : null,
            currency: offer?.priceCurrency || 'USD',
            url:      item.url || '',
            imageUrl: item.image?.url || item.image || null,
            source:   'google_shopping',
          });
        }
      }
    } catch { /* skip malformed */ }
  }

  // Fallback: regex-based title extraction from listing markup
  if (results.length === 0) {
    const titleMatches   = [...html.matchAll(/aria-label="([^"]{10,120})"/g)].map(m => m[1]);
    const priceMatches   = [...html.matchAll(/\$\s*(\d+(?:\.\d{2})?)/g)].map(m => parseFloat(m[1]));
    const merchantMatch  = html.match(/data-merchant="([^"]+)"/);
    const merchant       = merchantMatch ? merchantMatch[1] : extractDomain('');

    titleMatches.slice(0, 8).forEach((title, i) => {
      if (title.toLowerCase().includes(fallbackQuery.toLowerCase().split(' ')[0])) {
        results.push({
          store:    merchant,
          title,
          price:    priceMatches[i] ?? null,
          currency: 'USD',
          url:      '',
          imageUrl: null,
          source:   'google_shopping',
        });
      }
    });
  }

  return results.slice(0, 8);
}

function extractDomain(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); }
  catch { return 'Unknown Store'; }
}

// ─── Static frontend ──────────────────────────────────────────────────────────

const DIST = path.join(__dirname, '..', 'web', 'dist');
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
    process.env.PINTEREST_ACCESS_TOKEN            && 'Pinterest',
    'Google Trends',
    'Amazon Movers',
    'Reddit (proxy)',
    process.env.ANTHROPIC_API_KEY                 && 'AI Copy (Claude)',
    (process.env.CJDROPSHIPPING_EMAIL)            && 'CJDropshipping',
    process.env.ALIEXPRESS_APP_KEY                && 'AliExpress',
    'Google Shopping (competitor scrape)',
    'Shopify (Admin API)',
  ].filter(Boolean);
  console.log(`TRENDZ backend listening on http://localhost:${PORT}`);
  console.log(`Active: ${active.join(', ')}`);
});
