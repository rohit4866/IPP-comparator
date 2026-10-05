import { Injectable } from '@nestjs/common';
import { DbService, Q } from '../db/db.service';
import { AuthUser } from '../common/types';

@Injectable()
export class AuditService {
  constructor(private db: DbService) {}

  /** Write an audit entry using the given client so it joins the caller's transaction. */
  async log(
    q: Q | DbService,
    user: AuthUser | null,
    action: string,
    entity: string,
    entityId: string | null,
    oldValue: any = null,
    newValue: any = null,
    remark: string | null = null,
    ip: string | null = null,
  ) {
    const sql = `INSERT INTO audit_log(user_id,role,action,entity,entity_id,old_value,new_value,remark,ip)
                 VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`;
    const params = [
      user?.id ?? null, user?.role ?? null, action, entity, entityId,
      oldValue == null ? null : JSON.stringify(oldValue),
      newValue == null ? null : JSON.stringify(newValue),
      remark, ip,
    ];
    if (q instanceof DbService) await q.query(sql, params);
    else await q.query(sql, params);
  }

  async search(f: any) {
    const where: string[] = [];
    const p: any[] = [];
    const add = (cond: string, v: any) => { p.push(v); where.push(cond.replace('?', `$${p.length}`)); };
    if (f.entity) add('a.entity = ?', f.entity);
    if (f.entity_id) add('a.entity_id = ?', f.entity_id);
    if (f.user_id) add('a.user_id = ?', f.user_id);
    if (f.action) add('a.action = ?', f.action);
    if (f.from) add('a.at >= ?', f.from);
    if (f.to) add("a.at < (?::date + 1)", f.to);
    const limit = Math.min(parseInt(f.limit || '200', 10) || 200, 2000);
    return this.db.query(
      `SELECT a.*, u.name AS user_name FROM audit_log a LEFT JOIN users u ON u.id=a.user_id
       ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
       ORDER BY a.id DESC LIMIT ${limit}`,
      p,
    );
  }
}
