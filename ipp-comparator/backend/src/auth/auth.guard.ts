import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { DbService } from '../db/db.service';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private jwt: JwtService, private reflector: Reflector, private db: DbService) {}

  async canActivate(ctx: ExecutionContext) {
    const targets = [ctx.getHandler(), ctx.getClass()];
    if (this.reflector.getAllAndOverride<boolean>('public', targets)) return true;

    const req = ctx.switchToHttp().getRequest();
    const header: string = req.headers['authorization'] || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) throw new UnauthorizedException('Missing token');
    let payload: any;
    try {
      payload = this.jwt.verify(token);
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }
    const user = await this.db.one(
      'SELECT id,email,name,role,ges_id,is_active FROM users WHERE id=$1',
      [payload.sub],
    );
    if (!user || !user.is_active) throw new UnauthorizedException('User inactive');
    req.user = user;

    const roles = this.reflector.getAllAndOverride<string[]>('roles', targets);
    if (roles && !roles.includes(user.role)) {
      throw new ForbiddenException(`Role '${user.role}' is not allowed to do this`);
    }
    return true;
  }
}
