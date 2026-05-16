import { useState } from 'react';
import { Sparkles, RefreshCw, Loader2, Copy, Check } from 'lucide-react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { TrendProduct, ProductCopy, CompetitorProduct, SupplierCandidate } from '@/types';
import { Button } from '@/components/Button';
import { storage } from '@/lib/storage';
import { toast } from '@/components/Toast';
import styles from './CopyGenerator.module.css';

// ── Copy store (persists generated copy per product) ──────────────────────────

interface CopyStore {
  byProductId: Record<string, ProductCopy>;
  save: (productId: string, copy: ProductCopy) => void;
  get:  (productId: string) => ProductCopy | undefined;
  clear:(productId: string) => void;
}

export const useCopyStore = create<CopyStore>()(
  persist(
    (set, get) => ({
      byProductId: {},
      save: (id, copy) => set(s => ({ byProductId: { ...s.byProductId, [id]: copy } })),
      get:  (id) => get().byProductId[id],
      clear:(id) => set(s => {
        const next = { ...s.byProductId };
        delete next[id];
        return { byProductId: next };
      }),
    }),
    { name: 'trendz_copy_v1' },
  ),
);

// ── Component ─────────────────────────────────────────────────────────────────

interface CopyGeneratorProps {
  product:     TrendProduct;
  competitors: CompetitorProduct[];
  supplier:    SupplierCandidate | null;
}

