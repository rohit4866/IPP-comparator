import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PoolClient } from 'pg';
import { DbService } from '../db/db.service';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../common/types';
import { ROUND_FIELDS, TERM_FIELDS, pick } from '../common/terms';

const ACK_TEXT = 'I understand this action is permanent and cannot be undone.';

@Injectable()
export class NegotiationService {
  constructor(private db: DbService, private audit: AuditService) {}

  private async notify(c: PoolClient, audience: 'internal' | 'ges', gesId: string | null, dealId: string, title: string, body: string) {
    await c.query('INSERT INTO notifications(audience,ges_id,deal_id,title,body) VALUES($1,$2,$3,$4,$5)', [audience, gesId, dealId, title, body]);
  }

  private async dealCtx(c: PoolClient, dealId: string) {
    const d = (await c.query(
      `SELECT d.*, r.ges_id, COALESCE(i.brand_name,i.legal_name) AS ipp_name
       FROM deals d JOIN requirements r ON r.id=d.requirement_id JOIN ipps i ON i.id=d.ipp_id
       WHERE d.id=$1 FOR UPDATE OF d`, [dealId])).rows[0];
    if (!d) throw new NotFoundException('Deal not found');
    return d;
  }

  private async insertTerms(c: PoolClient, roundId: string, terms: any) {
    const t = pick(terms, TERM_FIELDS);
    const cols = Object.keys(t);
    await c.query(
      `INSERT INTO round_terms(round_id${cols.length ? ',' + cols.join(',') : ''}) VALUES($1${cols.map((_, i) => ',$' + (i + 2)).join('')})`,
      [roundId, ...cols.map((k) => t[k])]);
  }

  // ---------- Rounds ----------

  async createRound(dealId: string, b: any, u: AuthUser, ip: string) {
    return this.db.tx(async (c) => {
      const deal = await this.dealCtx(c, dealId);
      if (!['under_negotiation', 'feasible'].includes(deal.status)) throw new ConflictException(`Deal is ${deal.status}: no new rounds allowed`);
      const draft = (await c.query("SELECT round_no FROM rounds WHERE deal_id=$1 AND status='draft'", [dealId])).rows[0];
      if (draft) throw new ConflictException(`Round ${draft.round_no} is still a draft. Submit or delete it first.`);
      const last = (await c.query('SELECT * FROM rounds WHERE deal_id=$1 ORDER BY round_no DESC LIMIT 1', [dealId])).rows[0];
      const prevTerms = last ? (await c.query('SELECT * FROM round_terms WHERE round_id=$1', [last.id])).rows[0] : null;
      const rf = { ...(last ? pick(last, ['ipp_contact', 'internal_negotiator']) : {}), ...pick(b, ROUND_FIELDS) };
      delete (rf as any).outcome; delete (rf as any).remarks_shared; delete (rf as any).remarks_internal;
      if (b.outcome) (rf as any).outcome = b.outcome;
      if (b.remarks_shared) (rf as any).remarks_shared = b.remarks_shared;
      if (b.remarks_internal) (rf as any).remarks_internal = b.remarks_internal;
      const cols = Object.keys(rf);
      const round = (await c.query(
        `INSERT INTO rounds(deal_id,round_no,created_by${cols.length ? ',' + cols.join(',') : ''})
         VALUES($1,$2,$3${cols.map((_, i) => ',$' + (i + 4)).join('')}) RETURNING *`,
        [dealId, (last?.round_no ?? 0) + 1, u.id, ...cols.map((k) => (rf as any)[k])])).rows[0];
      await this.insertTerms(c, round.id, { ...(prevTerms || {}), ...pick(b.terms || {}, TERM_FIELDS) });
      await this.audit.log(c, u, 'create_draft', 'round', round.id, null, { deal_id: dealId, round_no: round.round_no }, null, ip);
      return round;
    });
  }

