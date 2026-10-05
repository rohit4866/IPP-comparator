import { Client } from 'pg';
import * as bcrypt from 'bcryptjs';

const PASSWORD = 'Passw0rd!';

(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL || 'postgres://ipp:ipp@localhost:5432/ipp_comparator' });
  await c.connect();
  const exists = (await c.query('SELECT count(*)::int n FROM users')).rows[0].n;
  if (exists) { console.log('Database already has users; skipping seed'); return c.end(); }
  const hash = await bcrypt.hash(PASSWORD, 10);

  const ges = (await c.query(
    `INSERT INTO ges(company_name,contact_name,email,state) VALUES
     ('Sahyadri Steel Works','Meera Kulkarni','meera@sahyadristeel.example','Maharashtra'),
     ('Konkan Cold Chain','Arjun Naik','arjun@konkancold.example','Maharashtra') RETURNING id,company_name`)).rows;
  const users: [string, string, string, string | null][] = [
    ['admin@ipp.test', 'Asha Admin', 'admin', null],
    ['procurement@ipp.test', 'Pranav Procurement', 'procurement', null],
    ['reviewer@ipp.test', 'Rhea Reviewer', 'reviewer', null],
    ['viewer@ipp.test', 'Vikram Viewer', 'viewer', null],
    ['meera@sahyadristeel.example', 'Meera Kulkarni', 'ges', ges[0].id],
    ['arjun@konkancold.example', 'Arjun Naik', 'ges', ges[1].id],
  ];
  const ids: Record<string, string> = {};
  for (const [email, name, role, gid] of users) {
    ids[role + (gid ? gid : '')] = (await c.query(
      'INSERT INTO users(email,name,password_hash,role,ges_id) VALUES($1,$2,$3,$4,$5) RETURNING id', [email, name, hash, role, gid])).rows[0].id;
  }
  const proc = ids['procurement'], reviewer = ids['reviewer'];

  for (const [s, w, css, tr, o, b] of [
    ['Maharashtra', 0.55, 1.05, 0.30, 0.05, -0.04],
    ['Gujarat', 0.40, 0.80, 0.25, 0.05, -0.03],
    ['Karnataka', 0.60, 0.95, 0.35, 0.05, -0.05],
  ] as any[]) await c.query('INSERT INTO state_charges(state,wheeling,css,transmission,other_charges,banking_adjustment) VALUES($1,$2,$3,$4,$5,$6)', [s, w, css, tr, o, b]);

  const ipps: any[] = [
    ['Sunridge Renewables Pvt Ltd', 'Sunridge', 'AA', ['Maharashtra', 'Gujarat'], 'verified',
      [['Sunridge Solar Park 1', 'solar', 'Maharashtra', 220, 120, 0.27]]],
    ['Vayu Wind Power Ltd', 'Vayu Wind', 'A+', ['Maharashtra', 'Karnataka'], 'verified',
      [['Vayu Ghats Wind Farm', 'wind', 'Maharashtra', 180, 90, 0.34]]],
    ['Tejas Hybrid Energy Ltd', 'Tejas Hybrid', 'A', ['Maharashtra', 'Gujarat', 'Karnataka'], 'verified',
      [['Tejas Hybrid Cluster', 'hybrid', 'Maharashtra', 300, 150, 0.41]]],
    ['Nirmal Hydro Co', 'Nirmal Hydro', 'BBB+', ['Karnataka'], 'draft',
      [['Nirmal Mini Hydro', 'hydro', 'Karnataka', 40, 25, 0.48]]],
  ];
  const ippIds: string[] = [];
  for (const [legal, brand, rating, states, status, plants] of ipps) {
    const id = (await c.query(
      `INSERT INTO ipps(legal_name,brand_name,credit_rating,states_served,status,last_verified_on,verified_by,created_by)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [legal, brand, rating, states, status, status === 'verified' ? new Date().toISOString().slice(0, 10) : null, status === 'verified' ? reviewer : null, proc])).rows[0].id;
    ippIds.push(id);
    for (const [n, src, st, inst, av, cuf] of plants) await c.query(
      'INSERT INTO plants(ipp_id,name,energy_source,state,installed_mw,available_mw,cuf) VALUES($1,$2,$3,$4,$5,$6,$7)', [id, n, src, st, inst, av, cuf]);
    await c.query('INSERT INTO ipp_contacts(ipp_id,name,role,email) VALUES($1,$2,$3,$4)', [id, 'Commercial head', 'Business development', `bd@${brand.toLowerCase().replace(/\s/g, '')}.example`]);
  }

  const req = (await c.query(
    `INSERT INTO requirements(ges_id,title,state,load_mw,annual_consumption_kwh,load_profile,contract_preference,desired_tenure_years,created_by)
     VALUES($1,'Plant 2 rolling mill, 24x7 supply','Maharashtra',18,120000000,'24x7, 3-shift','Open access, 15+ years',15,$2) RETURNING id`,
    [ges[0].id, proc])).rows[0].id;

  const validity = new Date(Date.now() + 45 * 864e5).toISOString().slice(0, 10);
  async function deal(ippIdx: number) {
    return (await c.query('INSERT INTO deals(requirement_id,ipp_id,created_by) VALUES($1,$2,$3) RETURNING id', [req, ippIds[ippIdx], proc])).rows[0].id as string;
  }
  async function round(dealId: string, no: number, offeredBy: string, outcome: string, tariff: number, extra: any = {}) {
    const r = (await c.query(
      `INSERT INTO rounds(deal_id,round_no,offered_by,mode,outcome,remarks_shared,remarks_internal,created_by,negotiation_date)
       VALUES($1,$2,$3,'meeting',$4,$5,$6,$7,current_date - $8::int) RETURNING id`,
      [dealId, no, offeredBy, outcome, extra.shared ?? null, extra.internal ?? null, proc, 20 - no * 4])).rows[0].id;
    await c.query(
      `INSERT INTO round_terms(round_id,tariff,tariff_type,escalation_pct,green_premium,tenure_years,min_offtake_pct,capacity_mw,validity_date,
         exit_clause,lockin_years,payment_security,rec_available,margin_pct,credit_risk_notes)
       VALUES($1,$2,'fixed',$3,$4,$5,$6,$7,$8,$9,$10,$11,true,$12,$13)`,
      [r, tariff, extra.esc ?? 2, extra.premium ?? 0.1, 15, 80, extra.cap ?? 40, validity, 'Termination fee of 6 months billing after lock-in', 5, 'Letter of credit, 2 months', 0.12, 'Seems stable; watch DISCOM receivables']);
    await c.query("UPDATE rounds SET status='submitted', submitted_by=$2, submitted_at=now() - ($3::int || ' days')::interval WHERE id=$1", [r, proc, 20 - no * 4]);
    return r;
  }

  const d1 = await deal(0), d2 = await deal(1), d3 = await deal(2), d4 = await deal(3);
  await round(d1, 1, 'ipp', 'countered', 3.85, { shared: 'Opening offer', internal: 'Quoted high; room to move' });
  await round(d1, 2, 'us', 'countered', 3.6, { shared: 'Counter at 3.60 for 15-year tenure', internal: 'Anchor with Vayu offer' });
  const d1r3 = await round(d1, 3, 'ipp', 'countered', 3.42, { shared: 'Sunridge agrees to 3.42 with 2% escalation', internal: 'Final floor is 3.40' });
  await round(d2, 1, 'ipp', 'countered', 3.5, { shared: 'Opening offer' });
  await round(d2, 2, 'us', 'countered', 3.3, { shared: 'Counter with higher offtake', esc: 2.5 });
  await round(d3, 1, 'ipp', 'countered', 4.1, { shared: 'Firm 24x7 hybrid offer', cap: 18 });
  await round(d4, 1, 'ipp', 'countered', 3.2, { shared: 'Small hydro offer', cap: 12 });
  await c.query(
    `INSERT INTO feasibility_events(deal_id,round_id,action,by_user,remark,valid_until)
     VALUES($1,$2,'marked',$3,'Meets landed cost target',$4::date + 1)`, [d1, d1r3, reviewer, validity]);
  await c.query("UPDATE deals SET status='feasible' WHERE id=$1", [d1]);
  await c.query('INSERT INTO notifications(audience,ges_id,deal_id,title,body) VALUES($1,$2,$3,$4,$5)',
    ['ges', ges[0].id, d1, 'Sunridge is ready to lock', 'Round 3 is marked Feasible. Review the terms and lock the deal if they work for you.']);
  await c.query("INSERT INTO audit_log(user_id,role,action,entity,entity_id,remark) VALUES($1,'admin','seed','system',NULL,'Demo data loaded')", [ids['admin']]);

  console.log('Seeded. Password for all demo users:', PASSWORD);
  console.log(users.map((u) => `  ${u[2].padEnd(12)} ${u[0]}`).join('\n'));
  await c.end();
})().catch((e) => { console.error(e); process.exit(1); });
