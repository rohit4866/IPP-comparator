import { Body, Controller, Post } from '@nestjs/common';
import { ComparatorService } from './comparator.service';
import { Roles } from '../auth/decorators';

@Roles('admin', 'procurement', 'reviewer', 'viewer')
@Controller('comparator')
export class ComparatorController {
  constructor(private s: ComparatorService) {}
  @Post() compare(@Body() b: any) { return this.s.compare(b); }
}
