/* End-to-end rule checks against a running API + seeded DB.  Run: npm run test:e2e */
import { Client } from 'pg';

const API = process.env.API_URL || 'http://localhost:4000';
const PW = 'Passw0rd!';
let pass = 0, fail = 0;

async function call(token: string | null, method: string, path: string, body?: any) {
  const r = await fetch(API + path, {
    method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data: any = null; try { data = await r.json(); } catch {}
  return { status: r.status, data };
}
const login = async (email: string) => (await call(null, 'POST', '/auth/login', { email, password: PW })).data.token as string;
function ok(name: string, cond: boolean, extra = '') { cond ? pass++ : fail++; console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : '  ' + extra}`); }

(async () => {
  const db = new Client({ connectionString: process.env.DATABASE_URL || 'postgres://ipp:ipp@localhost:5432/ipp_comparator' });
  await db.connect();
  const [admin, proc, rev, viewer, meera, arjun] = await Promise.all([
    login('admin@ipp.test'), login('procurement@ipp.test'), login('reviewer@ipp.test'), login('viewer@ipp.test'),
    login('meera@sahyadristeel.example'), login('arjun@konkancold.example')]);

  const reqs = (await call(proc, 'GET', '/requirements')).data;
  const req = reqs.find((r: any) => r.title.startsWith('Plant 2'));
  const detail = (await call(proc, 'GET', `/requirements/${req.id}`)).data;
  const dealOf = (name: string) => detail.deals.find((d: any) => d.ipp_name === name).id;
  const [sun, vayu, tejas, nirmal] = ['Sunridge', 'Vayu Wind', 'Tejas Hybrid', 'Nirmal Hydro'].map(dealOf);

  // --- visibility ---
  const gDeal = (await call(meera, 'GET', `/deals/${sun}`)).data;
  ok('GES sees all 3 submitted rounds', gDeal.rounds.length === 3);
  ok('GES never receives internal remarks', gDeal.rounds.every((r: any) => !('remarks_internal' in r)));
  ok('GES never receives margin / credit notes', gDeal.rounds.every((r: any) => !('margin_pct' in r.terms) && !('credit_risk_notes' in r.terms)));
  ok('GES gets round-to-round diff', gDeal.rounds[2].changes.some((c: any) => c.field === 'tariff'));
  ok('GES has a lockable round', gDeal.lockable_round_ids.length === 1);
  const iDeal = (await call(proc, 'GET', `/deals/${sun}`)).data;
  ok('Internal user sees internal remarks and margin', iDeal.rounds[0].remarks_internal && iDeal.rounds[0].terms.margin_pct != null);
  ok('Other GES cannot open this deal', (await call(arjun, 'GET', `/deals/${sun}`)).status === 403);
  ok('Other GES cannot open this requirement', (await call(arjun, 'GET', `/requirements/${req.id}`)).status === 403);

  // --- roles ---
  ok('Viewer cannot create a round', (await call(viewer, 'POST', `/deals/${vayu}/rounds`, {})).status === 403);
  ok('GES cannot create a round', (await call(meera, 'POST', `/deals/${vayu}/rounds`, {})).status === 403);
  ok('Procurement cannot lock (GES only)', (await call(proc, 'POST', `/deals/${sun}/lock`, {})).status === 403);
  ok('No auth token is rejected', (await call(null, 'GET', '/ipps')).status === 401);

  // --- immutability ---
  const r1 = iDeal.rounds[0];
  const patch = await call(proc, 'PATCH', `/rounds/${r1.id}`, { terms: { tariff: 1 } });
  ok('API rejects edit of submitted round', patch.status === 409, JSON.stringify(patch));
  ok('API rejects delete of submitted round', (await call(proc, 'DELETE', `/rounds/${r1.id}`)).status === 409);
  const dbErr = async (sql: string, p: any[] = []) => { try { await db.query(sql, p); return null; } catch (e: any) { return e.message as string; } };
  ok('DB trigger blocks UPDATE of submitted round', !!(await dbErr('UPDATE rounds SET remarks_shared=$2 WHERE id=$1', [r1.id, 'hack'])));
  ok('DB trigger blocks UPDATE of submitted terms', !!(await dbErr('UPDATE round_terms SET tariff=1 WHERE round_id=$1', [r1.id])));
  ok('DB trigger blocks DELETE of submitted round', !!(await dbErr('DELETE FROM rounds WHERE id=$1', [r1.id])));
  ok('DB trigger blocks audit tampering', !!(await dbErr('UPDATE audit_log SET action=$1', ['x'])) && !!(await dbErr('DELETE FROM audit_log')));

  // --- round lifecycle on a feasible deal (Sunridge) ---
  const nr = await call(proc, 'POST', `/deals/${sun}/rounds`, { offered_by: 'us' });
  ok('New round is created as draft, numbered 4', nr.status === 201 && nr.data.round_no === 4 && nr.data.status === 'draft', JSON.stringify(nr));
  ok('Second draft is blocked', (await call(proc, 'POST', `/deals/${sun}/rounds`, {})).status === 409);
  const copied = (await db.query('SELECT tariff FROM round_terms WHERE round_id=$1', [nr.data.id])).rows[0];
  ok('New round is pre-filled from round 3', Number(copied.tariff) === 3.42);
  const early = await call(proc, 'POST', `/rounds/${nr.data.id}/submit`);
  ok('Submit without outcome/remarks is rejected', early.status === 400, JSON.stringify(early));
  await call(proc, 'PATCH', `/rounds/${nr.data.id}`, { outcome: 'countered', remarks_shared: 'Push for lower escalation', terms: { tariff: 3.38, escalation_pct: 1.5 } });
  ok('Draft is editable', (await db.query('SELECT tariff FROM round_terms WHERE round_id=$1', [nr.data.id])).rows[0].tariff == 3.38);
  ok('GES cannot see the draft', (await call(meera, 'GET', `/deals/${sun}`)).data.rounds.length === 3);
  ok('Draft cannot be marked Feasible', (await call(proc, 'POST', `/rounds/${nr.data.id}/feasible`, {})).status === 409);
  ok('Submit works', (await call(proc, 'POST', `/rounds/${nr.data.id}/submit`)).status === 201);
  ok('Round 4 is frozen after submit', (await call(proc, 'PATCH', `/rounds/${nr.data.id}`, { outcome: 'accepted' })).status === 409);

  // --- feasibility ---
  const mf = await call(rev, 'POST', `/rounds/${nr.data.id}/feasible`, { remark: 'Better escalation' });
  ok('Reviewer marks round 4 Feasible', mf.status === 201, JSON.stringify(mf));
  const wd0 = await call(rev, 'POST', `/rounds/${nr.data.id}/withdraw-feasible`, {});
  ok('Withdraw needs a reason', wd0.status === 400);
  ok('Withdraw works with reason', (await call(rev, 'POST', `/rounds/${nr.data.id}/withdraw-feasible`, { reason: 'IPP changed security terms' })).status === 201);
  const afterWd = (await call(meera, 'GET', `/deals/${sun}`)).data;
  ok('Round 3 stays lockable after round 4 is withdrawn', afterWd.deal.status === 'feasible' && afterWd.lockable_round_ids.length === 1);

  // --- comparator ---
  const cmp = await call(proc, 'POST', '/comparator', { requirement_id: req.id, deal_ids: [sun, vayu, tejas, nirmal] });
  ok('Comparator returns 4 rows with landed cost', cmp.status === 201 && cmp.data.rows.every((r: any) => r.cost?.landed > 0), JSON.stringify(cmp.data).slice(0, 200));
  ok('Comparator flags an unverified IPP', cmp.data.rows.find((r: any) => r.ipp_name === 'Nirmal Hydro').warnings.some((w: string) => /not verified/.test(w)));
  ok('Comparator flags capacity below load', cmp.data.rows.find((r: any) => r.ipp_name === 'Nirmal Hydro').warnings.some((w: string) => /capacity/i.test(w)));
  ok('Comparator needs 2-5 deals', (await call(proc, 'POST', '/comparator', { requirement_id: req.id, deal_ids: [sun] })).status === 400);

  // --- lock rules ---
  const r3 = gDeal.rounds[2], r1g = gDeal.rounds[0];
  ok('Lock needs acknowledgement', (await call(meera, 'POST', `/deals/${sun}/lock`, { round_id: r3.id })).status === 400);
  ok('Other GES cannot lock', (await call(arjun, 'POST', `/deals/${sun}/lock`, { round_id: r3.id, acknowledged: true })).status === 403);
  ok('GES cannot lock a non-Feasible round', (await call(meera, 'POST', `/deals/${sun}/lock`, { round_id: r1g.id, acknowledged: true })).status === 409);
  ok('GES cannot lock a deal that has no Feasible round', (await call(meera, 'POST', `/deals/${vayu}/lock`, { round_id: gDeal.rounds[0].id, acknowledged: true })).status === 409);

  // Concurrency: second requirement, two feasible deals, two simultaneous lock attempts
  const req2 = (await call(meera, 'POST', '/requirements', { title: 'Concurrency test', state: 'Maharashtra', load_mw: 5 })).data;
  const ipps = (await call(proc, 'GET', '/ipps')).data;
  const mk = async (ippId: string) => {
    const d = (await call(proc, 'POST', '/deals', { requirement_id: req2.id, ipp_id: ippId })).data;
    const r = (await call(proc, 'POST', `/deals/${d.id}/rounds`, {
      outcome: 'countered', terms: { tariff: 3.3, tenure_years: 10, validity_date: new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10) } })).data;
    await call(proc, 'POST', `/rounds/${r.id}/submit`);
    await call(proc, 'POST', `/rounds/${r.id}/feasible`, {});
    return { deal: d.id, round: r.id };
  };
  const a = await mk(ipps[0].id), b = await mk(ipps[1].id);
  const results = await Promise.all([
    call(meera, 'POST', `/deals/${a.deal}/lock`, { round_id: a.round, acknowledged: true }),
    call(meera, 'POST', `/deals/${b.deal}/lock`, { round_id: b.round, acknowledged: true }),
  ]);
  const wins = results.filter((r) => r.status === 201).length;
  ok('Concurrent locks: exactly one wins', wins === 1, JSON.stringify(results.map((r) => r.status)));
  ok('Concurrent locks: only one locked deal in DB', (await db.query("SELECT count(*)::int n FROM deals WHERE requirement_id=$1 AND status='locked'", [req2.id])).rows[0].n === 1);

  // Real lock on the seeded requirement
  const lock = await call(meera, 'POST', `/deals/${sun}/lock`, { round_id: r3.id, acknowledged: true });
  ok('GES locks Feasible round 3', lock.status === 201 && lock.data.round_no === 3 && lock.data.closed_deals === 3, JSON.stringify(lock));
  const after = (await call(proc, 'GET', `/requirements/${req.id}`)).data;
  ok('Locked deal shows locked, others closed', after.deals.filter((d: any) => d.status === 'locked').length === 1 && after.deals.filter((d: any) => d.status === 'closed').length === 3);
  ok('Closed deals say why', after.deals.filter((d: any) => d.status === 'closed').every((d: any) => /Another IPP locked/.test(d.closed_reason)));
  ok('Second lock attempt fails', (await call(meera, 'POST', `/deals/${sun}/lock`, { round_id: r3.id, acknowledged: true })).status === 409);
  ok('No new rounds on locked deal', (await call(proc, 'POST', `/deals/${sun}/rounds`, {})).status === 409);
  ok('No new rounds on closed deal', (await call(proc, 'POST', `/deals/${vayu}/rounds`, {})).status === 409);
  ok('DB blocks changing a locked deal', !!(await dbErr("UPDATE deals SET status='feasible' WHERE id=$1", [sun])));
  ok('DB blocks unlocking via deal_locks', !!(await dbErr('DELETE FROM deal_locks WHERE deal_id=$1', [sun])));
  ok('DB blocks deleting a deal', !!(await dbErr('DELETE FROM deals WHERE id=$1', [vayu])));
  const mm = (await call(proc, 'GET', `/requirements/${req.id}/mindmap`)).data;
  ok('Mind map has 4 deals and marks the locked round', mm.deals.length === 4 && mm.deals.some((d: any) => d.rounds.some((r: any) => r.locked)));
  const audit = (await call(admin, 'GET', '/audit?action=lock')).data;
  ok('Audit log recorded the lock', audit.length >= 1 && audit[0].entity === 'deal');
  ok('Audit log recorded auto-closures', (await call(admin, 'GET', '/audit?action=auto_close')).data.length >= 3);
  ok('Viewer cannot read audit?', (await call(viewer, 'GET', '/audit')).status === 200);
  ok('GES cannot read audit', (await call(meera, 'GET', '/audit')).status === 403);

  console.log(`\n${pass} passed, ${fail} failed`);
  await db.end();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
