import { Module } from '@nestjs/common';
import { WillController } from './will.controller';
import { WillService } from './will.service';

@Module({
  controllers: [WillController],
  providers: [WillService],
  exports: [WillService],
})
export class WillModule {}
