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
      reddit:         true,
      pinterest:      !!process.env.PINTEREST_ACCESS_TOKEN,
      google:         true,
      amazon:         true,
      tiktok:         !!apifyHeader || !!process.env.APIFY_API_TOKEN,
      aiCopy:         !!process.env.ANTHROPIC_API_KEY,
      cjDropshipping: !!(process.env.CJDROPSHIPPING_EMAIL && process.env.CJDROPSHIPPING_PASSWORD),
      aliExpress:     !!process.env.ALIEXPRESS_APP_KEY,
      shopify:        true,
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

function parseGoogleTrendsRSS(xml) {
  const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)];
  return items.map(m => {
    const block = m[1];
    const title = (
      block.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/) ||
      block.match(/<title>(.*?)<\/title>/)
    )?.[1] || '';
    const traffic = block.match(/<ht:approx_traffic>(.*?)<\/ht:approx_traffic>/)?.[1] || '';
    const news = [...block.matchAll(/<ht:news_item>([\s\S]*?)<\/ht:news_item>/gi)]
      .slice(0, 2)
      .map(n => {
        const b = n[1];
        const nTitle = (b.match(/<ht:news_item_title><!\[CDATA\[(.*?)\]\]>/) || b.match(/<ht:news_item_title>(.*?)<\/ht:news_item_title>/))?.[1] || '';
        const nUrl   = (b.match(/<ht:news_item_url><!\[CDATA\[(.*?)\]\]>/) || b.match(/<ht:news_item_url>(.*?)<\/ht:news_item_url>/))?.[1] || '';
        return { title: nTitle, url: nUrl };
      });
    return { keyword: title, traffic, articles: news, relatedQueries: [] };
  }).filter(t => t.keyword);
}