  async updateDraft(roundId: string, b: any, u: AuthUser, ip: string) {
    return this.db.tx(async (c) => {
      const r = (await c.query('SELECT * FROM rounds WHERE id=$1 FOR UPDATE', [roundId])).rows[0];
      if (!r) throw new NotFoundException('Round not found');
      if (r.status !== 'draft') throw new ConflictException(`Round ${r.round_no} is submitted and immutable. Add a new round instead.`);
      const oldTerms = (await c.query('SELECT * FROM round_terms WHERE round_id=$1', [roundId])).rows[0];
      const rf = pick(b, ROUND_FIELDS);
      const rcols = Object.keys(rf);
      if (rcols.length) await c.query(`UPDATE rounds SET ${rcols.map((k, i) => `${k}=$${i + 1}`).join(',')} WHERE id=$${rcols.length + 1}`, [...rcols.map((k) => rf[k]), roundId]);
      const tf = pick(b.terms || {}, TERM_FIELDS);
      const tcols = Object.keys(tf);
      if (tcols.length) await c.query(`UPDATE round_terms SET ${tcols.map((k, i) => `${k}=$${i + 1}`).join(',')} WHERE round_id=$${tcols.length + 1}`, [...tcols.map((k) => tf[k]), roundId]);
      await this.audit.log(c, u, 'update_draft', 'round', roundId, { ...pick(r, ROUND_FIELDS), terms: oldTerms }, { ...rf, terms: tf }, null, ip);
      return (await c.query('SELECT * FROM rounds WHERE id=$1', [roundId])).rows[0];
    });
  }

  async deleteDraft(roundId: string, u: AuthUser, ip: string) {
    return this.db.tx(async (c) => {
      const r = (await c.query('SELECT * FROM rounds WHERE id=$1 FOR UPDATE', [roundId])).rows[0];
      if (!r) throw new NotFoundException('Round not found');
      if (r.status !== 'draft') throw new ConflictException('Submitted rounds cannot be deleted');
      await c.query('DELETE FROM rounds WHERE id=$1', [roundId]);
      await this.audit.log(c, u, 'delete_draft', 'round', roundId, { deal_id: r.deal_id, round_no: r.round_no }, null, null, ip);
      return { deleted: true };
    });
  }

  async submitRound(roundId: string, u: AuthUser, ip: string) {
    return this.db.tx(async (c) => {
      const r = (await c.query('SELECT * FROM rounds WHERE id=$1 FOR UPDATE', [roundId])).rows[0];
      if (!r) throw new NotFoundException('Round not found');
      if (r.status !== 'draft') throw new ConflictException('Round is already submitted');
      const deal = await this.dealCtx(c, r.deal_id);
      if (!['under_negotiation', 'feasible'].includes(deal.status)) throw new ConflictException(`Deal is ${deal.status}: round cannot be submitted`);
      const t = (await c.query('SELECT * FROM round_terms WHERE round_id=$1', [roundId])).rows[0];
      const missing: string[] = [];
      if (!(t?.tariff > 0)) missing.push('tariff');
      if (!(t?.tenure_years > 0)) missing.push('tenure_years');
      if (!t?.validity_date) missing.push('validity_date');
      if (!r.outcome) missing.push('outcome');
      if (r.round_no > 1 && !(r.remarks_shared || r.remarks_internal)) missing.push('remarks (reason for revision)');
      if (missing.length) throw new BadRequestException(`Cannot submit. Missing: ${missing.join(', ')}`);
      const row = (await c.query(
        "UPDATE rounds SET status='submitted', submitted_by=$2, submitted_at=now() WHERE id=$1 RETURNING *", [roundId, u.id])).rows[0];
      await this.audit.log(c, u, 'submit', 'round', roundId, { status: 'draft' }, { status: 'submitted', round_no: row.round_no, tariff: t.tariff }, null, ip);
      await this.notify(c, 'ges', deal.ges_id, deal.id, `New round on ${deal.ipp_name}`, `Round ${row.round_no} was recorded.`);
      return row;
    });
  }

  async addAttachment(roundId: string, b: any, u: AuthUser, ip: string) {
    if (!b.title || !b.url) throw new BadRequestException('title and url are required');
    return this.db.tx(async (c) => {
      const r = (await c.query('SELECT status FROM rounds WHERE id=$1 FOR UPDATE', [roundId])).rows[0];
      if (!r) throw new NotFoundException('Round not found');
      if (r.status !== 'draft') throw new ConflictException('Attachments can only be added while the round is a draft');
      const row = (await c.query(
        'INSERT INTO round_attachments(round_id,title,url,visibility,uploaded_by) VALUES($1,$2,$3,$4,$5) RETURNING *',
        [roundId, b.title, b.url, b.visibility === 'shared' ? 'shared' : 'internal', u.id])).rows[0];
      await this.audit.log(c, u, 'attach', 'round', roundId, null, { title: b.title, visibility: row.visibility }, null, ip);
      return row;
    });
  }

