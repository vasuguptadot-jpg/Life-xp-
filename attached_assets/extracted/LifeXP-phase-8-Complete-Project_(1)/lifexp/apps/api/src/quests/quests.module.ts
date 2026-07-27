import { Module } from '@nestjs/common';
import { QuestsService } from './quests.service';
import { QuestsController } from './quests.controller';

@Module({
  providers: [QuestsService],
  controllers: [QuestsController],
  exports: [QuestsService],
})
export class QuestsModule {}