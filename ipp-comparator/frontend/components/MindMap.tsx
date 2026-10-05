'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { inr, date, STATUS, OUTCOME } from '@/lib/format';

type Round = { id: string; round_no: number; status: string; offered_by: string; outcome: string | null; tariff: number | null; delta: number | null; feasible: boolean; feasible_expired: boolean; locked: boolean; tenure_years: number | null; validity_date: string | null; negotiation_date: string };
type Deal = { id: string; ipp_name: string; status: string; closed_reason: string | null; rounds: Round[] };
export type MapData = { requirement: { id: string; title: string; state: string; load_mw: number; company_name: string; status: string }; deals: Deal[] };

const COL = { grid: '#0f6b5c', gridSoft: '#e1f0ec', solar: '#c98a0a', solarSoft: '#fbf0d6', lock: '#1b3a5c', closed: '#7b878c', closedSoft: '#eceeed', ink: '#14232b', line: '#c4cfca' };
const ROW = 118, RW = 124, RH = 62, X_ROOT = 20, X_DEAL = 250, X_R1 = 470;

export default function MindMap({ data }: { data: MapData }) {
  const [sel, setSel] = useState<{ deal: Deal; round: Round } | null>(null);
  const maxR = Math.max(1, ...data.deals.map((d) => d.rounds.length));
  const W = X_R1 + maxR * (RW + 34) + 20;
  const H = Math.max(180, data.deals.length * ROW + 30);
  const rootY = H / 2;

  const rows = useMemo(() => data.deals.map((d, i) => ({ d, y: 20 + i * ROW + ROW / 2 - 10 })), [data]);

  return (
    <div>
      <div className="mm-wrap">
        <svg width={W} height={H} role="img" aria-label={`Negotiation map for ${data.requirement.title}`}>
          {/* root */}
          <g>
            <rect x={X_ROOT} y={rootY - 38} width={176} height={76} rx={10} fill={COL.ink} />
            <text x={X_ROOT + 14} y={rootY - 12} fill="#fff" fontSize="13" fontWeight="600">{clip(data.requirement.company_name, 22)}</text>
            <text x={X_ROOT + 14} y={rootY + 6} fill="#cfe0da" fontSize="12">{clip(data.requirement.title, 25)}</text>
            <text x={X_ROOT + 14} y={rootY + 24} fill="#cfe0da" fontSize="12">{data.requirement.state} · {data.requirement.load_mw ?? '–'} MW</text>
          </g>
          {rows.map(({ d, y }) => {
            const faded = d.status === 'closed';
            const locked = d.status === 'locked';
            const stroke = locked ? COL.lock : faded ? COL.closed : d.status === 'feasible' ? COL.solar : COL.grid;
            return (
              <g key={d.id} opacity={faded ? 0.62 : 1}>
                <path d={`M${X_ROOT + 176} ${rootY} C ${X_ROOT + 226} ${rootY}, ${X_DEAL - 50} ${y}, ${X_DEAL} ${y}`} fill="none" stroke={stroke} strokeWidth={locked ? 3 : 2} />
                <Link href={`/deals/${d.id}`}>
                  <g className="mm-node">
                    <rect x={X_DEAL} y={y - 30} width={170} height={60} rx={30} fill={locked ? COL.lock : '#fff'} stroke={stroke} strokeWidth={2} />
                    <text x={X_DEAL + 85} y={y - 4} textAnchor="middle" fontSize="13" fontWeight="600" fill={locked ? '#fff' : COL.ink}>{clip(d.ipp_name, 17)}</text>
                    <text x={X_DEAL + 85} y={y + 14} textAnchor="middle" fontSize="11.5" fill={locked ? '#cfdcec' : '#5e6f76'}>{STATUS[d.status]}</text>
                  </g>
                </Link>
                {d.rounds.length === 0 && <text x={X_R1} y={y + 4} fontSize="12" fill="#8a979c">No rounds yet</text>}
                {d.rounds.map((r, i) => {
                  const x = X_R1 + i * (RW + 34);
                  const px = i === 0 ? X_DEAL + 170 : X_R1 + (i - 1) * (RW + 34) + RW;
                  const draft = r.status === 'draft';
                  const ring = r.locked ? COL.lock : r.feasible ? COL.solar : COL.grid;
                  const fill = r.locked ? COL.lock : r.feasible ? COL.solarSoft : '#fff';
                  const txt = r.locked ? '#fff' : COL.ink;
                  return (
                    <g key={r.id}>
                      <line x1={px} y1={y} x2={x} y2={y} stroke={COL.line} strokeWidth={2} />
                      {r.delta != null && r.delta !== 0 && (
                        <text x={(px + x) / 2} y={y - 8} textAnchor="middle" fontSize="11.5" fontWeight="600" fill={r.delta < 0 ? COL.grid : '#b23a32'}>{r.delta > 0 ? '+' : '−'}{Math.abs(r.delta).toFixed(2)}</text>
                      )}
                      <g className="mm-node" onClick={() => setSel({ deal: d, round: r })} tabIndex={0} role="button" aria-label={`Round ${r.round_no} of ${d.ipp_name}`} onKeyDown={(e) => e.key === 'Enter' && setSel({ deal: d, round: r })}>
                        <rect x={x} y={y - RH / 2} width={RW} height={RH} rx={8} fill={fill} stroke={ring} strokeWidth={2} strokeDasharray={draft ? '5 4' : undefined} />
                        <text x={x + 10} y={y - 10} fontSize="11.5" fill={r.locked ? '#cfdcec' : '#5e6f76'}>Round {r.round_no}{draft ? ' (draft)' : ''}</text>
                        <text x={x + 10} y={y + 10} fontSize="17" fontWeight="600" fill={txt}>{r.tariff != null ? `₹${r.tariff.toFixed(2)}` : '–'}</text>
                        <text x={x + 10} y={y + 25} fontSize="11" fill={r.locked ? '#cfdcec' : '#5e6f76'}>{r.locked ? 'Locked' : r.feasible ? 'Feasible' : r.outcome ? OUTCOME[r.outcome] : ''}</text>
                      </g>
                    </g>
                  );
                })}
              </g>
            );
          })}
        </svg>
      </div>

      <div className="row small muted" style={{ marginTop: 10, gap: 18 }}>
        <Legend c={COL.grid} t="Round" /><Legend c={COL.solar} t="Marked Feasible" /><Legend c={COL.lock} t="Locked round" dashed={false} /><Legend c={COL.grid} t="Draft" dashed />
        <span>Numbers between rounds show the tariff change in ₹/kWh.</span>
      </div>

      {sel && (
        <div className="card" style={{ marginTop: 14 }}>
          <div className="head" style={{ marginBottom: 8 }}>
            <div>
              <h3 style={{ marginBottom: 2 }}>{sel.deal.ipp_name}, Round {sel.round.round_no}</h3>
              <span className="muted small">{sel.round.offered_by === 'us' ? 'Our offer' : 'IPP offer'} · {date(sel.round.negotiation_date)}</span>
            </div>
            <div className="row"><Link className="btn sm" href={`/deals/${sel.deal.id}`}>Open deal</Link><button className="btn sm" onClick={() => setSel(null)}>Hide</button></div>
          </div>
          <dl className="kv">
            <dt>Tariff</dt><dd>{inr(sel.round.tariff)} per kWh {sel.round.delta ? <span className={sel.round.delta < 0 ? 'delta-down' : 'delta-up'}>({sel.round.delta > 0 ? '+' : '−'}{Math.abs(sel.round.delta).toFixed(2)} vs previous)</span> : null}</dd>
            <dt>Tenure</dt><dd>{sel.round.tenure_years ?? '–'} years</dd>
            <dt>Valid until</dt><dd>{date(sel.round.validity_date)}</dd>
            <dt>Status</dt><dd>{sel.round.locked ? 'Locked by GES' : sel.round.feasible ? 'Marked Feasible' : sel.round.feasible_expired ? 'Feasible window expired' : STATUS[sel.round.status]}</dd>
          </dl>
        </div>
      )}
    </div>
  );
}

