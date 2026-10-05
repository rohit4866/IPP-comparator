import { Body, Controller, Get, Post } from '@nestjs/common';
import { DbService } from '../db/db.service';
import { AuditService } from '../audit/audit.service';
import { CurrentUser, Ip, Roles } from '../auth/decorators';
import { AuthUser } from '../common/types';

@Roles('admin', 'procurement', 'reviewer', 'viewer')
@Controller('charges')
export class ChargesController {
  constructor(private db: DbService, private audit: AuditService) {}

  @Get() list() { return this.db.query('SELECT * FROM state_charges ORDER BY state, effective_from DESC'); }

  @Roles('admin', 'procurement')
  @Post()
  create(@Body() b: any, @CurrentUser() u: AuthUser, @Ip() ip: string) {
    return this.db.tx(async (c) => {
      // close the previous open row for this state so only one set is effective at a time
      await c.query(
        `UPDATE state_charges SET effective_to = COALESCE($2::date, current_date) - 1
         WHERE state=$1 AND effective_to IS NULL`, [b.state, b.effective_from ?? null]);
      const row = (await c.query(
        `INSERT INTO state_charges(state,wheeling,css,transmission,other_charges,banking_adjustment,effective_from)
         VALUES($1,$2,$3,$4,$5,$6,COALESCE($7::date,current_date)) RETURNING *`,
        [b.state, b.wheeling ?? 0, b.css ?? 0, b.transmission ?? 0, b.other_charges ?? 0, b.banking_adjustment ?? 0, b.effective_from ?? null])).rows[0];
      await this.audit.log(c, u, 'create', 'state_charges', row.id, null, row, null, ip);
      return row;
    });
  }
}
