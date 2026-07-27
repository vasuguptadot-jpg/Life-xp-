import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ATTRIBUTES, isValidAttribute, Attribute } from './attribute.registry';

interface AttributeProgressInput {
  attribute: Attribute;
  xp: number;
}

interface AwardProgressionInput {
  userId: string;
  sourceType: string;
  sourceId?: string;
  idempotencyKey?: string;
  xp?: number;                    // Global XP
  category?: string;
  attributes?: AttributeProgressInput[];
  description?: string;
}

@Injectable()
export class ProgressionService {
  constructor(private prisma: PrismaService) {}

  private calculateLevel(totalXp: number): number {
    // Simple deterministic level curve: Level = floor(sqrt(totalXp / 100)) + 1
    return Math.floor(Math.sqrt(totalXp / 100)) + 1;
  }

  async awardProgression(input: AwardProgressionInput) {
    const { 
      userId, 
      sourceType, 
      sourceId, 
      idempotencyKey, 
      xp = 0, 
      category, 
      attributes = [], 
      description 
    } = input;

    // Validation
    if (xp < 0) throw new BadRequestException('Global XP cannot be negative');
    if (attributes.some(a => a.xp <= 0)) throw new BadRequestException('Attribute XP must be positive');
    if (attributes.some(a => !isValidAttribute(a.attribute))) {
      throw new BadRequestException('Invalid attribute');
    }

    // Idempotency check
    if (idempotencyKey) {
      const existing = await this.prisma.xpTransaction.findUnique({
        where: { idempotencyKey },
      });
      if (existing) {
        return { success: true, message: 'Duplicate event - XP already awarded', transaction: existing };
      }
    }

    return this.prisma.$transaction(async (tx) => {
      // 1. Create XP Transaction (Global XP)
      let transaction = null;
      if (xp > 0) {
        transaction = await tx.xpTransaction.create({
          data: {
            userId,
            amount: xp,
            sourceType,
            sourceId,
            idempotencyKey,
            category,
            description,
          },
        });
      }

      // 2. Update Global Level
      let userLevel = await tx.userLevel.findUnique({ where: { userId } });
      let previousLevel = userLevel?.currentLevel || 1;
      
      if (xp > 0) {
        userLevel = await tx.userLevel.upsert({
          where: { userId },
          create: { userId, totalXp: xp, currentLevel: this.calculateLevel(xp) },
          update: { totalXp: { increment: xp } },
        });
      }

      const newLevel = this.calculateLevel(userLevel?.totalXp || 0);
      const globalLevelUp = newLevel > previousLevel;

      if (globalLevelUp && userLevel) {
        await tx.userLevel.update({
          where: { userId },
          data: { currentLevel: newLevel },
        });
      }

      // 3. Award Attribute XP
      const attributeResults: any[] = [];

      for (const attr of attributes) {
        // Check idempotency for attribute (use composite key approach)
        const attrIdempotencyKey = `${idempotencyKey || sourceId}_${attr.attribute}`;
        
        const existingAttr = await tx.attributeHistory.findFirst({
          where: {
            userId,
            attribute: attr.attribute,
            sourceId: sourceId || undefined,
          },
        });

        if (existingAttr) continue; // Skip duplicate

        // Update UserAttribute
        const userAttr = await tx.userAttribute.upsert({
          where: { userId_attribute: { userId, attribute: attr.attribute } },
          create: { userId, attribute: attr.attribute, currentValue: attr.xp },
          update: { currentValue: { increment: attr.xp } },
        });

        // Record history
        await tx.attributeHistory.create({
          data: {
            userId,
            attribute: attr.attribute,
            delta: attr.xp,
            sourceType,
            sourceId,
          },
        });

        // Calculate attribute level (simple curve)
        const attrLevel = Math.floor(Math.sqrt(userAttr.currentValue / 50)) + 1;
        
        attributeResults.push({
          attribute: attr.attribute,
          xpAwarded: attr.xp,
          newTotal: userAttr.currentValue,
          newLevel: attrLevel,
        });
      }

      return {
        success: true,
        globalXpAwarded: xp,
        globalLevelUpOccurred: globalLevelUp,
        newGlobalLevel: newLevel,
        attributes: attributeResults,
        transaction,
      };
    });
  }

  async getUserProgress(userId: string) {
    const [level, attributes, recentTransactions] = await Promise.all([
      this.prisma.userLevel.findUnique({ where: { userId } }),
      this.prisma.userAttribute.findMany({ where: { userId } }),
      this.prisma.xpTransaction.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
    ]);

    return { level, attributes, recentTransactions };
  }
}