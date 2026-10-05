'use client';
import { useState } from 'react';
import { useAuth, useLoad, canWrite } from '@/lib/auth';
import { api } from '@/lib/api';
import { Err, Field, Loading } from '@/components/ui';
import { date } from '@/lib/format';

export default function Charges() {
  const { user } = useAuth();
  const { data, error, loading, reload } = useLoad<any[]>(() => api('/charges'));
  const [f, setF] = useState<any>({ state: '', wheeling: '', css: '', transmission: '', other_charges: '', banking_adjustment: '' });
  const [err, setErr] = useState<string | null>(null);
  async function save(e: React.FormEvent) {
    e.preventDefault(); setErr(null);
    try {
      const n = (v: any) => (v === '' ? 0 : Number(v));
      await api('/charges', { method: 'POST', body: { state: f.state, wheeling: n(f.wheeling), css: n(f.css), transmission: n(f.transmission), other_charges: n(f.other_charges), banking_adjustment: n(f.banking_adjustment) } });
      setF({ state: '', wheeling: '', css: '', transmission: '', other_charges: '', banking_adjustment: '' }); reload();
    } catch (x: any) { setErr(x.message); }
  }
  const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target.value });
  return (
    <div className="stack">
      <div><h1>State charges</h1><p className="muted">₹ per kWh. Used by the comparator when a round does not state its own value. Adding a new set for a state closes the previous one.</p></div>
      {canWrite(user) && (
        <form className="card" onSubmit={save}><h2>Add or replace a state's charges</h2><Err msg={err} />
          <div className="form">
            <Field label="State"><input required value={f.state} onChange={set('state')} /></Field>
            {[['wheeling', 'Wheeling'], ['css', 'Cross-subsidy surcharge'], ['transmission', 'Transmission'], ['other_charges', 'Other charges'], ['banking_adjustment', 'Banking adjustment']].map(([k, l]) => (
              <Field key={k} label={l}><input type="number" step="any" value={f[k]} onChange={set(k)} /></Field>))}
            <div style={{ alignSelf: 'end' }}><button className="btn primary">Save charges</button></div>
          </div></form>
      )}
      {error && <Err msg={error} />}
      {loading ? <Loading /> : (
        <div className="card scroll" style={{ padding: 0 }}>
          <table><thead><tr><th>State</th><th>Wheeling</th><th>CSS</th><th>Transmission</th><th>Other</th><th>Banking</th><th>Effective</th></tr></thead>
            <tbody>{data?.map((c) => (
              <tr key={c.id} style={c.effective_to ? { opacity: .55 } : undefined}><td>{c.state}</td><td>{c.wheeling}</td><td>{c.css}</td><td>{c.transmission}</td><td>{c.other_charges}</td><td>{c.banking_adjustment}</td>
                <td>{date(c.effective_from)} to {c.effective_to ? date(c.effective_to) : 'now'}</td></tr>))}</tbody></table>
        </div>
      )}
    </div>
  );
}
