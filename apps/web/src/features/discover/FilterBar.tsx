import { Search, X } from 'lucide-react';
import type { DiscoverFilters, SortBy, TimeRange } from '@/types';
import { SAMPLE_CATEGORIES } from '@/data/sample';
import { Button } from '@/components/Button';
import styles from './FilterBar.module.css';

interface FilterBarProps {
  filters: DiscoverFilters;
  onChange: (filters: DiscoverFilters) => void;
}

const SOURCE_OPTIONS = [
  { id: 'tiktok'    as const, label: 'TikTok'   },
  { id: 'reddit'    as const, label: 'Reddit'   },
  { id: 'pinterest' as const, label: 'Pinterest' },
  { id: 'google'    as const, label: 'Google'   },
  { id: 'amazon'    as const, label: 'Amazon'   },
];

const TIME_OPTIONS: { value: TimeRange; label: string }[] = [
  { value: '24h', label: '24h'  },
  { value: '7d',  label: '7 days' },
  { value: '30d', label: '30 days' },
];

const SORT_OPTIONS: { value: SortBy; label: string }[] = [
  { value: 'viralScore', label: 'Viral Score' },
  { value: 'saturation', label: 'Opportunity' },
  { value: 'margin',     label: 'Margin'      },
  { value: 'newest',     label: 'Newest'      },
  { value: 'rank',       label: 'Rank'        },
];

export function FilterBar({ filters, onChange }: FilterBarProps) {
  function set<K extends keyof DiscoverFilters>(key: K, value: DiscoverFilters[K]) {
    onChange({ ...filters, [key]: value });
  }

  function toggleCategory(cat: string) {
    const next = filters.categories.includes(cat)
      ? filters.categories.filter(c => c !== cat)
      : [...filters.categories, cat];
    set('categories', next);
  }

  function toggleSource(id: DiscoverFilters['sources'][number]) {
    const next = filters.sources.includes(id)
      ? filters.sources.filter(s => s !== id)
      : [...filters.sources, id];
    set('sources', next);
  }

  const hasActiveFilters =
    filters.search !== '' ||
    filters.categories.length > 0 ||
    filters.sources.length > 0 ||
    filters.minViralScore > 0 ||
    filters.maxSaturation < 100;

  return (
    <div className={styles.root}>
      {/* Row 1: search + time + sort */}
      <div className={styles.row1}>
        <div className={styles.searchWrap}>
          <Search size={14} className={styles.searchIcon} />
          <input
            type="text"
            className={styles.searchInput}
            placeholder="Search products, tags, categories…"
            value={filters.search}
            onChange={e => set('search', e.target.value)}
          />
          {filters.search && (
            <button className={styles.clearBtn} onClick={() => set('search', '')}><X size={12} /></button>
          )}
        </div>

        <div className={styles.segment}>
          {TIME_OPTIONS.map(o => (
            <button
              key={o.value}
              className={`${styles.segBtn} ${filters.timeRange === o.value ? styles.segActive : ''}`}
              onClick={() => set('timeRange', o.value)}
            >
              {o.label}
            </button>
          ))}
        </div>

        <select
          className={styles.select}
          value={filters.sortBy}
          onChange={e => set('sortBy', e.target.value as SortBy)}
        >
          {SORT_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>

        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onChange(defaultFilters())}
          >
            <X size={12} /> Clear
          </Button>
        )}
      </div>

      {/* Row 2: categories + sources */}
      <div className={styles.row2}>
        <div className={styles.chips}>
          {SAMPLE_CATEGORIES.map(cat => (
            <button
              key={cat}
              className={`${styles.chip} ${filters.categories.includes(cat) ? styles.chipActive : ''}`}
              onClick={() => toggleCategory(cat)}
            >
              {cat}
            </button>
          ))}
        </div>

        <div className={styles.divider} />

        <div className={styles.chips}>
          {SOURCE_OPTIONS.map(s => (
            <button
              key={s.id}
              className={`${styles.chip} ${styles[`chip_${s.id}`]} ${filters.sources.includes(s.id) ? styles.chipSourceActive : ''}`}
              onClick={() => toggleSource(s.id)}
            >
              {s.label}
            </button>
          ))}
        </div>

        <div className={styles.divider} />

        <label className={styles.sliderLabel}>
          <span>Min Viral ≥ {filters.minViralScore}</span>
          <input
            type="range" min={0} max={90} step={5}
            value={filters.minViralScore}
            onChange={e => set('minViralScore', Number(e.target.value))}
            className={styles.range}
          />
        </label>

        <label className={styles.sliderLabel}>
          <span>Max Sat ≤ {filters.maxSaturation}</span>
          <input
            type="range" min={10} max={100} step={5}
            value={filters.maxSaturation}
            onChange={e => set('maxSaturation', Number(e.target.value))}
            className={styles.range}
          />
        </label>
      </div>
    </div>
  );
}

export function defaultFilters(): DiscoverFilters {
  return {
    timeRange:     '7d',
    categories:    [],
    sources:       [],
    minViralScore: 0,
    maxSaturation: 100,
    sortBy:        'viralScore',
    search:        '',
  };
}