  // ---------- Feasibility ----------

  async markFeasible(roundId: string, b: any, u: AuthUser, ip: string) {
    return this.db.tx(async (c) => {
      const r = (await c.query('SELECT * FROM rounds WHERE id=$1', [roundId])).rows[0];
      if (!r) throw new NotFoundException('Round not found');
      if (r.status !== 'submitted') throw new ConflictException('Only submitted rounds can be marked Feasible');
      const deal = await this.dealCtx(c, r.deal_id);
      if (!['under_negotiation', 'feasible'].includes(deal.status)) throw new ConflictException(`Deal is ${deal.status}`);
      const last = (await c.query('SELECT action,valid_until FROM feasibility_events WHERE round_id=$1 ORDER BY seq DESC LIMIT 1', [roundId])).rows[0];
      if (last?.action === 'marked' && (!last.valid_until || new Date(last.valid_until) > new Date())) throw new ConflictException('Round is already marked Feasible');
      const ev = (await c.query(
        `INSERT INTO feasibility_events(deal_id,round_id,action,by_user,remark,valid_until)
         VALUES($1,$2,'marked',$3,$4,COALESCE($5::timestamptz,(SELECT (validity_date + 1)::timestamptz FROM round_terms WHERE round_id=$2))) RETURNING *`,
        [deal.id, roundId, u.id, b.remark ?? null, b.valid_until ?? null])).rows[0];
      if (ev.valid_until && new Date(ev.valid_until) <= new Date()) throw new BadRequestException('Tariff validity has already passed. Add a new round with a fresh validity date.');
      await c.query("UPDATE deals SET status='feasible' WHERE id=$1", [deal.id]);
      await this.audit.log(c, u, 'mark_feasible', 'round', roundId, null, { round_no: r.round_no, valid_until: ev.valid_until }, b.remark ?? null, ip);
      await this.notify(c, 'ges', deal.ges_id, deal.id, `${deal.ipp_name} is ready to lock`, `Round ${r.round_no} is marked Feasible. Review the terms and lock the deal if they work for you.`);
      return ev;
    });
  }

  async withdrawFeasible(roundId: string, b: any, u: AuthUser, ip: string) {
    if (!b.reason) throw new BadRequestException('A reason is required to withdraw');
    return this.db.tx(async (c) => {
      const r = (await c.query('SELECT * FROM rounds WHERE id=$1', [roundId])).rows[0];
      if (!r) throw new NotFoundException('Round not found');
      const deal = await this.dealCtx(c, r.deal_id);
      if (deal.status !== 'feasible') throw new ConflictException(`Deal is ${deal.status}: nothing to withdraw`);
      const last = (await c.query('SELECT * FROM feasibility_events WHERE round_id=$1 ORDER BY seq DESC LIMIT 1', [roundId])).rows[0];
      if (last?.action !== 'marked') throw new ConflictException('Round is not marked Feasible');
      const ev = (await c.query(
        "INSERT INTO feasibility_events(deal_id,round_id,action,by_user,remark) VALUES($1,$2,'withdrawn',$3,$4) RETURNING *",
        [deal.id, roundId, u.id, b.reason])).rows[0];
      const still = (await c.query(
        `SELECT 1 FROM (SELECT DISTINCT ON (round_id) action, valid_until FROM feasibility_events WHERE deal_id=$1 ORDER BY round_id, seq DESC) x
         WHERE action='marked' AND (valid_until IS NULL OR valid_until > now())`, [deal.id])).rows[0];
      if (!still) await c.query("UPDATE deals SET status='under_negotiation' WHERE id=$1", [deal.id]);
      await this.audit.log(c, u, 'withdraw_feasible', 'round', roundId, null, { round_no: r.round_no }, b.reason, ip);
      await this.notify(c, 'ges', deal.ges_id, deal.id, `Feasible mark withdrawn on ${deal.ipp_name}`, `Round ${r.round_no} can no longer be locked.`);
      return ev;
    });
  }

