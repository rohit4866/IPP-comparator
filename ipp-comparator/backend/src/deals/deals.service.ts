import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DbService } from '../db/db.service';
import { AuditService } from '../audit/audit.service';
import { AuthUser, isGes } from '../common/types';
import { diffTerms, stripTermsForGes } from '../common/terms';

@Injectable()
export class DealsService {
  constructor(private db: DbService, private audit: AuditService) {}

  /** Latest feasibility event per round, with an `active` flag (marked and not expired). */
  async feasibility(dealId: string) {
    const rows = await this.db.query(
      `SELECT DISTINCT ON (round_id) round_id, action, remark, at, valid_until, by_user,
              (action='marked' AND (valid_until IS NULL OR valid_until > now())) AS active,
              (action='marked' AND valid_until IS NOT NULL AND valid_until <= now()) AS expired
       FROM feasibility_events WHERE deal_id=$1 ORDER BY round_id, seq DESC`, [dealId]);
    return new Map<string, any>(rows.map((r: any) => [r.round_id, r]));
  }

  async loadDeal(id: string, u: AuthUser) {
    const d = await this.db.one(
      `SELECT d.*, COALESCE(i.brand_name,i.legal_name) AS ipp_name, i.legal_name, i.status AS ipp_status,
              i.credit_rating, r.title AS requirement_title, r.ges_id, r.state AS requirement_state, g.company_name
       FROM deals d JOIN ipps i ON i.id=d.ipp_id JOIN requirements r ON r.id=d.requirement_id
       JOIN ges g ON g.id=r.ges_id WHERE d.id=$1`, [id]);
    if (!d) throw new NotFoundException('Deal not found');
    if (isGes(u) && d.ges_id !== u.ges_id) throw new ForbiddenException('Not your deal');
    return d;
  }

  async create(b: any, u: AuthUser, ip: string) {
    if (!b.requirement_id || !b.ipp_id) throw new BadRequestException('requirement_id and ipp_id are required');
    return this.db.tx(async (c) => {
      const req = (await c.query('SELECT * FROM requirements WHERE id=$1', [b.requirement_id])).rows[0];
      if (!req) throw new NotFoundException('Requirement not found');
      if (req.status !== 'open') throw new ConflictException('Requirement is closed');
      const ipp = (await c.query('SELECT * FROM ipps WHERE id=$1', [b.ipp_id])).rows[0];
      if (!ipp || !ipp.is_active) throw new NotFoundException('IPP not found or inactive');
      const dup = (await c.query('SELECT 1 FROM deals WHERE requirement_id=$1 AND ipp_id=$2', [b.requirement_id, b.ipp_id])).rows[0];
      if (dup) throw new ConflictException('This IPP already has a deal for this requirement');
      const row = (await c.query(
        'INSERT INTO deals(requirement_id,ipp_id,created_by) VALUES($1,$2,$3) RETURNING *',
        [b.requirement_id, b.ipp_id, u.id])).rows[0];
      await this.audit.log(c, u, 'create', 'deal', row.id, null, row, null, ip);
      return row;
    });
  }

  list(u: AuthUser, f: any) {
    const where: string[] = [];
    const p: any[] = [];
    if (isGes(u)) { p.push(u.ges_id); where.push(`r.ges_id=$${p.length}`); }
    if (f.requirement_id) { p.push(f.requirement_id); where.push(`d.requirement_id=$${p.length}`); }
    if (f.status) { p.push(f.status); where.push(`d.status=$${p.length}`); }
    return this.db.query(
      `SELECT d.id,d.status,d.requirement_id,d.ipp_id,d.locked_at,d.closed_reason,
              COALESCE(i.brand_name,i.legal_name) AS ipp_name, r.title AS requirement_title, g.company_name
       FROM deals d JOIN ipps i ON i.id=d.ipp_id JOIN requirements r ON r.id=d.requirement_id JOIN ges g ON g.id=r.ges_id
       ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY d.created_at DESC`, p);
  }

