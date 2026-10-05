export const inr = (v: any, d = 2) => (v == null || v === '' ? '–' : `₹${Number(v).toFixed(d)}`);
export const num = (v: any, suffix = '') => (v == null || v === '' ? '–' : `${Number(v).toLocaleString('en-IN')}${suffix}`);
export const date = (v: any) => (v ? new Date(v).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '–');
export const dateTime = (v: any) => (v ? new Date(v).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '–');

export const STATUS: Record<string, string> = {
  under_negotiation: 'Under negotiation', feasible: 'Feasible', locked: 'Locked', closed: 'Closed',
  draft: 'Draft', submitted: 'Submitted', verified: 'Verified', expired: 'Expired', open: 'Open',
};
export const OUTCOME: Record<string, string> = { countered: 'Countered', accepted: 'Accepted', rejected: 'Rejected', on_hold: 'On hold' };
export const SOURCE: Record<string, string> = { solar: 'Solar', wind: 'Wind', hydro: 'Hydro', hybrid: 'Hybrid', storage_backed: 'Storage-backed', biomass: 'Biomass' };

export const FIELD_LABEL: Record<string, string> = {
  tariff: 'Tariff (₹/kWh)', tariff_type: 'Tariff type', escalation_pct: 'Escalation (%/yr)', green_premium: 'Green premium (₹/kWh)',
  tenure_years: 'PPA tenure (years)', min_offtake_pct: 'Minimum offtake (%)', capacity_mw: 'Capacity offered (MW)', validity_date: 'Tariff valid until',
  wheeling: 'Wheeling (₹/kWh)', css: 'Cross-subsidy surcharge (₹/kWh)', transmission: 'Transmission (₹/kWh)', other_charges: 'Other charges (₹/kWh)',
  banking_adjustment: 'Banking adjustment (₹/kWh)', banking_terms: 'Banking terms', exit_clause: 'Exit and penalty clause', lockin_years: 'Lock-in (years)',
  payment_security: 'Payment security', late_payment_terms: 'Late payment terms', rec_available: 'RECs available', co2_avoided_tpa: 'CO₂ avoided (t/yr)',
  margin_pct: 'Margin (%) – internal', credit_risk_notes: 'Credit risk notes – internal',
};
export const fieldValue = (k: string, v: any) =>
  v == null || v === '' ? '–' : typeof v === 'boolean' ? (v ? 'Yes' : 'No') : k === 'validity_date' ? date(v) : String(v);
