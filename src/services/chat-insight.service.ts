import prisma from '../models/prisma';
import { extractInsights, mergeInsight } from './insight.service';
import { getClassModifiers, ProfileClass } from './profile-class.service';

export async function upsertTodayInsight(
  userId: string,
  text: string,
  _cls: ProfileClass,
  mods: ReturnType<typeof getClassModifiers>
) {
  const insight = extractInsights(text, {
    mildMultiplier: mods.mildMultiplier,
    moderateThreshold: mods.moderateThreshold,
    highThreshold: mods.highThreshold,
  });

  const today = new Date();
  const dayKey = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));

  const existing = await prisma.chatInsight.findUnique({
    where: { userId_date: { userId, date: dayKey } },
  });

  const merged = mergeInsight(
    existing
      ? {
          alertScore: existing.alertScore,
          messageCount: existing.messageCount,
          keywords: existing.keywords,
          notableSentences: existing.notableSentences,
        }
      : null,
    insight,
    {
      moderateThreshold: mods.moderateThreshold,
      highThreshold: mods.highThreshold,
    }
  );

  if (existing) {
    await prisma.chatInsight.update({
      where: { id: existing.id },
      data: {
        alertScore: merged.alertScore,
        alertLevel: merged.alertLevel,
        keywords: merged.keywords,
        notableSentences: merged.notableSentences,
        messageCount: merged.messageCount,
      },
    });
    return;
  }

  await prisma.chatInsight.create({
    data: {
      userId,
      date: dayKey,
      alertScore: merged.alertScore,
      alertLevel: merged.alertLevel,
      keywords: merged.keywords,
      notableSentences: merged.notableSentences,
      messageCount: merged.messageCount,
    },
  });
}
