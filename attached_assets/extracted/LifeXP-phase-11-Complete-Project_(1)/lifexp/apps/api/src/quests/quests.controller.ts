import { Controller, Get, Post, Patch, Param, Body, UseGuards, Request } from '@nestjs/common';
import { QuestsService } from './quests.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('quests')
@UseGuards(JwtAuthGuard)
export class QuestsController {
  constructor(private questsService: QuestsService) {}

  @Get()
  async getMyQuests(@Request() req) {
    return this.questsService.getUserQuests(req.user.id);
  }

  @Get(':id')
  async getQuest(@Request() req, @Param('id') id: string) {
    return this.questsService.getQuestById(req.user.id, id);
  }

  @Patch(':id/progress')
  async updateProgress(
    @Request() req,
    @Param('id') id: string,
    @Body('progress') progress: number,
  ) {
    return this.questsService.updateProgress(req.user.id, id, progress);
  }

  @Post(':id/complete')
  async completeQuest(@Request() req, @Param('id') id: string) {
    return this.questsService.completeQuest(req.user.id, id);
  }
}