app.get('/api/google-trends', async (req, res) => {
  const geo = req.query.geo || 'US';

  // Primary: RSS feed (no auth, more reliable)
  try {
    const rssResult = await httpsGet(
      `https://trends.google.com/trending/rss?geo=${geo}`,
      { Accept: 'application/rss+xml, text/xml, */*' },
    );
    if (rssResult.status === 200 && typeof rssResult.body === 'string') {
      const trends = parseGoogleTrendsRSS(rssResult.body).slice(0, 30);
      if (trends.length > 0) return res.json({ source: 'google_trends', geo, trends });
    }
  } catch { /* fall through */ }

  // Fallback: unofficial JSON API
  try {
    const url = `https://trends.google.com/trends/api/dailytrends?hl=en-US&tz=-300&geo=${geo}&ns=15`;
    const result = await httpsGet(url);

    const raw = typeof result.body === 'string'
      ? result.body.replace(/^\)\]\}',\n/, '')
      : JSON.stringify(result.body);

    let parsed;
    try { parsed = JSON.parse(raw); }
    catch { return res.status(502).json({ error: 'Could not reach Google Trends — try again later' }); }

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

    // Map each ASIN to the nearest Amazon CDN image by character position in the HTML.
    // Using proximity instead of parallel-array indexing avoids misalignment caused by
    // non-product images (nav icons, ads) or multiple size variants per product.
    const asinPositions = [...html.matchAll(/\/dp\/([A-Z0-9]{10})/g)]
      .map(m => ({ pos: m.index, asin: m[1] }));

    const imgIdSeen = new Set();
    const imgPositions = [...html.matchAll(/https:\/\/m\.media-amazon\.com\/images\/I\/[A-Za-z0-9\-_+%.]+\._AC_[^"']{1,80}\.(?:jpg|png|webp)/g)]
      .map(m => ({ pos: m.index, url: m[0], id: m[0].match(/\/images\/I\/([^.]+)/)?.[1] }))
      .filter(({ id }) => {
        if (!id || imgIdSeen.has(id)) return false;
        imgIdSeen.add(id);
        return true;
      });

    const asinToImage = new Map();
    for (const { pos, asin } of asinPositions) {
      if (asinToImage.has(asin)) continue;
      let closest = null, closestDist = Infinity;
      for (const img of imgPositions) {
        const dist = Math.abs(img.pos - pos);
        if (dist < closestDist) { closestDist = dist; closest = img; }
      }
      asinToImage.set(asin, closest?.url ?? null);
    }

    const products = [...new Set(asinMatches)].slice(0, 20).map((asin, i) => ({
      name:     names[i] || `Product ${i + 1}`,
      asin,
      url:      `https://www.amazon.com/dp/${asin}`,
      rank:     i + 1,
      imageUrl: asinToImage.get(asin) ?? null,
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

// ─── Image Search ─────────────────────────────────────────────────────────────
// Returns a topically relevant product image URL using Pexels or Unsplash APIs.
// Falls back gracefully if neither key is configured.

app.get('/api/image-search', async (req, res) => {
  const query = String(req.query.q || '').slice(0, 120).trim();
  if (!query) return res.json({ url: null, source: 'none' });

  const pexelsKey  = process.env.PEXELS_API_KEY;
  const unsplashKey = process.env.UNSPLASH_ACCESS_KEY;

  if (pexelsKey) {
    try {
      const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=3&orientation=landscape`;
      const result = await httpsGet(url, { Authorization: pexelsKey });
      const photo = result.body?.photos?.[0];
      if (photo?.src?.medium) {
        return res.json({ url: photo.src.medium, source: 'pexels' });
      }
    } catch (_) { /* fall through to next provider */ }
  }

  if (unsplashKey) {
    try {
      const url = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=1&orientation=landscape`;
      const result = await httpsGet(url, { Authorization: `Client-ID ${unsplashKey}` });
      const photo = result.body?.results?.[0];
      if (photo?.urls?.regular) {
        return res.json({ url: photo.urls.regular, source: 'unsplash' });
      }
    } catch (_) { /* fall through */ }
  }

  // No keys configured or all requests failed
  res.json({ url: null, source: 'none' });
});

// ─── Shopify helpers ──────────────────────────────────────────────────────────

function isValidShopifyDomain(shop) {
  return typeof shop === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9-]*\.myshopify\.com$/.test(shop);
}

// ─── Shopify launch ───────────────────────────────────────────────────────────

app.post('/api/shopify/launch', async (req, res) => {
  const shopDomain   = req.get('x-shopify-shop')  || process.env.SHOPIFY_SHOP_DOMAIN;
  const accessToken  = req.get('x-shopify-token') || process.env.SHOPIFY_ADMIN_TOKEN;

  if (!shopDomain || !accessToken) {
    return res.status(503).json({ error: 'Shopify not configured. Set Shop Domain and Admin Access Token in Settings.' });
  }
  const cleanDomain = shopDomain.replace(/^https?:\/\//, '');
  if (!isValidShopifyDomain(cleanDomain)) {
    return res.status(400).json({ error: 'Invalid Shopify shop domain — must end with .myshopify.com' });
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
    const url = `https://${cleanDomain}/admin/api/2024-10/graphql.json`;
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
    const adminUrl = `https://${cleanDomain}/admin/products/${numeric}`;

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
  const cleanDomain = shopDomain.replace(/^https?:\/\//, '');
  if (!isValidShopifyDomain(cleanDomain)) {
    return res.status(400).json({ ok: false, error: 'Invalid Shopify shop domain — must end with .myshopify.com' });
  }

  try {
    const url = `https://${cleanDomain}/admin/api/2024-10/graphql.json`;
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

// ─── AI Copy Generation ───────────────────────────────────────────────────────

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
    const response = await httpsRequest('POST', 'https://api.anthropic.com/v1/messages', {
      'Content-Type':      'application/json',
      'x-api-key':         apiKey,
      'anthropic-version': '2023-06-01',
    }, { model, max_tokens: 1800, messages: [{ role: 'user', content: prompt }] });

    if (response.status !== 200) {
      return res.status(502).json({ error: `Claude API error: ${response.status}` });
    }

    const text = response.body?.content?.[0]?.text ?? '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return res.status(502).json({ error: 'Claude did not return valid JSON copy' });

    let raw;
    try { raw = JSON.parse(jsonMatch[0]); }
    catch { return res.status(502).json({ error: 'Failed to parse Claude response as JSON' }); }

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
    ? `\nVerified supplier: ${supplier.source === 'cjdropshipping' ? 'CJDropshipping' : 'AliExpress'}, cost $${Number(supplier.cost).toFixed(2)}, shipping ~$${Number(supplier.shipping).toFixed(2)}`
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
  "description": "<p>2-3 HTML paragraphs covering what makes this trending, who it's for, and key benefits.</p>",
  "benefits": ["Benefit 1 (customer outcome)", "Benefit 2", "Benefit 3", "Benefit 4", "Benefit 5"],
  "tags": ["tag1", "tag2", "tag3", "tag4", "tag5", "tag6"],
  "metaTitle": "SEO meta title 50-60 chars with primary keyword",
  "metaDescription": "SEO meta description 145-160 chars with a soft call-to-action",
  "variantCopy": "Short description for variant selectors — omit if not applicable"
}`;
}

// ─── Supplier Search ──────────────────────────────────────────────────────────

let _cjToken       = null;
let _cjTokenExpiry = 0;

async function getCJToken() {
  if (_cjToken && Date.now() < _cjTokenExpiry) return _cjToken;
  const email    = process.env.CJDROPSHIPPING_EMAIL;
  const password = process.env.CJDROPSHIPPING_PASSWORD;
  if (!email || !password) return null;
  try {
    const res = await httpsRequest('POST', 'https://developers.cjdropshipping.com/api2.0/v1/authentication/getAccessToken',
      { 'Content-Type': 'application/json' }, { email, password });
    if (res.body?.code === 200 && res.body?.data?.accessToken) {
      _cjToken       = res.body.data.accessToken;
      _cjTokenExpiry = Date.now() + 23 * 60 * 60 * 1000;
      return _cjToken;
    }
  } catch { /* fall through */ }
  return null;
}

async function searchCJDropshipping(query) {
  const token = await getCJToken();
  if (!token) return [];
  try {
    const res = await httpsRequest('POST', 'https://developers.cjdropshipping.com/api2.0/v1/product/list',
      { 'Content-Type': 'application/json', 'CJ-Access-Token': token },
      { productName: query, pageNum: 1, pageSize: 5 });
    if (res.body?.code !== 200) return [];
    return (res.body?.data?.list || []).map((p, i) => ({
      id:         `cj-${p.pid || i}`,
      source:     'cjdropshipping',
      title:      p.productName || query,
      cost:       parseFloat(p.sellPrice || p.variants?.[0]?.variantSellPrice || '0'),
      shipping:   parseFloat(p.shippingTime || '0') > 0 ? 4.99 : 2.99,
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
  const crypto = require('crypto');
  const params = {
    app_key: appKey, method: 'aliexpress.affiliate.product.query',
    timestamp: new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14),
    format: 'json', v: '2.0', keywords: query,
    page_no: '1', page_size: '5', target_currency: 'USD', target_language: 'EN',
  };
  const sorted = Object.keys(params).sort().map(k => `${k}${params[k]}`).join('');
  params.sign  = crypto.createHmac('sha256', appSecret).update(appSecret + sorted + appSecret).digest('hex').toUpperCase();
  try {
    const res  = await httpsGet(`https://api.taobao.com/router/rest?${new URLSearchParams(params)}`);
    const products = res.body?.aliexpress_affiliate_product_query_response?.resp_result?.result?.products?.product || [];
    return products.map((p, i) => ({
      id:         `ae-${p.product_id || i}`,
      source:     'aliexpress',
      title:      p.product_title || query,
      cost:       parseFloat(p.target_sale_price || p.target_original_price || '0'),
      shipping:   3.99,
      moq:        1,
      rating:     parseFloat(p.evaluate_rate?.replace('%', '') || '85') / 20,
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

  const hasCJ = !!(process.env.CJDROPSHIPPING_EMAIL && process.env.CJDROPSHIPPING_PASSWORD);
  const hasAE = !!(process.env.ALIEXPRESS_APP_KEY  && process.env.ALIEXPRESS_APP_SECRET);

  if (!hasCJ && !hasAE) return res.json({ suppliers: [], unconfigured: true });

  try {
    const searchQuery = category ? `${q} ${category}` : q;
    const [cj, ae] = await Promise.allSettled([
      hasCJ ? searchCJDropshipping(searchQuery) : Promise.resolve([]),
      hasAE ? searchAliExpress(searchQuery)     : Promise.resolve([]),
    ]);
    const suppliers = [
      ...(cj.status === 'fulfilled' ? cj.value : []),
      ...(ae.status === 'fulfilled' ? ae.value : []),
    ].filter(s => s.cost > 0).sort((a, b) => b.orderCount - a.orderCount).slice(0, 6);
    res.json({ suppliers });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Competitor Search (Google Shopping) ─────────────────────────────────────

app.get('/api/competitors/search', async (req, res) => {
  const q = (req.query.q || '').trim();
  if (!q) return res.status(400).json({ error: 'q is required' });

  try {
    const url    = `https://www.google.com/search?tbm=shop&q=${encodeURIComponent(q)}&hl=en&gl=US&num=10`;
    const result = await httpsGet(url, {
      'Accept':          'text/html,application/xhtml+xml',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'identity',
    });

    if (result.status !== 200 || typeof result.body !== 'string') {
      return res.json({ competitors: [], rateLimit: result.status === 429 || result.status === 503 });
    }

    const competitors = parseGoogleShoppingHTML(result.body, q);
    res.json({ competitors });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

function parseGoogleShoppingHTML(html, fallbackQuery) {
  const results = [];
  const jsonLdMatches = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/gi)];
  for (const match of jsonLdMatches) {
    try {
      const schema = JSON.parse(match[1]);
      const items  = Array.isArray(schema) ? schema : schema['@graph'] ? schema['@graph'] : [schema];
      for (const item of items) {
        if (item['@type'] === 'Product' && item.name) {
          const offer = item.offers?.offers?.[0] || item.offers;
          results.push({
            store:    item.brand?.name || extractShopDomain(item.url || ''),
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

  if (results.length === 0) {
    const titleMatches = [...html.matchAll(/aria-label="([^"]{10,120})"/g)].map(m => m[1]);
    const priceMatches = [...html.matchAll(/\$\s*(\d+(?:\.\d{2})?)/g)].map(m => parseFloat(m[1]));
    const keyword      = fallbackQuery.split(' ')[0].toLowerCase();
    titleMatches.slice(0, 8).forEach((title, i) => {
      if (title.toLowerCase().includes(keyword)) {
        results.push({ store: 'Unknown', title, price: priceMatches[i] ?? null, currency: 'USD', url: '', imageUrl: null, source: 'google_shopping' });
      }
    });
  }

  return results.slice(0, 8);
}

function extractShopDomain(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); }
  catch { return 'Unknown Store'; }
}

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
    'Google Trends (RSS)',
    'Amazon Movers',
    'Reddit (proxy)',
    process.env.PINTEREST_ACCESS_TOKEN && 'Pinterest',
    process.env.APIFY_API_TOKEN        && 'TikTok (Apify)',
    process.env.ANTHROPIC_API_KEY      && 'AI Copy (Claude)',
    process.env.CJDROPSHIPPING_EMAIL   && 'CJDropshipping',
    process.env.ALIEXPRESS_APP_KEY     && 'AliExpress',
    'Google Shopping (competitor scrape)',
    'Shopify (Admin API)',
  ].filter(Boolean);
  console.log(`TRENDZ backend listening on http://localhost:${PORT}`);
  console.log(`Active: ${active.join(', ')}`);
});
