'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Fragment, useState } from 'react';
import { useAuth, useLoad, canWrite, canMarkFeasible } from '@/lib/auth';
import { api } from '@/lib/api';
import { Badge, Err, Loading, Modal } from '@/components/ui';
import RoundEditor from '@/components/RoundEditor';
import { FIELD_LABEL, OUTCOME, date, dateTime, fieldValue, inr } from '@/lib/format';

const SHOWN = ['tariff', 'tariff_type', 'escalation_pct', 'green_premium', 'tenure_years', 'min_offtake_pct', 'capacity_mw', 'validity_date', 'wheeling', 'css', 'transmission', 'other_charges', 'banking_adjustment', 'banking_terms', 'exit_clause', 'lockin_years', 'payment_security', 'late_payment_terms', 'rec_available', 'co2_avoided_tpa', 'margin_pct', 'credit_risk_notes'];

export default function DealPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { data, error, loading, reload } = useLoad<any>(() => api(`/deals/${id}`), [id]);
  const [err, setErr] = useState<string | null>(null);
  const [lockRound, setLockRound] = useState<any>(null);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  if (loading) return <Loading />;
  if (!data) return <Err msg={error} />;
  const { deal, rounds, lock, lockable_round_ids, events } = data;
  const isGes = user?.role === 'ges';
  const terminal = deal.status === 'locked' || deal.status === 'closed';
  const hasDraft = rounds.some((r: any) => r.status === 'draft');

  async function act(fn: () => Promise<any>) { setErr(null); try { await fn(); reload(); } catch (e: any) { setErr(e.message); } }
  const addRound = () => act(() => api(`/deals/${id}/rounds`, { method: 'POST', body: {} }));
  const feasible = (r: any) => { const remark = prompt('Note for the record (optional)'); if (remark === null) return; act(() => api(`/rounds/${r.id}/feasible`, { method: 'POST', body: { remark } })); };
  const withdraw = (r: any) => { const reason = prompt('Reason for withdrawing the Feasible mark (required)'); if (!reason) return; act(() => api(`/rounds/${r.id}/withdraw-feasible`, { method: 'POST', body: { reason } })); };

  return (
    <div className="stack">
      <div className="head">
        <div>
          <p className="small"><Link href={`/requirements/${deal.requirement_id}`}>← {deal.requirement_title}</Link></p>
          <h1>{deal.ipp_name}</h1>
          <p className="muted">{deal.company_name} · {deal.requirement_state}{!isGes && deal.credit_rating ? ` · Rating ${deal.credit_rating}` : ''}</p>
        </div>
        <div className="row"><Badge s={deal.status} />
          {!isGes && canWrite(user) && !terminal && <button className="btn primary" disabled={hasDraft} title={hasDraft ? 'Submit or delete the current draft first' : ''} onClick={addRound}>{rounds.length ? 'Add next round' : 'Start Round 1'}</button>}</div>
      </div>
      <Err msg={err} />

      {deal.status === 'locked' && lock && (
        <div className="lockbanner">
          <b>Locked.</b> Round {lock.round_no} was locked by {lock.locked_by_name} on {dateTime(lock.locked_at)}. These are the final terms and cannot be changed.
          {!isGes && <div className="small" style={{ opacity: .85, marginTop: 4 }}>Negotiation actions are switched off for this deal.</div>}
        </div>
      )}
      {deal.status === 'closed' && <div className="alert warn">Closed: {deal.closed_reason}. This deal is read-only.</div>}
      {deal.status === 'feasible' && isGes && lockable_round_ids.length > 0 && <div className="alert warn">A round is marked Feasible. Review the terms below and lock the deal if they work for you. Locking is permanent and closes the other IPPs.</div>}
      {deal.status === 'feasible' && isGes && lockable_round_ids.length === 0 && <div className="alert warn">The Feasible window has expired. Ask the team for a fresh round.</div>}

      <div className="timeline">
        {[...rounds].reverse().map((r: any) => {
          const expanded = open[r.id] ?? (r.status === 'draft' || r.round_no === rounds[rounds.length - 1].round_no);
          const cls = r.is_locked_round ? 'locked' : r.feasible?.active ? 'feasible' : r.status === 'draft' ? 'draft' : '';
          const lockable = isGes && lockable_round_ids.includes(r.id);
          return (
            <div className={`round ${cls}`} key={r.id}>
              <div className="card">
                <div className="head" style={{ marginBottom: 8 }}>
                  <div>
                    <h3 style={{ marginBottom: 2 }}>Round {r.round_no} · {inr(r.terms?.tariff)} per kWh {tariffDelta(r)}</h3>
                    <div className="muted small">{r.offered_by === 'us' ? 'Our offer' : 'IPP offer'} · {date(r.negotiation_date)} · {r.mode}{r.outcome ? ` · ${OUTCOME[r.outcome]}` : ''}{!isGes && r.created_by_name ? ` · by ${r.created_by_name}` : ''}</div>
                  </div>
                  <div className="row">
                    <Badge s={r.status} />
                    {r.is_locked_round && <Badge s="locked" label="Locked round" />}
                    {r.feasible?.active && <Badge s="feasible" label="Feasible" />}
                    {r.feasible?.expired && <span className="badge b-closed">Feasible expired</span>}
                    {r.feasible?.withdrawn && <span className="badge b-closed">Feasible withdrawn</span>}
                  </div>
                </div>
                {r.status === 'draft' ? <RoundEditor round={r} onChange={reload} /> : (
                  <>
                    {r.remarks_shared && <p>{r.remarks_shared}</p>}
                    {r.remarks_internal && !isGes && <p className="small"><span className="badge b-closed">Internal</span> {r.remarks_internal}</p>}
                    {r.changes?.length > 0 && <p className="small"><b>Changed from previous round:</b> {r.changes.map((c: any) => <span key={c.field} className="diff" style={{ marginRight: 6 }}>{FIELD_LABEL[c.field]?.split(' (')[0] || c.field}: {fieldValue(c.field, c.from)} → {fieldValue(c.field, c.to)}</span>)}</p>}
                    <div className="row">
                      <button className="btn sm" onClick={() => setOpen({ ...open, [r.id]: !expanded })}>{expanded ? 'Hide terms' : 'Show all terms'}</button>
                      {!isGes && canMarkFeasible(user) && !terminal && !r.feasible?.active && <button className="btn sm" onClick={() => feasible(r)}>Mark Feasible</button>}
                      {!isGes && canMarkFeasible(user) && deal.status === 'feasible' && r.feasible?.active && <button className="btn sm danger" onClick={() => withdraw(r)}>Withdraw Feasible</button>}
                      {lockable && <button className="btn lock sm" onClick={() => setLockRound(r)}>Lock this deal</button>}
                    </div>
                    {r.feasible?.active && <p className="small muted" style={{ marginTop: 8 }}>Feasible until {dateTime(r.feasible.valid_until)}{r.feasible.remark ? ` · ${r.feasible.remark}` : ''}</p>}
                    {expanded && <Terms r={r} />}
                  </>
                )}
              </div>
            </div>
          );
        })}
        {!rounds.length && <div className="card empty">{isGes ? 'No rounds have been shared yet.' : 'No rounds yet. Start Round 1 to record the first offer.'}</div>}
      </div>

      {!isGes && events.length > 0 && (
        <div className="card"><h2>Feasibility history</h2>
          <table><tbody>{events.map((e: any) => <tr key={e.seq}><td>{dateTime(e.at)}</td><td>Round {e.round_no} {e.action === 'marked' ? 'marked Feasible' : 'Feasible withdrawn'}</td><td>{e.by_name}</td><td className="muted">{e.remark}</td></tr>)}</tbody></table></div>
      )}

      {lockRound && <LockModal deal={deal} round={lockRound} onClose={() => setLockRound(null)} onDone={() => { setLockRound(null); reload(); }} />}
    </div>
  );
}

