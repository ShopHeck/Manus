import { useState } from 'react';
import { Check, X, Loader2 } from 'lucide-react';
import { storage } from '@/lib/storage';
import { Button } from '@/components/Button';
import { toast } from '@/components/Toast';
import styles from './SettingsPage.module.css';

type TestState = 'idle' | 'testing' | 'ok' | 'fail';

export default function SettingsPage() {
  const [backendUrl, setBackendUrl] = useState(() => storage.get('backendUrl', ''));
  const [apifyKey, setApifyKey]     = useState(() => storage.get('apifyApiKey', ''));
  const [shopifyShop, setShopifyShop]   = useState(() => storage.get('shopifyShop', ''));
  const [shopifyToken, setShopifyToken] = useState(() => storage.get('shopifyToken', ''));

  const [backendTest, setBackendTest] = useState<TestState>('idle');
  const [apifyTest, setApifyTest]     = useState<TestState>('idle');
  const [shopifyTest, setShopifyTest] = useState<TestState>('idle');
  const [backendMsg, setBackendMsg]   = useState('');
  const [apifyMsg, setApifyMsg]       = useState('');
  const [shopifyMsg, setShopifyMsg]   = useState('');

  function save() {
    storage.set('backendUrl', backendUrl.trim());
    storage.set('apifyApiKey', apifyKey.trim());
    storage.set('shopifyShop', shopifyShop.trim().replace(/^https?:\/\//, ''));
    storage.set('shopifyToken', shopifyToken.trim());
    toast('Settings saved', 'Reload the Discover page to apply.', 'success');
  }

  async function testShopify() {
    const url   = backendUrl.trim();
    const shop  = shopifyShop.trim().replace(/^https?:\/\//, '');
    const token = shopifyToken.trim();
    if (!url || !shop || !token) {
      setShopifyTest('fail');
      setShopifyMsg('Need Backend URL, Shop, and Token.');
      return;
    }
    setShopifyTest('testing');
    setShopifyMsg('');
    try {
      const res = await fetch(`${url}/api/shopify/health`, {
        headers: {
          'x-shopify-shop':  shop,
          'x-shopify-token': token,
        },
      });
      const json = await res.json() as { ok: boolean; shop?: { name: string } };
      if (!res.ok || !json.ok) throw new Error(`HTTP ${res.status}`);
      setShopifyTest('ok');
      setShopifyMsg(`Connected to ${json.shop?.name || shop}.`);
    } catch (err) {
      setShopifyTest('fail');
      setShopifyMsg(err instanceof Error ? err.message : 'Connection failed');
    }
  }

  async function testBackend() {
    const url = backendUrl.trim();
    if (!url) {
      setBackendTest('fail');
      setBackendMsg('Enter a URL first.');
      return;
    }
    setBackendTest('testing');
    setBackendMsg('');
    try {
      const res = await fetch(`${url}/api/health`);
      const json = await res.json() as { sources?: Record<string, boolean> };
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const live = Object.entries(json.sources || {}).filter(([, v]) => v).map(([k]) => k);
      setBackendTest('ok');
      setBackendMsg(`Reachable. Live: ${live.join(', ') || 'none'}.`);
    } catch (err) {
      setBackendTest('fail');
      setBackendMsg(err instanceof Error ? err.message : 'Connection failed');
    }
  }

  async function testApify() {
    const key = apifyKey.trim();
    if (!key) {
      setApifyTest('fail');
      setApifyMsg('Enter an API key first.');
      return;
    }
    setApifyTest('testing');
    setApifyMsg('');
    try {
      const res = await fetch(`https://api.apify.com/v2/users/me?token=${encodeURIComponent(key)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json() as { data?: { username?: string } };
      setApifyTest('ok');
      setApifyMsg(`Authenticated as ${json.data?.username || 'user'}.`);
    } catch (err) {
      setApifyTest('fail');
      setApifyMsg(err instanceof Error ? err.message : 'Auth failed');
    }
  }

  return (
    <div className={styles.root}>
      <h1 className={styles.title}>Settings</h1>
      <p className={styles.subtitle}>Configure API keys and backend connection.</p>

      <div className={styles.form}>
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Backend</h2>
          <p className={styles.sectionDesc}>
            Run the Express backend locally or deploy to Railway. Required for Google Trends, Amazon Movers, Pinterest, and TikTok.
          </p>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Backend URL</span>
            <input
              className={styles.input}
              type="url"
              placeholder="http://localhost:3001"
              value={backendUrl}
              onChange={e => setBackendUrl(e.target.value)}
            />
            <span className={styles.fieldHint}>e.g. https://manus-production-1732.up.railway.app</span>
          </label>
          <div className={styles.testRow}>
            <Button variant="outline" size="sm" onClick={testBackend} disabled={backendTest === 'testing'}>
              {backendTest === 'testing' ? <Loader2 size={12} className={styles.spin} /> : 'Test connection'}
            </Button>
            {backendTest !== 'idle' && backendTest !== 'testing' && (
              <span className={styles.testResult} data-ok={backendTest === 'ok'}>
                {backendTest === 'ok' ? <Check size={12} /> : <X size={12} />}
                {backendMsg}
              </span>
            )}
          </div>
        </section>

        <section className={styles.section} id="tiktok">
          <h2 className={styles.sectionTitle}>TikTok via Apify</h2>
          <p className={styles.sectionDesc}>
            Get a free key at apify.com, then Settings, Integrations, API tokens.
          </p>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Apify API Key</span>
            <input
              className={styles.input}
              type="password"
              placeholder="apify_api_…"
              value={apifyKey}
              onChange={e => setApifyKey(e.target.value)}
            />
          </label>
          <div className={styles.testRow}>
            <Button variant="outline" size="sm" onClick={testApify} disabled={apifyTest === 'testing'}>
              {apifyTest === 'testing' ? <Loader2 size={12} className={styles.spin} /> : 'Test key'}
            </Button>
            {apifyTest !== 'idle' && apifyTest !== 'testing' && (
              <span className={styles.testResult} data-ok={apifyTest === 'ok'}>
                {apifyTest === 'ok' ? <Check size={12} /> : <X size={12} />}
                {apifyMsg}
              </span>
            )}
          </div>
        </section>

        <section className={styles.section} id="shopify">
          <h2 className={styles.sectionTitle}>Shopify (one-click launch)</h2>
          <p className={styles.sectionDesc}>
            Create a custom app in your Shopify admin (Settings, Apps, Develop apps). Grant <code>write_products</code> and copy the Admin API access token.
          </p>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Shop Domain</span>
            <input
              className={styles.input}
              type="text"
              placeholder="my-store.myshopify.com"
              value={shopifyShop}
              onChange={e => setShopifyShop(e.target.value)}
            />
            <span className={styles.fieldHint}>Without https://, just the myshopify.com subdomain.</span>
          </label>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Admin Access Token</span>
            <input
              className={styles.input}
              type="password"
              placeholder="shpat_…"
              value={shopifyToken}
              onChange={e => setShopifyToken(e.target.value)}
            />
          </label>
          <div className={styles.testRow}>
            <Button variant="outline" size="sm" onClick={testShopify} disabled={shopifyTest === 'testing'}>
              {shopifyTest === 'testing' ? <Loader2 size={12} className={styles.spin} /> : 'Test connection'}
            </Button>
            {shopifyTest !== 'idle' && shopifyTest !== 'testing' && (
              <span className={styles.testResult} data-ok={shopifyTest === 'ok'}>
                {shopifyTest === 'ok' ? <Check size={12} /> : <X size={12} />}
                {shopifyMsg}
              </span>
            )}
          </div>
        </section>

        <Button variant="primary" size="lg" onClick={save}>Save settings</Button>
      </div>
    </div>
  );
}
