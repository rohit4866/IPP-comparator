import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { DbService } from '../db/db.service';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../common/types';

@Injectable()
export class AuthService {
  constructor(private db: DbService, private jwt: JwtService, private audit: AuditService) {}

  async login(email: string, password: string, ip: string) {
    const u = await this.db.one('SELECT * FROM users WHERE lower(email)=lower($1)', [email || '']);
    if (!u || !u.is_active || !(await bcrypt.compare(password || '', u.password_hash))) {
      throw new UnauthorizedException('Wrong email or password');
    }
    const user = { id: u.id, email: u.email, name: u.name, role: u.role, ges_id: u.ges_id };
    await this.audit.log(this.db, user as AuthUser, 'login', 'user', u.id, null, null, null, ip);
    return { token: this.jwt.sign({ sub: u.id }), user };
  }

  async listUsers() {
    return this.db.query(
      `SELECT u.id,u.email,u.name,u.role,u.ges_id,u.is_active,g.company_name
       FROM users u LEFT JOIN ges g ON g.id=u.ges_id ORDER BY u.created_at`,
    );
  }

  async createUser(b: any, actor: AuthUser, ip: string) {
    if (!b.email || !b.name || !b.password || !b.role) throw new BadRequestException('email, name, password and role are required');
    if (b.password.length < 8) throw new BadRequestException('Password must be at least 8 characters');
    if (b.role === 'ges' && !b.ges_id) throw new BadRequestException('GES users need a ges_id');
    const hash = await bcrypt.hash(b.password, 10);
    const row = await this.db.tx(async (c) => {
      const r = (
        await c.query(
          `INSERT INTO users(email,name,password_hash,role,ges_id) VALUES($1,$2,$3,$4,$5)
           RETURNING id,email,name,role,ges_id`,
          [b.email, b.name, hash, b.role, b.role === 'ges' ? b.ges_id : null],
        )
      ).rows[0];
      await this.audit.log(c, actor, 'create', 'user', r.id, null, r, null, ip);
      return r;
    });
    return row;
  }
}
