'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { useAuth, useLoad, canWrite } from '@/lib/auth';
import { api } from '@/lib/api';
import { Badge, Err, Loading } from '@/components/ui';
import { SOURCE, date, num } from '@/lib/format';

export default function IppDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { data: i, error, loading, reload } = useLoad<any>(() => api(`/ipps/${id}`), [id]);
  const [err, setErr] = useState<string | null>(null);
  if (loading) return <Loading />;
  if (!i) return <Err msg={error} />;
  const canVerify = user && ['admin', 'reviewer'].includes(user.role);

  async function verify() {
    try { await api(`/ipps/${id}/verify`, { method: 'POST' }); reload(); } catch (e: any) { setErr(e.message); }
  }
  return (
    <div className="stack">
      <div className="head">
        <div><h1>{i.brand_name || i.legal_name}</h1><p className="muted">{i.legal_name}</p>
          <div className="row"><Badge s={i.status} /><span className="muted small">Last verified: {date(i.last_verified_on)}</span></div></div>
        {canVerify && <button className="btn primary" onClick={verify}>{i.status === 'verified' ? 'Re-verify today' : 'Mark as verified'}</button>}
      </div>
      <Err msg={err} />
      <div className="grid2">
        <div className="card"><h2>Company</h2>
          <dl className="kv"><dt>Credit rating</dt><dd>{i.credit_rating || '–'}</dd><dt>CIN</dt><dd>{i.registration_no || '–'}</dd><dt>PAN</dt><dd>{i.pan || '–'}</dd><dt>GST</dt><dd>{i.gst || '–'}</dd>
            <dt>States served</dt><dd>{i.states_served.join(', ') || '–'}</dd><dt>Address</dt><dd>{i.address || '–'}</dd></dl></div>
        <div className="card"><h2>Contacts</h2>
          {i.contacts.length ? i.contacts.map((c: any) => <p key={c.id}><b>{c.name}</b> <span className="muted">{c.role}</span><br /><span className="small">{c.phone} {c.email}</span></p>) : <p className="muted">No contacts recorded.</p>}</div>
      </div>
      <div className="card scroll"><h2>Plants</h2>
        <table><thead><tr><th>Plant</th><th>Source</th><th>State</th><th>Installed</th><th>Available</th><th>CUF</th></tr></thead>
          <tbody>{i.plants.map((p: any) => <tr key={p.id}><td>{p.name}</td><td>{SOURCE[p.energy_source]}</td><td>{p.state}</td><td>{num(p.installed_mw, ' MW')}</td><td>{num(p.available_mw, ' MW')}</td><td>{p.cuf ?? '–'}</td></tr>)}
            {!i.plants.length && <tr><td colSpan={6} className="muted">No plants yet.</td></tr>}</tbody></table></div>
      <div className="card"><h2>Deals</h2>
        {i.deals.length ? <table><tbody>{i.deals.map((d: any) => <tr key={d.id}><td><Link href={`/deals/${d.id}`}>{d.requirement_title}</Link><div className="muted small">{d.company_name}</div></td><td><Badge s={d.status} /></td></tr>)}</tbody></table> : <p className="muted">Not part of any deal yet.</p>}</div>
    </div>
  );
}
