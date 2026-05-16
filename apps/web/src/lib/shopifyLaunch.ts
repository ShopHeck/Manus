import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { TrendProduct, ProductCopy, MarginInputs } from '@/types';
import { storage } from './storage';

export interface LaunchedRecord {
  productId:  string;
  shopifyGid: string;
  adminUrl:   string;
  launchedAt: number;
  copy?:      ProductCopy;
}

interface LaunchStore {
  byProductId: Record<string, LaunchedRecord>;
  record: (r: LaunchedRecord) => void;
}

export const useLaunchStore = create<LaunchStore>()(
  persist(
    (set) => ({
      byProductId: {},
      record: (r) => set(s => ({ byProductId: { ...s.byProductId, [r.productId]: r } })),
    }),
    { name: 'trendz_shopify_launches' },
  ),
);

function descriptionFor(p: TrendProduct): string {
  const sources = p.sources.map(s => s.label).join(', ');
  const tags = p.tags.length ? ` Tags: ${p.tags.map(t => `#${t}`).join(' ')}.` : '';
  return `<p>${escapeHtml(p.name)} is trending across ${sources} with a Viral Score of ${Math.round(p.viralScore.total)} (saturation ${p.saturation.total}).${tags}</p>
<p>Surfaced by Manus on ${new Date().toISOString().slice(0, 10)}. First seen ${p.firstSeen}.</p>`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

export async function launchToShopify(
  product: TrendProduct,
  marginInputs?: MarginInputs,
  copy?: ProductCopy,
): Promise<LaunchedRecord> {
  const backendUrl = storage.get('backendUrl', '');
  const shop       = storage.get('shopifyShop', '');
  const token      = storage.get('shopifyToken', '');

  if (!backendUrl) throw new Error('Backend URL not set in Settings.');
  if (!shop || !token) throw new Error('Shopify shop and token must be set in Settings.');

  const sourceUrl      = Object.values(product.urls).find(Boolean);
  const retailPrice    = marginInputs?.retailPrice ?? product.margin?.retailPrice ?? 29.99;
  const title          = copy?.title          ?? product.name;
  const descriptionHtml= copy?.description    ?? descriptionFor(product);
  const tags           = copy?.tags?.length   ? copy.tags : product.tags;

  const res = await fetch(`${backendUrl}/api/shopify/launch`, {
    method:  'POST',
    headers: {
      'Content-Type':    'application/json',
      'x-shopify-shop':  shop,
      'x-shopify-token': token,
    },
    body: JSON.stringify({
      title,
      descriptionHtml,
      tags,
      productType:     product.category,
      vendor:          'Manus Trends',
      price:           retailPrice.toFixed(2),
      sourceUrl,
      metaTitle:       copy?.metaTitle,
      metaDescription: copy?.metaDescription,
    }),
  });

  const json = await res.json() as { ok?: boolean; productId?: string; adminUrl?: string; error?: string; errors?: unknown };
  if (!res.ok || !json.ok) {
    throw new Error(json.error || `HTTP ${res.status}`);
  }
  return {
    productId:  product.id,
    shopifyGid: json.productId || '',
    adminUrl:   json.adminUrl || '',
    launchedAt: Date.now(),
    copy,
  };
}
