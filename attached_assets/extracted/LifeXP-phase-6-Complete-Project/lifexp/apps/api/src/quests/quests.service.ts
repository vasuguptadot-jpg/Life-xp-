import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class QuestsService {
  constructor(private prisma: PrismaService) {}

  // Get all active quest templates (catalogue)
  async getQuestCatalogue() {
    return this.prisma.questTemplate.findMany({
      where: { isActive: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  // Get user's current quests
  async getUserQuests(userId: string) {
    return this.prisma.userQuest.findMany({
      where: { userId },
      include: { questTemplate: true },
      orderBy: { assignedAt: 'desc' },
    });
  }

  // Get specific user quest
  async getQuestById(userId: string, questId: string) {
    const quest = await this.prisma.userQuest.findFirst({
      where: { id: questId, userId },
      include: { questTemplate: true },
    });

    if (!quest) throw new NotFoundException('Quest not found');
    return quest;
  }

  // Update progress on a quest
  async updateProgress(userId: string, questId: string, newProgress: number) {
    const quest = await this.getQuestById(userId, questId);

    if (quest.status !== 'ASSIGNED' && quest.status !== 'IN_PROGRESS') {
      throw new BadRequestException('Quest cannot be updated in current state');
    }

    const updated = await this.prisma.userQuest.update({
      where: { id: questId },
      data: {
        progressValue: Math.min(newProgress, Number(quest.targetValue)),
        status: newProgress >= Number(quest.targetValue) ? 'COMPLETED' : 'IN_PROGRESS',
      },
    });

    return updated;
  }

  // Complete a quest
  async completeQuest(userId: string, questId: string) {
    const quest = await this.getQuestById(userId, questId);

    if (quest.status === 'COMPLETED') {
      return { success: true, message: 'Quest already completed' };
    }

    if (quest.status !== 'ASSIGNED' && quest.status !== 'IN_PROGRESS') {
      throw new BadRequestException('Quest cannot be completed in current state');
    }

    const updatedQuest = await this.prisma.userQuest.update({
      where: { id: questId },
      data: {
        status: 'COMPLETED',
        completedAt: new Date(),
        progressValue: quest.targetValue,
      },
    });

    // TODO: Call ProgressionService in future
    return {
      success: true,
      quest: updatedQuest,
      message: 'Quest completed successfully',
    };
  }

  // === ASSIGNMENT ENGINE (Basic version) ===
  async getRecommendedQuests(userId: string, limit = 5) {
    // Get user's active quests to avoid duplicates
    const activeQuests = await this.prisma.userQuest.findMany({
      where: {
        userId,
        status: { in: ['ASSIGNED', 'IN_PROGRESS'] },
      },
      select: { questTemplateId: true },
    });

    const activeIds = activeQuests.map(q => q.questTemplateId);

    // Get eligible quests (simple version)
    const eligibleQuests = await this.prisma.questTemplate.findMany({
      where: {
        isActive: true,
        id: { notIn: activeIds },
      },
      take: limit,
      orderBy: { createdAt: 'desc' },
    });

    return eligibleQuests;
  }

  async assignQuest(userId: string, questTemplateId: string) {
    const template = await this.prisma.questTemplate.findUnique({
      where: { id: questTemplateId },
    });

    if (!template || !template.isActive) {
      throw new BadRequestException('Quest template not available');
    }

    // Prevent duplicate active quests
    const existing = await this.prisma.userQuest.findFirst({
      where: {
        userId,
        questTemplateId,
        status: { in: ['ASSIGNED', 'IN_PROGRESS'] },
      },
    });

    if (existing) {
      throw new BadRequestException('Quest already assigned');
    }

    const newQuest = await this.prisma.userQuest.create({
      data: {
        userId,
        questTemplateId,
        targetValue: template.targetValue || 1,
        status: 'ASSIGNED',
      },
      include: { questTemplate: true },
    });

    return newQuest;
  }
}