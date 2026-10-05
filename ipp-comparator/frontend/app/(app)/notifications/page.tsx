'use client';
import Link from 'next/link';
import { useLoad } from '@/lib/auth';
import { api } from '@/lib/api';
import { Err, Loading } from '@/components/ui';
import { dateTime } from '@/lib/format';

export default function Notifications() {
  const { data, error, loading, reload } = useLoad<any[]>(() => api('/notifications'));
  const read = async (id: string) => { await api(`/notifications/${id}/read`, { method: 'POST' }); reload(); };
  return (
    <div>
      <h1>Notifications</h1><Err msg={error} />
      {loading ? <Loading /> : (
        <div className="stack" style={{ marginTop: 16 }}>
          {data?.map((n) => (
            <div className="card" key={n.id} style={n.is_read ? { opacity: .65 } : { borderColor: 'var(--solar)' }}>
              <div className="head" style={{ marginBottom: 0 }}>
                <div><b>{n.title}</b><div className="muted small">{dateTime(n.created_at)}</div><p style={{ marginTop: 6 }}>{n.body}</p>{n.deal_id && <Link href={`/deals/${n.deal_id}`}>Open deal</Link>}</div>
                {!n.is_read && <button className="btn sm" onClick={() => read(n.id)}>Mark as read</button>}
              </div>
            </div>))}
          {!data?.length && <div className="card empty">Nothing yet.</div>}
        </div>
      )}
    </div>
  );
}
