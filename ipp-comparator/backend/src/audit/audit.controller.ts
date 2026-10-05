import { Controller, Get, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import { AuditService } from './audit.service';
import { Roles } from '../auth/decorators';

@Controller('audit')
export class AuditController {
  constructor(private audit: AuditService) {}

  @Roles('admin', 'reviewer', 'viewer')
  @Get()
  async list(@Query() q: any, @Res({ passthrough: true }) res: Response) {
    const rows = await this.audit.search(q);
    if (q.format === 'csv') {
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="audit.csv"');
      const cols = ['id', 'at', 'user_name', 'role', 'action', 'entity', 'entity_id', 'remark', 'ip', 'old_value', 'new_value'];
      const esc = (v: any) => `"${String(v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : v).replace(/"/g, '""')}"`;
      return [cols.join(','), ...rows.map((r: any) => cols.map((c) => esc(r[c])).join(','))].join('\n');
    }
    return rows;
  }
}
