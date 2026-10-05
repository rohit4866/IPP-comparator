'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useAuth, useLoad, canWrite } from '@/lib/auth';
import { api } from '@/lib/api';
import { Badge, Err, Loading } from '@/components/ui';
import { SOURCE, num } from '@/lib/format';

export default function Ipps() {
  const { user } = useAuth();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const { data, error, loading } = useLoad<any[]>(() => api(`/ipps?q=${encodeURIComponent(q)}&status=${status}`), [q, status]);
  return (
    <div>
      <div className="head"><div><h1>Independent Power Producers</h1><p className="muted">Maintained by the internal team. IPPs have no access to this portal.</p></div>
        {canWrite(user) && <Link className="btn primary" href="/ipps/new">Add IPP</Link>}</div>
      <div className="row" style={{ marginBottom: 14 }}>
        <input style={{ maxWidth: 280 }} placeholder="Search by name" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search IPPs" />
        <select style={{ maxWidth: 180 }} value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter by status">
          <option value="">All statuses</option><option value="verified">Verified</option><option value="draft">Draft</option><option value="expired">Expired</option>
        </select>
      </div>
      <Err msg={error} />
      {loading ? <Loading /> : (
        <div className="card scroll" style={{ padding: 0 }}>
          <table>
            <thead><tr><th>IPP</th><th>Sources</th><th>States served</th><th>Available</th><th>Rating</th><th>Status</th><th>Deals</th></tr></thead>
            <tbody>
              {data?.map((i) => (
                <tr key={i.id}>
                  <td><Link href={`/ipps/${i.id}`}>{i.brand_name || i.legal_name}</Link><div className="muted small">{i.legal_name}</div></td>
                  <td><div className="chips">{i.sources.map((s: string) => <span className="chip" key={s}>{SOURCE[s]}</span>)}</div></td>
                  <td>{i.states_served.join(', ') || '–'}</td><td>{num(i.available_mw, ' MW')}</td><td>{i.credit_rating || '–'}</td>
                  <td><Badge s={i.status} /></td><td>{i.deal_count}</td>
                </tr>
              ))}
              {!data?.length && <tr><td colSpan={7} className="empty">No IPPs match. {canWrite(user) && 'Add the first one to start comparing.'}</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
