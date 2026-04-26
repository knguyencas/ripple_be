import prisma from '../models/prisma';

export interface LifestyleContext {
  days: number;
  avgSleepHours: number | null;
  avgSteps: number | null;
  sleepDaysCounted: number;
  stepsDaysCounted: number;
}

export async function fetchLifestyleContext(userId: string, days = 7): Promise<LifestyleContext> {
  const now = new Date();
  const from = new Date(now);
  from.setUTCDate(from.getUTCDate() - (days - 1));
  from.setUTCHours(0, 0, 0, 0);

  const [sleepSessions, stepRecords] = await Promise.all([
    prisma.sleepSession.findMany({
      where: { userId, wakeTime: { gte: from } },
      select: { wakeTime: true, duration: true },
    }),
    prisma.stepCount.findMany({
      where: { userId, date: { gte: from } },
      select: { date: true, steps: true },
    }),
  ]);

  const sleepByDay: Record<string, number> = {};
  for (const s of sleepSessions) {
    const key = s.wakeTime.toISOString().slice(0, 10);
    sleepByDay[key] = (sleepByDay[key] ?? 0) + s.duration;
  }
  const sleepDays = Object.values(sleepByDay);
  const avgSleepMin = sleepDays.length > 0
    ? sleepDays.reduce((a, b) => a + b, 0) / sleepDays.length
    : null;

  const avgSteps = stepRecords.length > 0
    ? stepRecords.reduce((a, r) => a + r.steps, 0) / stepRecords.length
    : null;

  return {
    days,
    avgSleepHours: avgSleepMin != null ? Math.round((avgSleepMin / 60) * 10) / 10 : null,
    avgSteps: avgSteps != null ? Math.round(avgSteps) : null,
    sleepDaysCounted: sleepDays.length,
    stepsDaysCounted: stepRecords.length,
  };
}

export function buildLifestyleBlock(ctx: LifestyleContext, isVi: boolean): string {
  const sleepLine = ctx.avgSleepHours != null
    ? `Avg sleep (last ${ctx.days}d, ${ctx.sleepDaysCounted} nights tracked): ${ctx.avgSleepHours}h / night`
    : `Avg sleep: no data`;

  const stepsLine = ctx.avgSteps != null
    ? `Avg steps (last ${ctx.days}d, ${ctx.stepsDaysCounted} days tracked): ${ctx.avgSteps.toLocaleString('en-US')} / day`
    : `Avg steps: no data`;

  const guidance = isVi
    ? 'Guidance: Có thể nhẹ nhàng đề cập giấc ngủ hoặc vận động nếu user mở đề tài liên quan. KHÔNG chủ động hỏi/ép buộc, KHÔNG dùng làm bằng chứng đánh giá tâm lý. Đây chỉ là thông tin tham khảo để câu gợi ý tự nhiên hơn.'
    : 'Guidance: May gently reference sleep or activity if the user brings up related topics. Do NOT probe or use these as evidence for mental-health claims. Reference only — for natural suggestions.';

  const header = isVi
    ? 'LIFESTYLE CONTEXT (reference only — NOT an alert signal)'
    : 'LIFESTYLE CONTEXT (reference only — NOT an alert signal)';

  return `\n${header}\n${sleepLine}\n${stepsLine}\n${guidance}\n`;
}
