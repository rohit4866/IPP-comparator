import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { RequirementsService } from './requirements.service';
import { CurrentUser, Ip, Roles } from '../auth/decorators';
import { AuthUser } from '../common/types';

@Controller()
export class RequirementsController {
  constructor(private s: RequirementsService) {}

  @Get('requirements') list(@CurrentUser() u: AuthUser) { return this.s.list(u); }
  @Get('requirements/:id') get(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() u: AuthUser) { return this.s.get(id, u); }

  @Roles('admin', 'procurement', 'ges')
  @Post('requirements') create(@Body() b: any, @CurrentUser() u: AuthUser, @Ip() ip: string) { return this.s.create(b, u, ip); }

  @Roles('admin', 'procurement', 'reviewer', 'viewer')
  @Get('ges') ges() { return this.s.listGes(); }

  @Roles('admin', 'procurement')
  @Post('ges') createGes(@Body() b: any, @CurrentUser() u: AuthUser, @Ip() ip: string) { return this.s.createGes(b, u, ip); }
}
