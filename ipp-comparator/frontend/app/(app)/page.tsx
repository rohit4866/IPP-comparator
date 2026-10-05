'use client';
import Link from 'next/link';
import { useAuth, useLoad, isInternal } from '@/lib/auth';
import { api } from '@/lib/api';
import { Badge, Err, Loading } from '@/components/ui';
import { date, dateTime } from '@/lib/format';

export default function Dashboard() {
  const { user } = useAuth();
  const { data, error, loading } = useLoad<any>(() => api('/dashboard'));
  if (loading) return <Loading />;
  const count = (s: string) => data?.by_status.find((x: any) => x.status === s)?.n || 0;
  return (
    <div className="stack">
      <div><h1>Welcome, {user?.name.split(' ')[0]}</h1><p className="muted">{isInternal(user) ? 'Where every negotiation stands today.' : 'Your deals and what needs your decision.'}</p></div>
      <Err msg={error} />
      <div className="grid2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))' }}>
        {['under_negotiation', 'feasible', 'locked', 'closed'].map((s) => (
          <div className="card" key={s}><div className="stat">{count(s)}</div><Badge s={s} /></div>
        ))}
      </div>
      {count('feasible') > 0 && !isInternal(user) && <div className="alert warn">You have deals marked Feasible. Open a requirement to review and lock one.</div>}
      <div className="grid2">
        <div className="card">
          <h2>Recently locked</h2>
          {data?.recent_locked.length ? (
            <table><tbody>{data.recent_locked.map((d: any) => (
              <tr key={d.id}><td><Link href={`/deals/${d.id}`}>{d.ipp_name}</Link><div className="muted small">{d.title}</div></td><td>{dateTime(d.locked_at)}</td></tr>
            ))}</tbody></table>
          ) : <p className="muted">No locked deals yet.</p>}
        </div>
        {data?.expiring_tariffs && (
          <div className="card">
            <h2>Tariffs expiring within 30 days</h2>
            {data.expiring_tariffs.length ? (
              <table><tbody>{data.expiring_tariffs.map((x: any) => (
                <tr key={x.deal_id}><td><Link href={`/deals/${x.deal_id}`}>{x.ipp_name}</Link><div className="muted small">Round {x.round_no}</div></td><td>{date(x.validity_date)}</td></tr>
              ))}</tbody></table>
            ) : <p className="muted">Nothing is about to expire.</p>}
          </div>
        )}
        {data?.ipps_to_verify && (
          <div className="card">
            <h2>IPPs that need verification</h2>
            {data.ipps_to_verify.length ? (
              <table><tbody>{data.ipps_to_verify.map((i: any) => (
                <tr key={i.id}><td><Link href={`/ipps/${i.id}`}>{i.name}</Link></td><td><Badge s={i.status} /></td><td className="muted small">{i.last_verified_on ? date(i.last_verified_on) : 'Never verified'}</td></tr>
              ))}</tbody></table>
            ) : <p className="muted">All IPPs are up to date.</p>}
          </div>
        )}
      </div>
    </div>
  );
}
