import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { DealsService } from './deals.service';
import { NegotiationService } from './negotiation.service';
import { CurrentUser, Ip, Roles } from '../auth/decorators';
import { AuthUser } from '../common/types';

const WRITE = ['admin', 'procurement'] as const;

@Controller()
export class DealsController {
  constructor(private deals: DealsService, private neg: NegotiationService) {}

  @Get('deals') list(@CurrentUser() u: AuthUser, @Query() q: any) { return this.deals.list(u, q); }
  @Get('deals/:id') get(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() u: AuthUser) { return this.deals.get(id, u); }
  @Get('requirements/:id/mindmap') mindmap(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() u: AuthUser) { return this.deals.mindmap(id, u); }

  @Roles(...WRITE) @Post('deals')
  create(@Body() b: any, @CurrentUser() u: AuthUser, @Ip() ip: string) { return this.deals.create(b, u, ip); }

  @Roles(...WRITE) @Post('deals/:id/rounds')
  createRound(@Param('id', ParseUUIDPipe) id: string, @Body() b: any, @CurrentUser() u: AuthUser, @Ip() ip: string) { return this.neg.createRound(id, b, u, ip); }

  @Roles(...WRITE) @Patch('rounds/:id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() b: any, @CurrentUser() u: AuthUser, @Ip() ip: string) { return this.neg.updateDraft(id, b, u, ip); }

  @Roles(...WRITE) @Delete('rounds/:id')
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() u: AuthUser, @Ip() ip: string) { return this.neg.deleteDraft(id, u, ip); }

  @Roles(...WRITE) @Post('rounds/:id/submit')
  submit(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() u: AuthUser, @Ip() ip: string) { return this.neg.submitRound(id, u, ip); }

  @Roles(...WRITE) @Post('rounds/:id/attachments')
  attach(@Param('id', ParseUUIDPipe) id: string, @Body() b: any, @CurrentUser() u: AuthUser, @Ip() ip: string) { return this.neg.addAttachment(id, b, u, ip); }

  @Roles('admin', 'procurement', 'reviewer') @Post('rounds/:id/feasible')
  feasible(@Param('id', ParseUUIDPipe) id: string, @Body() b: any, @CurrentUser() u: AuthUser, @Ip() ip: string) { return this.neg.markFeasible(id, b, u, ip); }

  @Roles('admin', 'procurement', 'reviewer') @Post('rounds/:id/withdraw-feasible')
  withdraw(@Param('id', ParseUUIDPipe) id: string, @Body() b: any, @CurrentUser() u: AuthUser, @Ip() ip: string) { return this.neg.withdrawFeasible(id, b, u, ip); }

  @Roles('ges') @Post('deals/:id/lock')
  lock(@Param('id', ParseUUIDPipe) id: string, @Body() b: any, @CurrentUser() u: AuthUser, @Ip() ip: string) { return this.neg.lock(id, b, u, ip); }
}
