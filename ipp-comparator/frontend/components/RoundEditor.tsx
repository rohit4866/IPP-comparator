'use client';
import { useState } from 'react';
import { api } from '@/lib/api';
import { Err, Field } from '@/components/ui';
import { FIELD_LABEL } from '@/lib/format';

const NUM = ['tariff', 'escalation_pct', 'green_premium', 'tenure_years', 'min_offtake_pct', 'capacity_mw', 'wheeling', 'css', 'transmission', 'other_charges', 'banking_adjustment', 'lockin_years', 'co2_avoided_tpa', 'margin_pct'];
const CHARGES = ['wheeling', 'css', 'transmission', 'other_charges', 'banking_adjustment'];
const TEXT = ['banking_terms', 'exit_clause', 'payment_security', 'late_payment_terms', 'credit_risk_notes'];
const INTERNAL_ONLY = ['margin_pct', 'credit_risk_notes'];

export default function RoundEditor({ round, onChange }: { round: any; onChange: () => void }) {
  const [r, setR] = useState<any>({
    offered_by: round.offered_by, negotiation_date: round.negotiation_date?.slice(0, 10), mode: round.mode, ipp_contact: round.ipp_contact || '',
    internal_negotiator: round.internal_negotiator || '', outcome: round.outcome || '', remarks_shared: round.remarks_shared || '', remarks_internal: round.remarks_internal || '',
  });
  const [t, setT] = useState<any>({ ...round.terms });
  const [hidden, setHidden] = useState<string[]>(round.terms?.internal_only_fields || []);
  const [att, setAtt] = useState({ title: '', url: '', visibility: 'internal' });
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const body = () => {
    const terms: any = {};
    for (const k of [...NUM, ...TEXT, 'tariff_type', 'validity_date', 'rec_available']) {
      let v = t[k];
      if (NUM.includes(k)) v = v === '' || v == null ? null : Number(v);
      if (k === 'validity_date' && v) v = String(v).slice(0, 10);
      if (v === '') v = null;
      terms[k] = v;
    }
    terms.internal_only_fields = hidden;
    return { ...r, outcome: r.outcome || null, terms };
  };
  async function run(fn: () => Promise<any>, ok?: string) {
    setBusy(true); setError(null); setMsg(null);
    try { await fn(); if (ok) setMsg(ok); } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  }
  const save = () => run(() => api(`/rounds/${round.id}`, { method: 'PATCH', body: body() }), 'Draft saved');
  const submit = () => {
    if (!confirm(`Submit Round ${round.round_no}? Once submitted it is frozen permanently and the subscriber can see it.`)) return;
    run(async () => { await api(`/rounds/${round.id}`, { method: 'PATCH', body: body() }); await api(`/rounds/${round.id}/submit`, { method: 'POST' }); onChange(); });
  };
  const remove = () => { if (confirm('Delete this draft?')) run(async () => { await api(`/rounds/${round.id}`, { method: 'DELETE' }); onChange(); }); };
  const attach = () => run(async () => { await api(`/rounds/${round.id}/attachments`, { method: 'POST', body: att }); setAtt({ title: '', url: '', visibility: 'internal' }); onChange(); });
  const tf = (k: string) => (
    <Field key={k} label={FIELD_LABEL[k]}>
      <input type={NUM.includes(k) ? 'number' : 'text'} step="any" value={t[k] ?? ''} onChange={(e) => setT({ ...t, [k]: e.target.value })} placeholder={CHARGES.includes(k) ? 'Blank = state default' : ''} />
      {!INTERNAL_ONLY.includes(k) && <label style={{ fontWeight: 400, marginTop: 4, display: 'flex', gap: 6, alignItems: 'center' }}>
        <input type="checkbox" style={{ width: 'auto' }} checked={hidden.includes(k)} onChange={(e) => setHidden(e.target.checked ? [...hidden, k] : hidden.filter((x) => x !== k))} />Hide from subscriber</label>}
    </Field>
  );

  return (
    <div className="stack">
      <Err msg={error} />{msg && <div className="alert ok">{msg}</div>}
      <p className="muted small">Pre-filled from the previous round. Change only what was negotiated. Submitting freezes this round for good.</p>
      <h3>Round details</h3>
      <div className="form">
        <Field label="Offered by"><select value={r.offered_by} onChange={(e) => setR({ ...r, offered_by: e.target.value })}><option value="ipp">IPP side</option><option value="us">Our side</option></select></Field>
        <Field label="Date"><input type="date" value={r.negotiation_date} onChange={(e) => setR({ ...r, negotiation_date: e.target.value })} /></Field>
        <Field label="Mode"><select value={r.mode} onChange={(e) => setR({ ...r, mode: e.target.value })}><option value="call">Call</option><option value="meeting">Meeting</option><option value="email">Email</option><option value="other">Other</option></select></Field>
        <Field label="Outcome"><select value={r.outcome} onChange={(e) => setR({ ...r, outcome: e.target.value })}><option value="">Choose…</option><option value="countered">Countered</option><option value="accepted">Accepted</option><option value="rejected">Rejected</option><option value="on_hold">On hold</option></select></Field>
        <Field label="IPP contact spoken to"><input value={r.ipp_contact} onChange={(e) => setR({ ...r, ipp_contact: e.target.value })} /></Field>
        <Field label="Our negotiator"><input value={r.internal_negotiator} onChange={(e) => setR({ ...r, internal_negotiator: e.target.value })} /></Field>
        <Field label="Reason for change (shared with subscriber)" wide><textarea value={r.remarks_shared} onChange={(e) => setR({ ...r, remarks_shared: e.target.value })} /></Field>
        <Field label="Internal remarks (never shown to subscriber)" wide><textarea value={r.remarks_internal} onChange={(e) => setR({ ...r, remarks_internal: e.target.value })} /></Field>
      </div>
      <h3>Price and tenure</h3>
      <div className="form">
        {tf('tariff')}
        <Field label={FIELD_LABEL.tariff_type}><select value={t.tariff_type || 'fixed'} onChange={(e) => setT({ ...t, tariff_type: e.target.value })}><option value="fixed">Fixed</option><option value="variable">Variable</option></select></Field>
        {['escalation_pct', 'green_premium', 'tenure_years', 'min_offtake_pct', 'capacity_mw'].map(tf)}
        <Field label={FIELD_LABEL.validity_date}><input type="date" value={(t.validity_date || '').slice(0, 10)} onChange={(e) => setT({ ...t, validity_date: e.target.value })} /></Field>
      </div>
      <h3>Charges</h3>
      <div className="form">{CHARGES.map(tf)}{tf('banking_terms')}</div>
      <h3>Risk and credentials</h3>
      <div className="form">
        {tf('exit_clause')}{tf('lockin_years')}{tf('payment_security')}{tf('late_payment_terms')}
        <Field label={FIELD_LABEL.rec_available}><select value={t.rec_available ? 'y' : 'n'} onChange={(e) => setT({ ...t, rec_available: e.target.value === 'y' })}><option value="y">Yes</option><option value="n">No</option></select></Field>
        {tf('co2_avoided_tpa')}
      </div>
      <h3>Internal only</h3>
      <div className="form">{tf('margin_pct')}{tf('credit_risk_notes')}</div>
      <h3>Attachments (links)</h3>
      {round.attachments?.map((a: any) => <p key={a.id} className="small"><a href={a.url} target="_blank" rel="noreferrer">{a.title}</a> <span className="muted">({a.visibility})</span></p>)}
      <div className="form">
        <Field label="Title"><input value={att.title} onChange={(e) => setAtt({ ...att, title: e.target.value })} /></Field>
        <Field label="Link"><input value={att.url} onChange={(e) => setAtt({ ...att, url: e.target.value })} placeholder="https://…" /></Field>
        <Field label="Visible to"><select value={att.visibility} onChange={(e) => setAtt({ ...att, visibility: e.target.value })}><option value="internal">Internal only</option><option value="shared">Subscriber</option></select></Field>
        <div style={{ alignSelf: 'end' }}><button className="btn" disabled={!att.title || !att.url || busy} onClick={attach}>Add link</button></div>
      </div>
      <div className="row"><button className="btn" disabled={busy} onClick={save}>Save draft</button><button className="btn primary" disabled={busy} onClick={submit}>Submit round</button><button className="btn danger" disabled={busy} onClick={remove}>Delete draft</button></div>
    </div>
  );
}