const tariffDelta = (r: any) => {
  const c = r.changes?.find((x: any) => x.field === 'tariff');
  if (!c || c.from == null) return null;
  const d = Math.round((c.to - c.from) * 1000) / 1000;
  return <span className={d < 0 ? 'delta-down' : 'delta-up'} style={{ fontSize: 14 }}>({d > 0 ? '+' : '−'}{Math.abs(d).toFixed(2)})</span>;
};

function Terms({ r }: { r: any }) {
  const changed = new Set((r.changes || []).map((c: any) => c.field));
  return (
    <>
      <dl className="kv" style={{ marginTop: 12 }}>
        {SHOWN.filter((k) => r.terms && k in r.terms && r.terms[k] != null && r.terms[k] !== '').map((k) => (
          <Fragment key={k}><dt>{FIELD_LABEL[k]}</dt><dd>{changed.has(k) ? <span className="diff">{fieldValue(k, r.terms[k])}</span> : fieldValue(k, r.terms[k])}</dd></Fragment>
        ))}
      </dl>
      {r.attachments?.length > 0 && <p className="small" style={{ marginTop: 8 }}><b>Attachments:</b> {r.attachments.map((a: any) => <a key={a.id} href={a.url} target="_blank" rel="noreferrer" style={{ marginRight: 10 }}>{a.title}</a>)}</p>}
    </>
  );
}