export function CopyGenerator({ product, competitors, supplier }: CopyGeneratorProps) {
  const savedCopy = useCopyStore(s => s.byProductId[product.id]);
  const save      = useCopyStore(s => s.save);

  const [copy, setCopy]       = useState<ProductCopy | null>(savedCopy ?? null);
  const [busy, setBusy]       = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const [copied, setCopied]   = useState<string | null>(null);

  async function generate() {
    const backendUrl = storage.get('backendUrl', '');
    if (!backendUrl) {
      setError('Backend URL not set in Settings.');
      return;
    }

    setBusy(true);
    setError(null);

    try {
      const res = await fetch(`${backendUrl}/api/ai/generate-copy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product, competitors, supplier }),
      });

      const json = await res.json() as { ok?: boolean; copy?: ProductCopy; error?: string };
      if (!res.ok || !json.ok) throw new Error(json.error || `HTTP ${res.status}`);

      const generated = json.copy!;
      setCopy(generated);
      save(product.id, generated);
      toast('Copy generated', 'Review and edit before launching.', 'success');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setError(msg);
      toast('Copy generation failed', msg, 'danger');
    } finally {
      setBusy(false);
    }
  }

  function update<K extends keyof ProductCopy>(key: K, value: ProductCopy[K]) {
    if (!copy) return;
    const next = { ...copy, [key]: value };
    setCopy(next);
    save(product.id, next);
  }

  function updateBenefit(i: number, value: string) {
    if (!copy) return;
    const benefits = [...copy.benefits];
    benefits[i] = value;
    update('benefits', benefits);
  }

  function updateTag(i: number, value: string) {
    if (!copy) return;
    const tags = [...copy.tags];
    tags[i] = value;
    update('tags', tags);
  }

  async function copyToClipboard(text: string, key: string) {
    await navigator.clipboard.writeText(text).catch(() => {});
    setCopied(key);
    setTimeout(() => setCopied(null), 1500);
  }

  if (!copy) {
    return (
      <div className={styles.empty}>
        <Sparkles size={28} className={styles.emptyIcon} />
        <p className={styles.emptyTitle}>Generate AI-powered copy</p>
        <p className={styles.emptyDesc}>
          Claude will write a Shopify-ready title, description, benefits, SEO tags, and meta copy
          using this product's trend data{competitors.length ? ', competitor context' : ''}{supplier ? ', and supplier info' : ''}.
        </p>
        {error && <p className={styles.errorMsg}>{error}</p>}
        <Button variant="primary" size="md" onClick={generate} disabled={busy}>
          {busy ? <Loader2 size={14} className={styles.spin} /> : <Sparkles size={14} />}
          {busy ? 'Generating…' : 'Generate Copy'}
        </Button>
      </div>
    );
  }

  return (
    <div className={styles.root}>
      <div className={styles.toolbar}>
        <span className={styles.toolbarLabel}>AI-generated copy — edit before publishing</span>
        <Button variant="ghost" size="sm" onClick={generate} disabled={busy} title="Regenerate">
          {busy ? <Loader2 size={12} className={styles.spin} /> : <RefreshCw size={12} />}
          Regenerate
        </Button>
      </div>

      {error && <p className={styles.errorMsg}>{error}</p>}

      {/* Title */}
      <Field label="Product Title" onCopy={() => copyToClipboard(copy.title, 'title')} copied={copied === 'title'}>
        <textarea
          className={styles.textarea}
          rows={2}
          value={copy.title}
          onChange={e => update('title', e.target.value)}
        />
        <CharCount text={copy.title} max={255} />
      </Field>

      {/* Description */}
      <Field label="Description (HTML)" onCopy={() => copyToClipboard(copy.description, 'desc')} copied={copied === 'desc'}>
        <textarea
          className={styles.textarea}
          rows={6}
          value={copy.description}
          onChange={e => update('description', e.target.value)}
        />
      </Field>

      {/* Benefits */}
      <Field label="Key Benefits">
        <div className={styles.bulletList}>
          {copy.benefits.map((b, i) => (
            <div key={i} className={styles.bulletRow}>
              <span className={styles.bulletDot}>•</span>
              <input
                className={styles.bulletInput}
                value={b}
                onChange={e => updateBenefit(i, e.target.value)}
              />
            </div>
          ))}
        </div>
      </Field>

      {/* Tags */}
      <Field label="Tags">
        <div className={styles.tagRow}>
          {copy.tags.map((t, i) => (
            <input
              key={i}
              className={styles.tagInput}
              value={t}
              onChange={e => updateTag(i, e.target.value)}
            />
          ))}
        </div>
      </Field>

      {/* SEO */}
      <Field label="Meta Title" onCopy={() => copyToClipboard(copy.metaTitle, 'mt')} copied={copied === 'mt'}>
        <input
          className={styles.input}
          value={copy.metaTitle}
          onChange={e => update('metaTitle', e.target.value)}
        />
        <CharCount text={copy.metaTitle} max={60} />
      </Field>

      <Field label="Meta Description" onCopy={() => copyToClipboard(copy.metaDescription, 'md')} copied={copied === 'md'}>
        <textarea
          className={styles.textarea}
          rows={3}
          value={copy.metaDescription}
          onChange={e => update('metaDescription', e.target.value)}
        />
        <CharCount text={copy.metaDescription} max={160} />
      </Field>

      {copy.variantCopy && (
        <Field label="Variant Copy">
          <input
            className={styles.input}
            value={copy.variantCopy}
            onChange={e => update('variantCopy', e.target.value)}
          />
        </Field>
      )}
    </div>
  );
}

function Field({ label, children, onCopy, copied }: {
  label: string;
  children: React.ReactNode;
  onCopy?: () => void;
  copied?: boolean;
}) {
  return (
    <div className={styles.field}>
      <div className={styles.fieldHeader}>
        <span className={styles.fieldLabel}>{label}</span>
        {onCopy && (
          <button className={styles.copyBtn} onClick={onCopy} title="Copy to clipboard">
            {copied ? <Check size={11} /> : <Copy size={11} />}
          </button>
        )}
      </div>
      {children}
    </div>
  );
}

function CharCount({ text, max }: { text: string; max: number }) {
  const len = text.length;
  const over = len > max;
  return (
    <span className={styles.charCount} data-over={over}>
      {len}/{max}
    </span>
  );
}
