import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DbService } from '../db/db.service';

const n = (v: any) => (v == null ? 0 : Number(v));
const r3 = (v: number) => Math.round(v * 1000) / 1000;

@Injectable()
export class ComparatorService {
  constructor(private db: DbService) {}

  async compare(b: any) {
    const ids: string[] = b.deal_ids || [];
    if (ids.length < 2 || ids.length > 5) throw new BadRequestException('Select 2 to 5 deals to compare');
    const req = await this.db.one('SELECT * FROM requirements WHERE id=$1', [b.requirement_id]);
    if (!req) throw new NotFoundException('Requirement not found');
    const sc = (await this.db.one(
      `SELECT * FROM state_charges WHERE state=$1 AND effective_from <= current_date
       AND (effective_to IS NULL OR effective_to >= current_date) ORDER BY effective_from DESC LIMIT 1`, [req.state])) || null;
    const rows: any[] = [];
    for (const dealId of ids) {
      const deal = await this.db.one(
        `SELECT d.*, i.legal_name, COALESCE(i.brand_name,i.legal_name) AS ipp_name, i.status AS ipp_status,
                i.credit_rating, i.states_served
         FROM deals d JOIN ipps i ON i.id=d.ipp_id WHERE d.id=$1 AND d.requirement_id=$2`, [dealId, b.requirement_id]);
      if (!deal) throw new NotFoundException(`Deal ${dealId} does not belong to this requirement`);
      const roundId = b.rounds?.[dealId];
      const round = await this.db.one(
        `SELECT * FROM rounds WHERE deal_id=$1 AND status='submitted' ${roundId ? 'AND id=$2' : ''} ORDER BY round_no DESC LIMIT 1`,
        roundId ? [dealId, roundId] : [dealId]);
      const t = round ? await this.db.one('SELECT * FROM round_terms WHERE round_id=$1', [round.id]) : null;
      const plants = await this.db.query('SELECT energy_source, available_mw, cuf FROM plants WHERE ipp_id=$1', [deal.ipp_id]);
      const warnings: string[] = [];
      if (!round) warnings.push('No submitted round yet');
      if (deal.ipp_status !== 'verified') warnings.push('IPP record is not verified');
      if (t?.validity_date && t.validity_date < new Date().toISOString().slice(0, 10)) warnings.push('Tariff validity has expired');
      if (!(deal.states_served || []).includes(req.state)) warnings.push(`IPP does not list ${req.state} as a served state`);
      if (!sc) warnings.push(`No state charge table for ${req.state}; unspecified charges counted as 0`);
      if (t?.capacity_mw != null && req.load_mw != null && t.capacity_mw < req.load_mw) warnings.push('Offered capacity is below the required load');

      let cost: any = null;
      if (t && t.tariff != null) {
        const pick = (own: any, fallback: any) => (own != null ? own : n(fallback));
        const wheeling = pick(t.wheeling, sc?.wheeling), css = pick(t.css, sc?.css), transmission = pick(t.transmission, sc?.transmission),
          other = pick(t.other_charges, sc?.other_charges), banking = pick(t.banking_adjustment, sc?.banking_adjustment);
        const addOns = wheeling + css + transmission + other + banking + n(t.green_premium);
        const landed = n(t.tariff) + addOns;
        const e = n(t.escalation_pct) / 100, yrs = t.tenure_years || 1;
        const factor = e === 0 ? 1 : (Math.pow(1 + e, yrs) - 1) / (e * yrs);
        cost = {
          landed: r3(landed), levelised: r3(n(t.tariff) * factor + addOns),
          breakdown: { tariff: n(t.tariff), green_premium: n(t.green_premium), wheeling, css, transmission, other_charges: other, banking_adjustment: banking },
          annual_cost: req.annual_consumption_kwh ? Math.round(landed * req.annual_consumption_kwh) : null,
        };
      }
      rows.push({
        deal_id: deal.id, ipp_name: deal.ipp_name, deal_status: deal.status, credit_rating: deal.credit_rating, ipp_status: deal.ipp_status,
        sources: [...new Set(plants.map((p: any) => p.energy_source))],
        avg_cuf: plants.length ? r3(plants.reduce((s: number, p: any) => s + n(p.cuf), 0) / plants.length) : null,
        round_id: round?.id ?? null, round_no: round?.round_no ?? null, terms: t, cost, warnings,
      });
    }
    const priced = rows.filter((r) => r.cost);
    const best = priced.length ? priced.reduce((a, c) => (c.cost.landed < a.cost.landed ? c : a)).deal_id : null;
    return { requirement: { id: req.id, title: req.title, state: req.state, load_mw: req.load_mw, annual_consumption_kwh: req.annual_consumption_kwh }, state_charges: sc, best_deal_id: best, rows };
  }
}