function Legend({ c, t, dashed }: { c: string; t: string; dashed?: boolean }) {
  return <span className="row" style={{ gap: 6 }}><svg width="18" height="12"><rect x="1" y="1" width="16" height="10" rx="3" fill="none" stroke={c} strokeWidth="2" strokeDasharray={dashed ? '3 2' : undefined} /></svg>{t}</span>;
}
const clip = (s: string, n: number) => (s && s.length > n ? s.slice(0, n - 1) + '…' : s);

/** JSON Canvas (.canvas) export so the same map can be opened in Obsidian. */
export function toObsidianCanvas(data: MapData) {
  const nodes: any[] = [], edges: any[] = [];
  nodes.push({ id: 'root', type: 'text', x: 0, y: 0, width: 300, height: 120, color: '6', text: `# ${data.requirement.company_name}\n${data.requirement.title}\n${data.requirement.state} · ${data.requirement.load_mw ?? '–'} MW` });
  data.deals.forEach((d, i) => {
    const y = i * 260 - ((data.deals.length - 1) * 260) / 2;
    const color = d.status === 'locked' ? '5' : d.status === 'feasible' ? '3' : d.status === 'closed' ? '0' : '4';
    nodes.push({ id: `d${i}`, type: 'text', x: 420, y, width: 260, height: 100, color, text: `## ${d.ipp_name}\n${STATUS[d.status]}${d.closed_reason ? `\n_${d.closed_reason}_` : ''}` });
    edges.push({ id: `e-root-d${i}`, fromNode: 'root', fromSide: 'right', toNode: `d${i}`, toSide: 'left' });
    d.rounds.forEach((r, j) => {
      const id = `d${i}r${j}`;
      nodes.push({ id, type: 'text', x: 780 + j * 340, y, width: 280, height: 130, color: r.locked ? '5' : r.feasible ? '3' : undefined,
        text: `**Round ${r.round_no}**${r.status === 'draft' ? ' (draft)' : ''}\nTariff ₹${r.tariff ?? '–'}/kWh${r.delta ? ` (${r.delta > 0 ? '+' : ''}${r.delta})` : ''}\n${r.outcome ? OUTCOME[r.outcome] : ''}${r.locked ? '\n**LOCKED**' : r.feasible ? '\nFeasible' : ''}` });
      edges.push({ id: `e-${id}`, fromNode: j === 0 ? `d${i}` : `d${i}r${j - 1}`, fromSide: 'right', toNode: id, toSide: 'left', label: r.delta ? `${r.delta > 0 ? '+' : ''}${r.delta}` : undefined });
    });
  });
  return JSON.stringify({ nodes, edges }, null, 2);
}
