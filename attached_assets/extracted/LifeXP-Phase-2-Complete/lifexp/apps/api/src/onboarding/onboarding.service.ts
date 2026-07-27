import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateOnboardingStepDto } from './dto/onboarding.dto';
import { UpdateProfileDto } from './dto/onboarding.dto';
import { SelectGoalsDto } from './dto/onboarding.dto';
import { SelectArchetypeDto } from './dto/onboarding.dto';

@Injectable()
export class OnboardingService {
  constructor(private prisma: PrismaService) {}

  async getOnboardingState(userId: string) {
    let state = await this.prisma.onboardingState.findUnique({
      where: { userId },
    });

    if (!state) {
      state = await this.prisma.onboardingState.create({
        data: { userId, currentStep: 1, isCompleted: false },
      });
    }
    return state;
  }

  async updateStep(userId: string, dto: UpdateOnboardingStepDto) {
    return this.prisma.onboardingState.update({
      where: { userId },
      data: {
        currentStep: dto.currentStep,
        isCompleted: dto.isCompleted ?? false,
        completedAt: dto.isCompleted ? new Date() : undefined,
      },
    });
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    return this.prisma.userProfile.upsert({
      where: { userId },
      create: {
        userId,
        heightCm: dto.heightCm,
        weightKg: dto.weightKg ? parseFloat(dto.weightKg) : null,
        activityLevel: dto.activityLevel,
        dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : null,
      },
      update: {
        heightCm: dto.heightCm,
        weightKg: dto.weightKg ? parseFloat(dto.weightKg) : null,
        activityLevel: dto.activityLevel,
        dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : null,
      },
    });
  }

  async saveGoals(userId: string, dto: SelectGoalsDto) {
    // Remove existing goals
    await this.prisma.userGoal.deleteMany({ where: { userId } });

    const goalsToCreate = dto.goals.map((goalKey, index) => ({
      userId,
      goalKey,
      isPrimary: goalKey === dto.primaryGoal,
    }));

    await this.prisma.userGoal.createMany({ data: goalsToCreate });
    return { success: true };
  }

  async selectArchetype(userId: string, dto: SelectArchetypeDto) {
    // Check if archetype exists
    const archetype = await this.prisma.archetype.findUnique({
      where: { id: dto.archetypeId },
    });

    if (!archetype) {
      throw new BadRequestException('Invalid archetype');
    }

    return this.prisma.userCharacter.upsert({
      where: { userId },
      create: {
        userId,
        archetypeId: dto.archetypeId,
      },
      update: {
        archetypeId: dto.archetypeId,
      },
    });
  }

  async completeOnboarding(userId: string) {
    return this.prisma.onboardingState.update({
      where: { userId },
      data: {
        isCompleted: true,
        completedAt: new Date(),
        currentStep: 7,
      },
    });
  }

  async getFullOnboardingData(userId: string) {
    const [state, profile, character, goals] = await Promise.all([
      this.getOnboardingState(userId),
      this.prisma.userProfile.findUnique({ where: { userId } }),
      this.prisma.userCharacter.findUnique({
        where: { userId },
        include: { archetype: true },
      }),
      this.prisma.userGoal.findMany({ where: { userId } }),
    ]);

    return { state, profile, character, goals };
  }
}