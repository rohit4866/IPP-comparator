import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DbService } from '../db/db.service';
import { AuditService } from '../audit/audit.service';
import { AuthUser, isGes } from '../common/types';
import { pick } from '../common/terms';

const REQ_FIELDS = ['title','state','load_mw','annual_consumption_kwh','load_profile','contract_preference','desired_tenure_years'];

@Injectable()
export class RequirementsService {
  constructor(private db: DbService, private audit: AuditService) {}

  list(u: AuthUser) {
    const scope = isGes(u) ? 'WHERE r.ges_id = $1' : '';
    return this.db.query(
      `SELECT r.*, g.company_name,
         (SELECT count(*) FROM deals d WHERE d.requirement_id=r.id)::int AS deal_count,
         (SELECT d.id FROM deals d WHERE d.requirement_id=r.id AND d.status='locked') AS locked_deal_id
       FROM requirements r JOIN ges g ON g.id=r.ges_id ${scope} ORDER BY r.created_at DESC`,
      isGes(u) ? [u.ges_id] : [],
    );
  }

  async get(id: string, u: AuthUser) {
    const r = await this.db.one(
      `SELECT r.*, g.company_name FROM requirements r JOIN ges g ON g.id=r.ges_id WHERE r.id=$1`, [id]);
    if (!r) throw new NotFoundException('Requirement not found');
    if (isGes(u) && r.ges_id !== u.ges_id) throw new ForbiddenException('Not your requirement');
    const deals = await this.db.query(
      `SELECT d.id,d.status,d.ipp_id,d.locked_at,d.closed_reason,
              COALESCE(i.brand_name,i.legal_name) AS ipp_name,
              (SELECT count(*) FROM rounds x WHERE x.deal_id=d.id AND x.status='submitted')::int AS rounds
       FROM deals d JOIN ipps i ON i.id=d.ipp_id WHERE d.requirement_id=$1 ORDER BY d.created_at`, [id]);
    return { ...r, deals };
  }

  async create(b: any, u: AuthUser, ip: string) {
    const gesId = isGes(u) ? u.ges_id : b.ges_id;
    if (!gesId) throw new BadRequestException('ges_id is required');
    if (!b.title || !b.state) throw new BadRequestException('title and state are required');
    return this.db.tx(async (c) => {
      const d = pick(b, REQ_FIELDS);
      const cols = Object.keys(d);
      const row = (await c.query(
        `INSERT INTO requirements(ges_id,created_by,${cols.join(',')}) VALUES($1,$2,${cols.map((_, i) => '$' + (i + 3)).join(',')}) RETURNING *`,
        [gesId, u.id, ...cols.map((k) => d[k])])).rows[0];
      await this.audit.log(c, u, 'create', 'requirement', row.id, null, row, null, ip);
      return row;
    });
  }

  listGes() {
    return this.db.query('SELECT * FROM ges ORDER BY company_name');
  }

  async createGes(b: any, u: AuthUser, ip: string) {
    if (!b.company_name) throw new BadRequestException('company_name is required');
    return this.db.tx(async (c) => {
      const row = (await c.query(
        'INSERT INTO ges(company_name,contact_name,email,phone,state) VALUES($1,$2,$3,$4,$5) RETURNING *',
        [b.company_name, b.contact_name ?? null, b.email ?? null, b.phone ?? null, b.state ?? null])).rows[0];
      await this.audit.log(c, u, 'create', 'ges', row.id, null, row, null, ip);
      return row;
    });
  }
}
