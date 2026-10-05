import { Body, Controller, Get, Post } from '@nestjs/common';
import { AuthService } from './auth.service';
import { CurrentUser, Ip, Public, Roles } from './decorators';
import { AuthUser } from '../common/types';

@Controller()
export class AuthController {
  constructor(private auth: AuthService) {}

  @Public()
  @Post('auth/login')
  login(@Body() b: any, @Ip() ip: string) {
    return this.auth.login(b.email, b.password, ip);
  }

  @Get('auth/me')
  me(@CurrentUser() u: AuthUser) {
    return u;
  }

  @Roles('admin')
  @Get('users')
  users() {
    return this.auth.listUsers();
  }

  @Roles('admin')
  @Post('users')
  createUser(@Body() b: any, @CurrentUser() u: AuthUser, @Ip() ip: string) {
    return this.auth.createUser(b, u, ip);
  }
}
