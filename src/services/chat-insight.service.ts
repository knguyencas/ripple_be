import prisma from '../models/prisma';
import { extractInsights, mergeInsight, InsightResult } from './insight.service';
import { getClassModifiers, ProfileClass } from './profile-class.service';
import { analyzeText } from './nlp.service';

/**
 * Combine lexicon insight + NLP model output for a single chat message.
 * - Lexicon catches explicit VN keywords.
 * - Model catches semantic / paraphrased distress lexicon misses.
 * Final score = max of both; ideation from either source locks score ≥ 0.8.
 */
async function buildCombinedInsight(
  userId: string,
  text: string,
  mods: ReturnType<typeof getClassModifiers>
): Promise<InsightResult> {
  const lex = extractInsights(text, mods);
  if (text.trim().length < 5) return lex;

  const nlp = await analyzeText(text, userId);
  if (!nlp) return lex;

  const modelScore = Math.min(1, nlp.phq_score / 27);
  const nlpIdeation = nlp.c9_ideation >= 0.7;

  let finalScore = Math.max(lex.score, modelScore);
  if (nlp.risk_flag) finalScore = Math.max(finalScore, 0.8);

  const hasIdeation = lex.hasIdeation || nlpIdeation;
  if (hasIdeation) finalScore = Math.max(finalScore, 0.8);

  const keywords = [...lex.keywords];
  if (nlpIdeation && !keywords.includes('[nlp:ideation]')) keywords.push('[nlp:ideation]');
  if (nlp.severity_id === 4 && !keywords.includes('[nlp:severe]')) keywords.push('[nlp:severe]');
  if (nlp.severity_id === 3 && !keywords.includes('[nlp:mod_severe]'))
    keywords.push('[nlp:mod_severe]');

  const level: 'low' | 'moderate' | 'high' =
    hasIdeation || finalScore >= mods.highThreshold
      ? 'high'
      : finalScore >= mods.moderateThreshold
        ? 'moderate'
        : 'low';

  return {
    ...lex,
    score: finalScore,
    level,
    hasIdeation,
    keywords,
  };
}

export async function upsertTodayInsight(
  userId: string,
  text: string,
  _cls: ProfileClass,
  mods: ReturnType<typeof getClassModifiers>
) {
  const insight = await buildCombinedInsight(userId, text, mods);

  const today = new Date();
  const dayKey = new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())
  );

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
  } else {
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

  // Roll up lifetime
  await recomputeUserLifetimeChatStats(userId);
}

export async function recomputeUserLifetimeChatStats(userId: string) {
  const days = await prisma.chatInsight.findMany({
    where: { userId },
    select: { alertScore: true },
  });
  const total = days.length;
  const avg = total ? days.reduce((s, d) => s + d.alertScore, 0) / total : 0;

  await prisma.user.update({
    where: { id: userId },
    data: { lifetimeChatScore: avg, totalChatDays: total },
  });
}
