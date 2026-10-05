'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useAuth, useLoad, canWrite } from '@/lib/auth';
import { api } from '@/lib/api';
import { Badge, Err, Field, Loading, Modal } from '@/components/ui';
import { date, num } from '@/lib/format';

export default function Requirements() {
  const { user } = useAuth();
  const { data, error, loading, reload } = useLoad<any[]>(() => api('/requirements'));
  const [open, setOpen] = useState(false);
  const canCreate = canWrite(user) || user?.role === 'ges';
  return (
    <div>
      <div className="head"><div><h1>{user?.role === 'ges' ? 'My requirements' : 'Requirements'}</h1><p className="muted">Each requirement can end with exactly one locked IPP deal.</p></div>
        {canCreate && <button className="btn primary" onClick={() => setOpen(true)}>New requirement</button>}</div>
      <Err msg={error} />
      {loading ? <Loading /> : (
        <div className="card scroll" style={{ padding: 0 }}>
          <table>
            <thead><tr><th>Requirement</th>{user?.role !== 'ges' && <th>Subscriber</th>}<th>State</th><th>Load</th><th>Deals</th><th>Status</th><th>Created</th></tr></thead>
            <tbody>
              {data?.map((r) => (
                <tr key={r.id}>
                  <td><Link href={`/requirements/${r.id}`}>{r.title}</Link></td>{user?.role !== 'ges' && <td>{r.company_name}</td>}
                  <td>{r.state}</td><td>{num(r.load_mw, ' MW')}</td><td>{r.deal_count}</td>
                  <td>{r.locked_deal_id ? <Badge s="locked" /> : <Badge s={r.status} />}</td><td>{date(r.created_at)}</td>
                </tr>
              ))}
              {!data?.length && <tr><td colSpan={7} className="empty">No requirements yet.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
      {open && <NewRequirement onClose={() => setOpen(false)} onDone={() => { setOpen(false); reload(); }} />}
    </div>
  );
}

function NewRequirement({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const { user } = useAuth();
  const { data: ges } = useLoad<any[]>(() => (user?.role === 'ges' ? Promise.resolve([]) : api('/ges')));
  const [f, setF] = useState<any>({ ges_id: '', title: '', state: 'Maharashtra', load_mw: '', annual_consumption_kwh: '', load_profile: '', contract_preference: '', desired_tenure_years: '' });
  const [error, setError] = useState<string | null>(null);
  const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target.value });
  async function save(e: React.FormEvent) {
    e.preventDefault();
    try {
      const nz = (v: any) => (v === '' ? null : Number(v));
      await api('/requirements', { method: 'POST', body: { ...f, load_mw: nz(f.load_mw), annual_consumption_kwh: nz(f.annual_consumption_kwh), desired_tenure_years: nz(f.desired_tenure_years) } });
      onDone();
    } catch (err: any) { setError(err.message); }
  }
  return (
    <Modal title="New requirement" onClose={onClose}>
      <form className="form" onSubmit={save}>
        <div className="wide"><Err msg={error} /></div>
        {user?.role !== 'ges' && <Field label="Subscriber" wide><select required value={f.ges_id} onChange={set('ges_id')}><option value="">Choose…</option>{ges?.map((g) => <option key={g.id} value={g.id}>{g.company_name}</option>)}</select></Field>}
        <Field label="Title" wide><input required value={f.title} onChange={set('title')} placeholder="e.g. Plant 2, 24x7 supply" /></Field>
        <Field label="State"><input required value={f.state} onChange={set('state')} /></Field>
        <Field label="Load (MW)"><input type="number" step="any" value={f.load_mw} onChange={set('load_mw')} /></Field>
        <Field label="Annual consumption (kWh)"><input type="number" value={f.annual_consumption_kwh} onChange={set('annual_consumption_kwh')} /></Field>
        <Field label="Desired tenure (years)"><input type="number" value={f.desired_tenure_years} onChange={set('desired_tenure_years')} /></Field>
        <Field label="Load profile"><input value={f.load_profile} onChange={set('load_profile')} /></Field>
        <Field label="Contract preference"><input value={f.contract_preference} onChange={set('contract_preference')} /></Field>
        <div className="wide row"><button className="btn primary">Create requirement</button></div>
      </form>
    </Modal>
  );
}
