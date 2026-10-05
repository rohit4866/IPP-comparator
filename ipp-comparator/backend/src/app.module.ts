import { Module } from '@nestjs/common';
import { DbModule } from './db/db.module';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { IppsService } from './ipps/ipps.service';
import { IppsController } from './ipps/ipps.controller';
import { RequirementsService } from './requirements/requirements.service';
import { RequirementsController } from './requirements/requirements.controller';
import { ChargesController } from './charges/charges.controller';
import { DealsService } from './deals/deals.service';
import { NegotiationService } from './deals/negotiation.service';
import { DealsController } from './deals/deals.controller';
import { ComparatorService } from './comparator/comparator.service';
import { ComparatorController } from './comparator/comparator.controller';
import { DashboardController } from './dashboard/dashboard.controller';

@Module({
  imports: [DbModule, AuditModule, AuthModule],
  controllers: [IppsController, RequirementsController, ChargesController, DealsController, ComparatorController, DashboardController],
  providers: [IppsService, RequirementsService, DealsService, NegotiationService, ComparatorService],
})
export class AppModule {}
