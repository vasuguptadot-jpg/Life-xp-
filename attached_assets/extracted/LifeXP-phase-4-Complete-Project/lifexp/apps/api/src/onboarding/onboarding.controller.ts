import { Controller, Get, Post, Patch, Body, UseGuards, Request } from '@nestjs/common';
import { OnboardingService } from './onboarding.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UpdateOnboardingStepDto, UpdateProfileDto, SelectGoalsDto, SelectArchetypeDto } from './dto/onboarding.dto';

@Controller('onboarding')
@UseGuards(JwtAuthGuard)
export class OnboardingController {
  constructor(private onboardingService: OnboardingService) {}

  @Get()
  async getState(@Request() req) {
    return this.onboardingService.getOnboardingState(req.user.id);
  }

  @Patch('step')
  async updateStep(@Request() req, @Body() dto: UpdateOnboardingStepDto) {
    return this.onboardingService.updateStep(req.user.id, dto);
  }

  @Patch('profile')
  async updateProfile(@Request() req, @Body() dto: UpdateProfileDto) {
    return this.onboardingService.updateProfile(req.user.id, dto);
  }

  @Post('goals')
  async saveGoals(@Request() req, @Body() dto: SelectGoalsDto) {
    return this.onboardingService.saveGoals(req.user.id, dto);
  }

  @Post('archetype')
  async selectArchetype(@Request() req, @Body() dto: SelectArchetypeDto) {
    return this.onboardingService.selectArchetype(req.user.id, dto);
  }

  @Post('complete')
  async complete(@Request() req) {
    return this.onboardingService.completeOnboarding(req.user.id);
  }

  @Get('summary')
  async getSummary(@Request() req) {
    return this.onboardingService.getFullOnboardingData(req.user.id);
  }
}