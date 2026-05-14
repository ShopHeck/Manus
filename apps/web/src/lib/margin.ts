import type { MarginInputs, MarginResult } from '@/types';

export const CATEGORY_CPM: Record<string, number> = {
  beauty:      14,
  fashion:      9,
  electronics: 11,
  health:      12,
  kitchen:      8,
  toys:         7,
  sports:       9,
  home:         8,
  default:     10,
};

export function computeMargin(inputs: MarginInputs): MarginResult {
  const { cogs, shipping, adCpm, platformFee, platformFixed, retailPrice } = inputs;

  const adCostPerUnit = adCpm / 1000 * 2; // assume 1 conversion per 2 impressions as rough default
  const platformCost  = retailPrice * platformFee + platformFixed;
  const totalCost     = cogs + shipping + adCostPerUnit + platformCost;

  const grossMargin    = retailPrice - cogs - shipping;
  const grossMarginPct = retailPrice > 0 ? (grossMargin / retailPrice) * 100 : 0;
  const netMargin      = retailPrice - totalCost;
  const netMarginPct   = retailPrice > 0 ? (netMargin / retailPrice) * 100 : 0;

  const fixedOverhead  = 100; // default monthly fixed cost proxy
  const breakEvenUnits = netMargin > 0 ? Math.ceil(fixedOverhead / netMargin) : Infinity;

  return {
    grossMargin:    Math.round(grossMargin    * 100) / 100,
    grossMarginPct: Math.round(grossMarginPct * 10)  / 10,
    netMargin:      Math.round(netMargin      * 100) / 100,
    netMarginPct:   Math.round(netMarginPct   * 10)  / 10,
    breakEvenUnits: isFinite(breakEvenUnits) ? breakEvenUnits : 9999,
  };
}

export function defaultMarginInputs(category = 'default', retailPrice = 39.99): MarginInputs {
  return {
    cogs:          retailPrice * 0.2,
    shipping:      4.99,
    adCpm:         CATEGORY_CPM[category] ?? CATEGORY_CPM.default,
    platformFee:   0.029,
    platformFixed: 0.30,
    retailPrice,
  };
}
