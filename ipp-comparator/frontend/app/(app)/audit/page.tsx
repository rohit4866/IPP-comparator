'use client';
import { useState } from 'react';
import { useLoad } from '@/lib/auth';
import { api, API } from '@/lib/api';
import { Err, Loading } from '@/components/ui';
import { dateTime } from '@/lib/format';

export default function Audit() {
  const [action, setAction] = useState('');
  const [entity, setEntity] = useState('');
  const qs = `?action=${action}&entity=${entity}`;
  const { data, error, loading } = useLoad<any[]>(() => api(`/audit${qs}`), [action, entity]);
  async function csv() {
    const res = await fetch(`${API}/audit${qs}&format=csv`, { headers: { authorization: `Bearer ${localStorage.getItem('token')}` } });
    const a = document.createElement('a'); a.href = URL.createObjectURL(await res.blob()); a.download = 'audit.csv'; a.click();
  }
  return (
    <div>
      <div className="head"><div><h1>Audit log</h1><p className="muted">Append-only. Entries cannot be edited or deleted by anyone.</p></div><button className="btn" onClick={csv}>Export CSV</button></div>
      <div className="row" style={{ marginBottom: 14 }}>
        <select style={{ maxWidth: 200 }} value={entity} onChange={(e) => setEntity(e.target.value)} aria-label="Entity"><option value="">All records</option>{['ipp', 'plant', 'requirement', 'deal', 'round', 'user', 'state_charges', 'ges'].map((x) => <option key={x}>{x}</option>)}</select>
        <select style={{ maxWidth: 220 }} value={action} onChange={(e) => setAction(e.target.value)} aria-label="Action"><option value="">All actions</option>{['create', 'update', 'create_draft', 'update_draft', 'submit', 'mark_feasible', 'withdraw_feasible', 'lock', 'auto_close', 'verify', 'login'].map((x) => <option key={x}>{x}</option>)}</select>
      </div>
      <Err msg={error} />
      {loading ? <Loading /> : (
        <div className="card scroll" style={{ padding: 0 }}>
          <table><thead><tr><th>When</th><th>Who</th><th>Action</th><th>Record</th><th>Detail</th></tr></thead>
            <tbody>{data?.map((a) => (
              <tr key={a.id}><td>{dateTime(a.at)}</td><td>{a.user_name || 'System'}<div className="muted small">{a.role}</div></td><td>{a.action}</td><td>{a.entity}<div className="muted small">{a.entity_id?.slice(0, 8)}</div></td>
                <td className="small">{a.remark && <div>{a.remark}</div>}{a.new_value && <div className="muted">{JSON.stringify(a.new_value).slice(0, 140)}</div>}</td></tr>))}
              {!data?.length && <tr><td colSpan={5} className="empty">No entries match.</td></tr>}</tbody></table>
        </div>
      )}
    </div>
  );
}
