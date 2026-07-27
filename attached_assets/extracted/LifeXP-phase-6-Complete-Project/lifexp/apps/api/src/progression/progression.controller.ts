import { Controller, Post, Get, Body, UseGuards, Request } from '@nestjs/common';
import { ProgressionService } from './progression.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('progression')
@UseGuards(JwtAuthGuard)
export class ProgressionController {
  constructor(private progressionService: ProgressionService) {}

  @Post('award')
  async award(@Request() req, @Body() body: any) {
    return this.progressionService.awardProgression({
      userId: req.user.id,
      ...body,
    });
  }

  @Get('summary')
  async getSummary(@Request() req) {
    return this.progressionService.getUserProgress(req.user.id);
  }
}