  async get(id: string, u: AuthUser) {
    const deal = await this.loadDeal(id, u);
    const ges = isGes(u);
    const rounds = await this.db.query(
      `SELECT r.*, usr.name AS created_by_name FROM rounds r LEFT JOIN users usr ON usr.id=r.created_by
       WHERE r.deal_id=$1 ${ges ? "AND r.status='submitted'" : ''} ORDER BY r.round_no`, [id]);
    const ids = rounds.map((r: any) => r.id);
    const terms = ids.length ? await this.db.query('SELECT * FROM round_terms WHERE round_id = ANY($1)', [ids]) : [];
    const atts = ids.length ? await this.db.query(
      `SELECT * FROM round_attachments WHERE round_id = ANY($1) ${ges ? "AND visibility='shared'" : ''} ORDER BY uploaded_at`, [ids]) : [];
    const feas = await this.feasibility(id);
    const lock = await this.db.one(
      `SELECT l.*, r.round_no, u.name AS locked_by_name FROM deal_locks l
       JOIN rounds r ON r.id=l.round_id JOIN users u ON u.id=l.ges_user_id WHERE l.deal_id=$1`, [id]);

    let prev: any = null;
    const out = rounds.map((r: any) => {
      let t = terms.find((x: any) => x.round_id === r.id) || null;
      if (ges) t = stripTermsForGes(t);
      const changes = diffTerms(prev, t);
      prev = t;
      const f = feas.get(r.id);
      const round: any = {
        ...r, terms: t, changes,
        attachments: atts.filter((a: any) => a.round_id === r.id),
        feasible: f ? { active: f.active, expired: f.expired, remark: f.remark, at: f.at, valid_until: f.valid_until, withdrawn: f.action === 'withdrawn' } : null,
        is_locked_round: deal.locked_round_id === r.id,
      };
      if (ges) { delete round.remarks_internal; delete round.created_by; delete round.created_by_name; delete round.submitted_by; }
      return round;
    });

    const hasActive = [...feas.values()].some((f: any) => f.active);
    const events = ges ? [] : await this.db.query(
      `SELECT e.*, r.round_no, u.name AS by_name FROM feasibility_events e JOIN rounds r ON r.id=e.round_id
       LEFT JOIN users u ON u.id=e.by_user WHERE e.deal_id=$1 ORDER BY e.seq`, [id]);

    const dealOut: any = { ...deal };
    if (ges) { delete dealOut.created_by; delete dealOut.credit_rating; delete dealOut.ipp_status; delete dealOut.legal_name; }
    return {
      deal: dealOut,
      rounds: out,
      events,
      has_active_feasible: hasActive,
      lockable_round_ids: ges && deal.status === 'feasible' ? out.filter((r: any) => r.feasible?.active).map((r: any) => r.id) : [],
      lock: lock ? {
        locked_at: lock.locked_at, round_no: lock.round_no, locked_by_name: lock.locked_by_name,
        acknowledgement_text: lock.acknowledgement_text,
        terms_snapshot: ges ? { ...lock.terms_snapshot, terms: stripTermsForGes(lock.terms_snapshot?.terms) } : lock.terms_snapshot,
      } : null,
    };
  }

  /** Tree data for the in-app mind map: requirement -> IPP deals -> rounds. */
  async mindmap(requirementId: string, u: AuthUser) {
    const req = await this.db.one(
      `SELECT r.id,r.title,r.state,r.load_mw,r.status,r.ges_id,g.company_name FROM requirements r JOIN ges g ON g.id=r.ges_id WHERE r.id=$1`, [requirementId]);
    if (!req) throw new NotFoundException('Requirement not found');
    if (isGes(u) && req.ges_id !== u.ges_id) throw new ForbiddenException('Not your requirement');
    const ges = isGes(u);
    const deals = await this.db.query(
      `SELECT d.id,d.status,d.closed_reason,d.locked_round_id,d.locked_at,COALESCE(i.brand_name,i.legal_name) AS ipp_name
       FROM deals d JOIN ipps i ON i.id=d.ipp_id WHERE d.requirement_id=$1 ORDER BY d.created_at`, [requirementId]);
    const out: any[] = [];
    for (const d of deals) {
      const rs = await this.db.query(
        `SELECT r.id,r.round_no,r.status,r.offered_by,r.outcome,r.submitted_at,r.negotiation_date,t.tariff,t.tenure_years,t.validity_date,t.escalation_pct
         FROM rounds r LEFT JOIN round_terms t ON t.round_id=r.id
         WHERE r.deal_id=$1 ${ges ? "AND r.status='submitted'" : ''} ORDER BY r.round_no`, [d.id]);
      const feas = await this.feasibility(d.id);
      let prevTariff: number | null = null;
      const rounds = rs.map((r: any) => {
        const delta = prevTariff != null && r.tariff != null ? Math.round((r.tariff - prevTariff) * 1000) / 1000 : null;
        if (r.status === 'submitted' && r.tariff != null) prevTariff = r.tariff;
        const f = feas.get(r.id);
        return { ...r, delta, feasible: !!f?.active, feasible_expired: !!f?.expired, locked: d.locked_round_id === r.id };
      });
      out.push({ id: d.id, ipp_name: d.ipp_name, status: d.status, closed_reason: d.closed_reason, rounds });
    }
    return { requirement: { id: req.id, title: req.title, state: req.state, load_mw: req.load_mw, status: req.status, company_name: req.company_name }, deals: out };
  }
}