function LockModal({ deal, round, onClose, onDone }: { deal: any; round: any; onClose: () => void; onDone: () => void }) {
  const [ack, setAck] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { data: req } = useLoad<any>(() => api(`/requirements/${deal.requirement_id}`), [deal.requirement_id]);
  const others = (req?.deals || []).filter((d: any) => d.id !== deal.id && ['under_negotiation', 'feasible'].includes(d.status));
  const t = round.terms || {};
  async function lock() {
    setBusy(true); setError(null);
    try { await api(`/deals/${deal.id}/lock`, { method: 'POST', body: { round_id: round.id, acknowledged: true } }); onDone(); } catch (e: any) { setError(e.message); setBusy(false); }
  }
  return (
    <Modal title={`Lock ${deal.ipp_name}, Round ${round.round_no}`} onClose={onClose}>
      <Err msg={error} />
      <dl className="kv">
        <dt>Tariff</dt><dd><b>{inr(t.tariff)}</b> per kWh</dd><dt>Escalation</dt><dd>{t.escalation_pct ?? 0}% per year</dd>
        <dt>Tenure</dt><dd>{t.tenure_years} years</dd><dt>Capacity</dt><dd>{t.capacity_mw ?? '–'} MW</dd><dt>Minimum offtake</dt><dd>{t.min_offtake_pct ?? '–'}%</dd>
        <dt>Payment security</dt><dd>{t.payment_security || '–'}</dd><dt>Exit terms</dt><dd>{t.exit_clause || '–'}</dd>
      </dl>
      {others.length > 0 && <div className="alert warn" style={{ marginTop: 14 }}>Locking will close {others.length} other deal{others.length > 1 ? 's' : ''}: {others.map((o: any) => o.ipp_name).join(', ')}.</div>}
      <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontWeight: 500, margin: '14px 0' }}>
        <input type="checkbox" style={{ width: 'auto', marginTop: 4 }} checked={ack} onChange={(e) => setAck(e.target.checked)} />
        I understand this action is permanent and cannot be undone.
      </label>
      <div className="row"><button className="btn lock" disabled={!ack || busy} onClick={lock}>{busy ? 'Locking…' : 'Lock deal'}</button><button className="btn" onClick={onClose}>Cancel</button></div>
    </Modal>
  );
}
