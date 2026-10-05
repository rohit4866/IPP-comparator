'use client';
import { useState } from 'react';
import { api } from '@/lib/api';
import { Badge, Err } from '@/components/ui';
import { SOURCE, date, inr } from '@/lib/format';

export default function Compare({ requirementId, deals }: { requirementId: string; deals: any[] }) {
  const [picked, setPicked] = useState<string[]>([]);
  const [res, setRes] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length < 5 ? [...p, id] : p));
  async function run() {
    setError(null);
    try { setRes(await api('/comparator', { method: 'POST', body: { requirement_id: requirementId, deal_ids: picked } })); } catch (e: any) { setError(e.message); setRes(null); }
  }
  const best = res?.best_deal_id;
  const cell = (fn: (r: any) => any) => res.rows.map((r: any) => <td key={r.deal_id} className={r.deal_id === best ? 'best' : ''}>{fn(r)}</td>);
  return (
    <div className="stack">
      <div className="card">
        <h2>Pick 2 to 5 IPPs</h2>
        <div className="row">{deals.map((d) => (
          <label key={d.id} className="chip" style={{ display: 'flex', gap: 6, alignItems: 'center', fontWeight: 500, cursor: 'pointer', padding: '5px 12px' }}>
            <input type="checkbox" style={{ width: 'auto' }} checked={picked.includes(d.id)} onChange={() => toggle(d.id)} />{d.ipp_name}
          </label>))}
          <button className="btn primary" disabled={picked.length < 2} onClick={run}>Compare</button></div>
        <p className="muted small" style={{ marginTop: 8 }}>Uses each IPP's latest submitted round and the {res?.requirement?.state || 'state'} charge table to work out the landed cost.</p>
        <Err msg={error} />
      </div>
      {res && (
        <div className="card scroll" style={{ padding: 0 }}>
          <table>
            <thead><tr><th></th>{res.rows.map((r: any) => <th key={r.deal_id}>{r.ipp_name}{r.deal_id === best && <div className="badge b-verified" style={{ marginLeft: 0 }}>Lowest landed cost</div>}</th>)}</tr></thead>
            <tbody>
              <tr><th>Deal status</th>{cell((r) => <Badge s={r.deal_status} />)}</tr>
              <tr><th>Round used</th>{cell((r) => (r.round_no ? `Round ${r.round_no}` : '–'))}</tr>
              <tr><th>Landed cost (₹/kWh)</th>{cell((r) => <b>{inr(r.cost?.landed)}</b>)}</tr>
              <tr><th>Levelised over tenure</th>{cell((r) => inr(r.cost?.levelised))}</tr>
              <tr><th>Estimated annual cost</th>{cell((r) => (r.cost?.annual_cost != null ? `₹${(r.cost.annual_cost / 1e7).toFixed(2)} Cr` : '–'))}</tr>
              <tr><th>Tariff</th>{cell((r) => inr(r.terms?.tariff))}</tr>
              <tr><th>Wheeling + CSS + transmission</th>{cell((r) => (r.cost ? inr(r.cost.breakdown.wheeling + r.cost.breakdown.css + r.cost.breakdown.transmission) : '–'))}</tr>
              <tr><th>Other charges, banking, premium</th>{cell((r) => (r.cost ? inr(r.cost.breakdown.other_charges + r.cost.breakdown.banking_adjustment + r.cost.breakdown.green_premium) : '–'))}</tr>
              <tr><th>Escalation</th>{cell((r) => (r.terms ? `${r.terms.escalation_pct ?? 0}% / yr` : '–'))}</tr>
              <tr><th>Tenure</th>{cell((r) => (r.terms?.tenure_years ? `${r.terms.tenure_years} years` : '–'))}</tr>
              <tr><th>Capacity offered</th>{cell((r) => (r.terms?.capacity_mw != null ? `${r.terms.capacity_mw} MW` : '–'))}</tr>
              <tr><th>Minimum offtake</th>{cell((r) => (r.terms?.min_offtake_pct != null ? `${r.terms.min_offtake_pct}%` : '–'))}</tr>
              <tr><th>Exit terms</th>{cell((r) => r.terms?.exit_clause || '–')}</tr>
              <tr><th>Payment security</th>{cell((r) => r.terms?.payment_security || '–')}</tr>
              <tr><th>Source</th>{cell((r) => r.sources.map((s: string) => SOURCE[s]).join(', ') || '–')}</tr>
              <tr><th>Average CUF</th>{cell((r) => r.avg_cuf ?? '–')}</tr>
              <tr><th>Credit rating</th>{cell((r) => r.credit_rating || '–')}</tr>
              <tr><th>RECs</th>{cell((r) => (r.terms ? (r.terms.rec_available ? 'Yes' : 'No') : '–'))}</tr>
              <tr><th>Tariff valid until</th>{cell((r) => date(r.terms?.validity_date))}</tr>
              <tr><th>Warnings</th>{cell((r) => (r.warnings.length ? <ul style={{ margin: 0, paddingLeft: 16 }}>{r.warnings.map((w: string) => <li key={w} className="small">{w}</li>)}</ul> : <span className="muted">None</span>))}</tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
