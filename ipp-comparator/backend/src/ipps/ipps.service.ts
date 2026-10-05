import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DbService } from '../db/db.service';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../common/types';
import { pick } from '../common/terms';

const IPP_FIELDS = ['legal_name','brand_name','registration_no','pan','gst','address','credit_rating','states_served','notes'];
const PLANT_FIELDS = ['name','energy_source','state','location','installed_mw','available_mw','cod_date','cuf'];

@Injectable()
export class IppsService {
  constructor(private db: DbService, private audit: AuditService) {}

  async list(f: any) {
    const where = ['i.is_active'];
    const p: any[] = [];
    if (f.q) { p.push(`%${f.q}%`); where.push(`(i.legal_name ILIKE $${p.length} OR i.brand_name ILIKE $${p.length})`); }
    if (f.state) { p.push(f.state); where.push(`$${p.length} = ANY(i.states_served)`); }
    if (f.status) { p.push(f.status); where.push(`i.status = $${p.length}`); }
    if (f.source) { p.push(f.source); where.push(`EXISTS (SELECT 1 FROM plants pl WHERE pl.ipp_id=i.id AND pl.energy_source=$${p.length})`); }
    return this.db.query(
      `SELECT i.*,
         COALESCE((SELECT sum(available_mw) FROM plants WHERE ipp_id=i.id),0) AS available_mw,
         COALESCE((SELECT array_agg(DISTINCT energy_source) FROM plants WHERE ipp_id=i.id),'{}') AS sources,
         (SELECT count(*) FROM deals WHERE ipp_id=i.id)::int AS deal_count
       FROM ipps i WHERE ${where.join(' AND ')} ORDER BY i.legal_name`,
      p,
    );
  }

  async get(id: string) {
    const ipp = await this.db.one('SELECT * FROM ipps WHERE id=$1', [id]);
    if (!ipp) throw new NotFoundException('IPP not found');
    const [plants, contacts, deals] = await Promise.all([
      this.db.query('SELECT * FROM plants WHERE ipp_id=$1 ORDER BY name', [id]),
      this.db.query('SELECT * FROM ipp_contacts WHERE ipp_id=$1 ORDER BY name', [id]),
      this.db.query(
        `SELECT d.id,d.status,d.requirement_id,r.title AS requirement_title,g.company_name
         FROM deals d JOIN requirements r ON r.id=d.requirement_id JOIN ges g ON g.id=r.ges_id
         WHERE d.ipp_id=$1 ORDER BY d.created_at DESC`, [id]),
    ]);
    return { ...ipp, plants, contacts, deals };
  }

  async create(b: any, u: AuthUser, ip: string) {
    if (!b.legal_name) throw new BadRequestException('legal_name is required');
    return this.db.tx(async (c) => {
      const d = pick(b, IPP_FIELDS);
      const cols = Object.keys(d);
      const row = (await c.query(
        `INSERT INTO ipps(${cols.join(',')},created_by) VALUES(${cols.map((_, i) => '$' + (i + 1)).join(',')},$${cols.length + 1}) RETURNING *`,
        [...cols.map((k) => d[k]), u.id],
      )).rows[0];
      for (const pl of b.plants || []) await this.insertPlant(c, row.id, pl);
      for (const ct of b.contacts || []) await this.insertContact(c, row.id, ct);
      await this.audit.log(c, u, 'create', 'ipp', row.id, null, row, null, ip);
      return row;
    });
  }

  async update(id: string, b: any, u: AuthUser, ip: string) {
    return this.db.tx(async (c) => {
      const old = (await c.query('SELECT * FROM ipps WHERE id=$1 FOR UPDATE', [id])).rows[0];
      if (!old) throw new NotFoundException('IPP not found');
      const d = pick(b, IPP_FIELDS);
      if (b.is_active === false) d.is_active = false;
      const cols = Object.keys(d);
      if (!cols.length) return old;
      const row = (await c.query(
        `UPDATE ipps SET ${cols.map((k, i) => `${k}=$${i + 1}`).join(',')} WHERE id=$${cols.length + 1} RETURNING *`,
        [...cols.map((k) => d[k]), id],
      )).rows[0];
      await this.audit.log(c, u, 'update', 'ipp', id, old, row, null, ip);
      return row;
    });
  }

  async verify(id: string, u: AuthUser, ip: string) {
    return this.db.tx(async (c) => {
      const old = (await c.query('SELECT * FROM ipps WHERE id=$1 FOR UPDATE', [id])).rows[0];
      if (!old) throw new NotFoundException('IPP not found');
      const row = (await c.query(
        `UPDATE ipps SET status='verified', last_verified_on=current_date, verified_by=$2 WHERE id=$1 RETURNING *`,
        [id, u.id])).rows[0];
      await this.audit.log(c, u, 'verify', 'ipp', id, { status: old.status, last_verified_on: old.last_verified_on }, { status: row.status, last_verified_on: row.last_verified_on }, null, ip);
      return row;
    });
  }

  private async insertPlant(c: any, ippId: string, b: any) {
    const d = pick(b, PLANT_FIELDS);
    if (!d.name || !d.energy_source || !d.state) throw new BadRequestException('Plant needs name, energy_source and state');
    const cols = Object.keys(d);
    return (await c.query(
      `INSERT INTO plants(ipp_id,${cols.join(',')}) VALUES($1,${cols.map((_, i) => '$' + (i + 2)).join(',')}) RETURNING *`,
      [ippId, ...cols.map((k) => d[k])])).rows[0];
  }

  private async insertContact(c: any, ippId: string, b: any) {
    if (!b.name) throw new BadRequestException('Contact needs a name');
    return (await c.query(
      'INSERT INTO ipp_contacts(ipp_id,name,role,phone,email) VALUES($1,$2,$3,$4,$5) RETURNING *',
      [ippId, b.name, b.role ?? null, b.phone ?? null, b.email ?? null])).rows[0];
  }

  addPlant(id: string, b: any, u: AuthUser, ip: string) {
    return this.db.tx(async (c) => {
      const row = await this.insertPlant(c, id, b);
      await this.audit.log(c, u, 'create', 'plant', row.id, null, row, null, ip);
      return row;
    });
  }

  addContact(id: string, b: any, u: AuthUser, ip: string) {
    return this.db.tx(async (c) => {
      const row = await this.insertContact(c, id, b);
      await this.audit.log(c, u, 'create', 'ipp_contact', row.id, null, row, null, ip);
      return row;
    });
  }
}
