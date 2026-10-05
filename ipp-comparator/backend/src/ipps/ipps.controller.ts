import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { IppsService } from './ipps.service';
import { CurrentUser, Ip, Roles } from '../auth/decorators';
import { AuthUser } from '../common/types';

@Roles('admin', 'procurement', 'reviewer', 'viewer')
@Controller('ipps')
export class IppsController {
  constructor(private s: IppsService) {}

  @Get() list(@Query() q: any) { return this.s.list(q); }
  @Get(':id') get(@Param('id', ParseUUIDPipe) id: string) { return this.s.get(id); }

  @Roles('admin', 'procurement')
  @Post() create(@Body() b: any, @CurrentUser() u: AuthUser, @Ip() ip: string) { return this.s.create(b, u, ip); }

  @Roles('admin', 'procurement')
  @Patch(':id') update(@Param('id', ParseUUIDPipe) id: string, @Body() b: any, @CurrentUser() u: AuthUser, @Ip() ip: string) { return this.s.update(id, b, u, ip); }

  @Roles('admin', 'reviewer')
  @Post(':id/verify') verify(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() u: AuthUser, @Ip() ip: string) { return this.s.verify(id, u, ip); }

  @Roles('admin', 'procurement')
  @Post(':id/plants') plant(@Param('id', ParseUUIDPipe) id: string, @Body() b: any, @CurrentUser() u: AuthUser, @Ip() ip: string) { return this.s.addPlant(id, b, u, ip); }

  @Roles('admin', 'procurement')
  @Post(':id/contacts') contact(@Param('id', ParseUUIDPipe) id: string, @Body() b: any, @CurrentUser() u: AuthUser, @Ip() ip: string) { return this.s.addContact(id, b, u, ip); }
}
