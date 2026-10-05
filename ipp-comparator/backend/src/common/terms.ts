export const TERM_FIELDS = [
  'tariff','tariff_type','escalation_pct','green_premium','tenure_years','min_offtake_pct','capacity_mw',
  'validity_date','wheeling','css','transmission','other_charges','banking_adjustment','banking_terms',
  'exit_clause','lockin_years','payment_security','late_payment_terms','rec_available','co2_avoided_tpa',
  'margin_pct','credit_risk_notes','internal_only_fields',
] as const;

/** Always hidden from GES, regardless of per-round flags. */
export const ALWAYS_INTERNAL = ['margin_pct', 'credit_risk_notes', 'internal_only_fields'];

export const ROUND_FIELDS = [
  'offered_by','negotiation_date','mode','ipp_contact','internal_negotiator','outcome','remarks_shared','remarks_internal',
] as const;

export function pick(src: any, keys: readonly string[]) {
  const out: any = {};
  for (const k of keys) if (src && src[k] !== undefined) out[k] = src[k];
  return out;
}

export function stripTermsForGes(terms: any) {
  if (!terms) return terms;
  const hidden = new Set([...ALWAYS_INTERNAL, ...(terms.internal_only_fields || [])]);
  const out: any = {};
  for (const [k, v] of Object.entries(terms)) if (!hidden.has(k) && k !== 'round_id') out[k] = v;
  return out;
}

export function diffTerms(prev: any, curr: any) {
  const changes: { field: string; from: any; to: any }[] = [];
  if (!curr) return changes;
  for (const f of TERM_FIELDS) {
    if (f === 'internal_only_fields') continue;
    const a = prev ? prev[f] ?? null : null;
    const b = curr[f] ?? null;
    if (JSON.stringify(a) !== JSON.stringify(b) && prev) changes.push({ field: f, from: a, to: b });
  }
  return changes;
}