  // ---------- Lock (GES) ----------

  async lock(dealId: string, b: any, u: AuthUser, ip: string) {
    if (b.acknowledged !== true) throw new BadRequestException('You must acknowledge that locking is permanent');
    if (!b.round_id) throw new BadRequestException('round_id is required');
    return this.db.tx(async (c) => {
      const d0 = (await c.query(
        'SELECT d.requirement_id, r.ges_id FROM deals d JOIN requirements r ON r.id=d.requirement_id WHERE d.id=$1', [dealId])).rows[0];
      if (!d0) throw new NotFoundException('Deal not found');
      if (d0.ges_id !== u.ges_id) throw new ForbiddenException('Not your deal');

      // Lock every deal of the requirement in a stable order: concurrent lock attempts serialise here.
      const all = (await c.query('SELECT id,status,ipp_id FROM deals WHERE requirement_id=$1 ORDER BY id FOR UPDATE', [d0.requirement_id])).rows;
      if (all.some((d: any) => d.status === 'locked')) throw new ConflictException('A deal is already locked for this requirement');
      const cur = all.find((d: any) => d.id === dealId);
      if (cur.status === 'closed') throw new ConflictException('This deal is closed');
      if (cur.status !== 'feasible') throw new ConflictException('This deal has no Feasible round to lock');

      const round = (await c.query("SELECT * FROM rounds WHERE id=$1 AND deal_id=$2 AND status='submitted'", [b.round_id, dealId])).rows[0];
      if (!round) throw new BadRequestException('That round does not belong to this deal or is not submitted');
      const ev = (await c.query('SELECT * FROM feasibility_events WHERE round_id=$1 ORDER BY seq DESC LIMIT 1', [round.id])).rows[0];
      if (!ev || ev.action !== 'marked') throw new ConflictException('Only a Feasible round can be locked');
      if (ev.valid_until && new Date(ev.valid_until) <= new Date()) throw new ConflictException('The Feasible window for this round has expired. Ask the team for a fresh round.');

      const terms = (await c.query('SELECT * FROM round_terms WHERE round_id=$1', [round.id])).rows[0];
      const snapshot = {
        round_no: round.round_no, offered_by: round.offered_by, negotiation_date: round.negotiation_date,
        outcome: round.outcome, remarks_shared: round.remarks_shared, terms,
      };
      await c.query(
        'INSERT INTO deal_locks(deal_id,round_id,ges_user_id,acknowledgement_text,terms_snapshot) VALUES($1,$2,$3,$4,$5)',
        [dealId, round.id, u.id, ACK_TEXT, JSON.stringify(snapshot)]);
      await c.query("UPDATE deals SET status='locked', locked_round_id=$2, locked_by=$3, locked_at=now() WHERE id=$1", [dealId, round.id, u.id]);
      const closed = (await c.query(
        `UPDATE deals SET status='closed', closed_at=now(), closed_reason=$3
         WHERE requirement_id=$1 AND id<>$2 AND status IN ('under_negotiation','feasible') RETURNING id`,
        [d0.requirement_id, dealId, `Another IPP locked by GES on ${new Date().toISOString().slice(0, 10)}`])).rows;
      await c.query("UPDATE requirements SET status='closed' WHERE id=$1", [d0.requirement_id]);

      await this.audit.log(c, u, 'lock', 'deal', dealId, { status: 'feasible' }, { status: 'locked', round_no: round.round_no, tariff: terms?.tariff }, ACK_TEXT, ip);
      for (const x of closed) await this.audit.log(c, null, 'auto_close', 'deal', x.id, { status: 'open' }, { status: 'closed' }, `Closed because deal ${dealId} was locked`, ip);
      const name = (await c.query('SELECT COALESCE(brand_name,legal_name) AS n FROM ipps i JOIN deals d ON d.ipp_id=i.id WHERE d.id=$1', [dealId])).rows[0].n;
      await this.notify(c, 'internal', null, dealId, `Deal locked: ${name}`, `GES locked Round ${round.round_no}. ${closed.length} other deal(s) closed.`);
      return { locked: true, round_no: round.round_no, closed_deals: closed.length };
    });
  }
}
