export interface SourceBadge {
  id: 'reddit' | 'tiktok' | 'pinterest' | 'google' | 'amazon';
  label: string;
}

export interface ViralScoreBreakdown {
  tiktok:    number; // 0-100 contribution
  reddit:    number;
  pinterest: number;
  google:    number;
  amazon:    number;
  total:     number; // weighted composite 0-100
}

export interface SaturationBreakdown {
  storeCount:     number; // 0-100 proxy
  adDensity:      number; // 0-100 proxy
  sentimentScore: number; // 0-100 (100 = all positive)
  total:          number; // 0-100 (higher = more saturated)
}

export interface MarginInputs {
  cogs:          number; // $ per unit
  shipping:      number; // $ per unit
  adCpm:         number; // $ per 1000 impressions
  platformFee:   number; // fraction e.g. 0.029
  platformFixed: number; // $ fixed per order e.g. 0.30
  retailPrice:   number; // $ selling price
}

export interface MarginResult {
  grossMargin:     number; // $
  grossMarginPct:  number; // 0-100
  netMargin:       number; // $
  netMarginPct:    number; // 0-100
  breakEvenUnits:  number;
}

export interface TrendProduct {
  id:           string;
  name:         string;
  category:     string;
  imageUrl:     string | null;
  tags:         string[];
  sources:      SourceBadge[];
  viralScore:   ViralScoreBreakdown;
  saturation:   SaturationBreakdown;
  margin:       MarginInputs | null;
  rank:         number;
  rankDelta:    number; // positive = climbed
  firstSeen:    string; // ISO date
  urls: {
    reddit?:    string;
    tiktok?:    string;
    pinterest?: string;
    google?:    string;
    amazon?:    string;
  };
}

export interface RedditPost {
  title:      string;
  score:      number;
  numComments: number;
  url:        string;
  permalink:  string;
  createdUtc: number;
  thumbnail:  string | null;
  subreddit:  string;
}

export interface ApifyTikTok {
  hashtag:   string;
  postCount: number;
  views:     number;
}

export interface AlertRule {
  id:         string;
  productId:  string | null; // null = global
  metric:     'viralScore' | 'saturation' | 'newSource';
  operator:   'gte' | 'lte' | 'new';
  threshold:  number;
  enabled:    boolean;
  createdAt:  string;
}

export interface AlertEvent {
  id:        string;
  ruleId:    string;
  productId: string;
  message:   string;
  value:     number;
  firedAt:   string;
  read:      boolean;
}

export type TimeRange = '24h' | '7d' | '30d';
export type SortBy = 'viralScore' | 'saturation' | 'margin' | 'newest' | 'rank';

export interface DiscoverFilters {
  timeRange:    TimeRange;
  categories:   string[];
  sources:      SourceBadge['id'][];
  minViralScore: number;
  maxSaturation: number;
  sortBy:        SortBy;
  search:        string;
}
