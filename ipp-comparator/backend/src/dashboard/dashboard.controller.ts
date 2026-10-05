import { Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { DbService } from '../db/db.service';
import { CurrentUser } from '../auth/decorators';
import { AuthUser, isGes } from '../common/types';

@Controller()
export class DashboardController {
  constructor(private db: DbService) {}

  @Get('dashboard')
  async dashboard(@CurrentUser() u: AuthUser) {
    const ges = isGes(u);
    const scope = ges ? 'AND r.ges_id=$1' : '';
    const p = ges ? [u.ges_id] : [];
    const byStatus = await this.db.query(
      `SELECT d.status, count(*)::int AS n FROM deals d JOIN requirements r ON r.id=d.requirement_id WHERE true ${scope} GROUP BY d.status`, p);
    const recentLocked = await this.db.query(
      `SELECT d.id, d.locked_at, COALESCE(i.brand_name,i.legal_name) AS ipp_name, r.title
       FROM deals d JOIN ipps i ON i.id=d.ipp_id JOIN requirements r ON r.id=d.requirement_id
       WHERE d.status='locked' ${scope} ORDER BY d.locked_at DESC LIMIT 5`, p);
    if (ges) return { by_status: byStatus, recent_locked: recentLocked };
    const expiring = await this.db.query(
      `SELECT d.id AS deal_id, COALESCE(i.brand_name,i.legal_name) AS ipp_name, t.validity_date, r.round_no
       FROM deals d JOIN ipps i ON i.id=d.ipp_id
       JOIN LATERAL (SELECT id, round_no FROM rounds WHERE deal_id=d.id AND status='submitted' ORDER BY round_no DESC LIMIT 1) r ON true
       JOIN round_terms t ON t.round_id=r.id
       WHERE d.status IN ('under_negotiation','feasible') AND t.validity_date <= current_date + 30
       ORDER BY t.validity_date LIMIT 10`);
    const staleIpps = await this.db.query(
      `SELECT id, COALESCE(brand_name,legal_name) AS name, status, last_verified_on FROM ipps
       WHERE is_active AND (status='draft' OR last_verified_on IS NULL OR last_verified_on < current_date - 180)
       ORDER BY last_verified_on NULLS FIRST LIMIT 10`);
    return { by_status: byStatus, recent_locked: recentLocked, expiring_tariffs: expiring, ipps_to_verify: staleIpps };
  }

  @Get('notifications')
  notifications(@CurrentUser() u: AuthUser) {
    return isGes(u)
      ? this.db.query(`SELECT *, ($2::uuid = ANY(read_by)) AS is_read FROM notifications WHERE audience='ges' AND ges_id=$1 ORDER BY created_at DESC LIMIT 50`, [u.ges_id, u.id])
      : this.db.query(`SELECT *, ($1::uuid = ANY(read_by)) AS is_read FROM notifications WHERE audience='internal' ORDER BY created_at DESC LIMIT 50`, [u.id]);
  }

  @Post('notifications/:id/read')
  async read(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() u: AuthUser) {
    await this.db.query('UPDATE notifications SET read_by = array_append(read_by, $2::uuid) WHERE id=$1 AND NOT ($2::uuid = ANY(read_by))', [id, u.id]);
    return { ok: true };
  }
}
