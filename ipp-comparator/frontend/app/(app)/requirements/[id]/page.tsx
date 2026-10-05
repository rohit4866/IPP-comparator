'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { useAuth, useLoad, canWrite, isInternal } from '@/lib/auth';
import { api } from '@/lib/api';
import { Badge, Err, Loading } from '@/components/ui';
import MindMap, { toObsidianCanvas } from '@/components/MindMap';
import Compare from '@/components/Compare';
import { num } from '@/lib/format';

export default function RequirementDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [tab, setTab] = useState<'map' | 'deals' | 'compare'>('map');
  const { data: r, error, loading, reload } = useLoad<any>(() => api(`/requirements/${id}`), [id]);
  const { data: map, reload: reloadMap } = useLoad<any>(() => api(`/requirements/${id}/mindmap`), [id]);
  if (loading) return <Loading />;
  if (!r) return <Err msg={error} />;
  const locked = r.deals.find((d: any) => d.status === 'locked');
  const internal = isInternal(user);

  function exportCanvas() {
    const blob = new Blob([toObsidianCanvas(map)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${r.title.replace(/[^\w]+/g, '-')}.canvas`;
    a.click();
  }

  return (
    <div>
      <div className="head">
        <div><h1>{r.title}</h1><p className="muted">{r.company_name} · {r.state} · {num(r.load_mw, ' MW')} · {num(r.annual_consumption_kwh, ' kWh/yr')}</p></div>
        {locked ? <Badge s="locked" /> : <Badge s={r.status} />}
      </div>
      {locked && <div className="lockbanner"><b>Deal locked.</b> <Link href={`/deals/${locked.id}`} style={{ color: '#fff', textDecoration: 'underline' }}>{locked.ipp_name}</Link> was locked and the other IPPs were closed.</div>}
      <div className="tabs" role="tablist">
        <button className={tab === 'map' ? 'on' : ''} onClick={() => setTab('map')}>Negotiation map</button>
        <button className={tab === 'deals' ? 'on' : ''} onClick={() => setTab('deals')}>Deals</button>
        {internal && <button className={tab === 'compare' ? 'on' : ''} onClick={() => setTab('compare')}>Compare</button>}
      </div>
      {tab === 'map' && (map ? (
        <div className="stack">
          <div className="row"><button className="btn sm" onClick={exportCanvas}>Export for Obsidian (.canvas)</button><span className="muted small">Opens in Obsidian as a mind map.</span></div>
          <MindMap data={map} />
        </div>) : <Loading />)}
      {tab === 'deals' && <Deals r={r} onChange={() => { reload(); reloadMap(); }} canAdd={canWrite(user) && r.status === 'open'} />}
      {tab === 'compare' && <Compare requirementId={id} deals={r.deals} />}
    </div>
  );
}

function Deals({ r, onChange, canAdd }: { r: any; onChange: () => void; canAdd: boolean }) {
  const { data: ipps } = useLoad<any[]>(() => (canAdd ? api('/ipps') : Promise.resolve([])), [canAdd]);
  const [ippId, setIppId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const used = new Set(r.deals.map((d: any) => d.ipp_id));
  async function add() {
    setError(null);
    try { await api('/deals', { method: 'POST', body: { requirement_id: r.id, ipp_id: ippId } }); setIppId(''); onChange(); } catch (e: any) { setError(e.message); }
  }
  return (
    <div className="stack">
      {canAdd && (
        <div className="card"><h2>Add an IPP to negotiate with</h2>
          <div className="row"><select style={{ maxWidth: 340 }} value={ippId} onChange={(e) => setIppId(e.target.value)} aria-label="IPP">
            <option value="">Choose an IPP…</option>{ipps?.filter((i) => !used.has(i.id)).map((i) => <option key={i.id} value={i.id}>{i.brand_name || i.legal_name}{i.status !== 'verified' ? ' (not verified)' : ''}</option>)}</select>
            <button className="btn primary" disabled={!ippId} onClick={add}>Create deal</button></div><Err msg={error} /></div>
      )}
      <div className="card scroll" style={{ padding: 0 }}>
        <table><thead><tr><th>IPP</th><th>Status</th><th>Submitted rounds</th><th></th></tr></thead>
          <tbody>{r.deals.map((d: any) => (
            <tr key={d.id}><td>{d.ipp_name}{d.closed_reason && <div className="muted small">{d.closed_reason}</div>}</td><td><Badge s={d.status} /></td><td>{d.rounds}</td><td><Link href={`/deals/${d.id}`}>Open</Link></td></tr>))}
            {!r.deals.length && <tr><td colSpan={4} className="empty">No deals yet. Add the IPPs you want to negotiate with.</td></tr>}</tbody></table>
      </div>
    </div>
  );
}
