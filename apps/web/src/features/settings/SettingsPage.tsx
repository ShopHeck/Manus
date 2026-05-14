import { useState } from 'react';
import { storage } from '@/lib/storage';
import { Button } from '@/components/Button';
import { toast } from '@/components/Toast';
import styles from './SettingsPage.module.css';

export default function SettingsPage() {
  const [backendUrl, setBackendUrl]   = useState(() => storage.get('backendUrl', ''));
  const [apifyKey,   setApifyKey]     = useState(() => storage.get('apifyApiKey', ''));

  function save() {
    storage.set('backendUrl', backendUrl.trim());
    storage.set('apifyApiKey', apifyKey.trim());
    toast('Settings saved', 'Reload the Discover page to apply.', 'success');
  }

  return (
    <div className={styles.root}>
      <h1 className={styles.title}>Settings</h1>
      <p className={styles.subtitle}>Configure API keys and backend connection.</p>

      <div className={styles.form}>
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Backend</h2>
          <p className={styles.sectionDesc}>
            Run the Express backend locally or deploy to Railway. Required for Google Trends, Amazon Movers & Pinterest.
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
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>TikTok / Apify</h2>
          <p className={styles.sectionDesc}>
            Get a free key at apify.com → Settings → Integrations → API tokens
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
        </section>

        <Button variant="primary" size="lg" onClick={save}>Save Settings</Button>
      </div>
    </div>
  );
}
