import prisma from '../models/prisma';
import { ProfileClass, ClassModifiers } from './profile-class.service';

export type Phase =
  | 'new_user'
  | 'stable_ok'
  | 'recovery'
  | 'early_warning'
  | 'chronic_distress'
  | 'volatile';

export type Trend = 'improving' | 'stable' | 'declining';
export type Level = 'low' | 'moderate' | 'high';

export interface PhaseContext {
  phase: Phase;
  trend: Trend;
  baselineLevel: Level;
  currentLevel: Level;
  baselineScore: number;
  currentScore: number;
  trendSlope: number;
  volatility: number;
  dsm9Ideation: boolean;
  daysWithData: number;
  profileClass: ProfileClass;
}

function levelFromScore(s: number, mods: ClassModifiers): Level {
  if (s >= mods.highThreshold) return 'high';
  if (s >= mods.moderateThreshold) return 'moderate';
  return 'low';
}

function regressionSlope(points: { day: number; score: number }[]): number {
  const n = points.length;
  if (n < 2) return 0;
  let sx = 0, sy = 0, sxy = 0, sxx = 0;
  for (const p of points) {
    sx += p.day; sy += p.score;
    sxy += p.day * p.score; sxx += p.day * p.day;
  }
  const denom = n * sxx - sx * sx;
  if (denom === 0) return 0;
  return (n * sxy - sx * sy) / denom;
}

function startOfDayUTC(d: Date) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}
function diffDays(a: Date, b: Date) {
  return Math.round((startOfDayUTC(a).getTime() - startOfDayUTC(b).getTime()) / 86400000);
}

export async function computePhaseContext(
  userId: string,
  profileClass: ProfileClass,
  mods: ClassModifiers
): Promise<PhaseContext> {
  const now = new Date();
  const windowStart = new Date(now);
  windowStart.setUTCDate(windowStart.getUTCDate() - 90);

  const insights = await prisma.chatInsight.findMany({
    where: { userId, date: { gte: windowStart } },
    orderBy: { date: 'asc' },
    select: { date: true, alertScore: true, alertLevel: true, keywords: true },
  });

  const daysWithData = insights.length;

  if (daysWithData < 14) {
    const recent = insights.slice(-3);
    const currentScore = recent.length
      ? recent.reduce((s, x) => s + x.alertScore, 0) / recent.length
      : 0;
    return {
      phase: 'new_user',
      trend: 'stable',
      baselineLevel: 'low',
      currentLevel: levelFromScore(currentScore, mods),
      baselineScore: 0,
      currentScore,
      trendSlope: 0,
      volatility: 0,
      dsm9Ideation: insights.some((i) =>
        i.keywords?.some((k) => ['muốn chết', 'muốn biến mất', 'tự tử', 'tự sát'].some((t) => k.includes(t)))
      ),
      daysWithData,
      profileClass,
    };
  }

  const last3 = insights.slice(-3);
  const currentScore = last3.reduce((s, x) => s + x.alertScore, 0) / last3.length;

  const baselinePool = insights.slice(0, -3);
  let baselineScore = 0;
  {
    let wSum = 0, num = 0;
    for (const it of baselinePool) {
      const ageDays = diffDays(now, it.date);
      const w = Math.pow(0.97, ageDays);
      wSum += w;
      num += w * it.alertScore;
    }
    baselineScore = wSum > 0 ? num / wSum : 0;
  }

  const last14 = insights.filter((i) => diffDays(now, i.date) <= 14);
  const slopePoints = last14.map((i) => ({ day: diffDays(now, i.date) * -1, score: i.alertScore }));
  const trendSlope = regressionSlope(slopePoints);

  const last30 = insights.filter((i) => diffDays(now, i.date) <= 30);
  let volatility = 0;
  if (last30.length >= 3) {
    const mean = last30.reduce((s, x) => s + x.alertScore, 0) / last30.length;
    const variance = last30.reduce((s, x) => s + (x.alertScore - mean) ** 2, 0) / last30.length;
    volatility = Math.sqrt(variance);
  }

  const baselineLevel = levelFromScore(baselineScore, mods);
  const currentLevel = levelFromScore(currentScore, mods);

  let trend: Trend = 'stable';
  if (trendSlope < -0.015) trend = 'improving';
  else if (trendSlope > 0.015) trend = 'declining';

  const dsm9Ideation = last14.some((i) =>
    i.keywords?.some((k) => ['muốn chết', 'muốn biến mất', 'tự tử', 'tự sát', 'không muốn sống'].some((t) => k.includes(t)))
  );

  // Phase decision with class-aware threshold
  const baselineElevatedTh = mods.moderateThreshold;
  let phase: Phase;
  if (volatility >= 0.22) {
    phase = 'volatile';
  } else if (baselineScore >= baselineElevatedTh) {
    if (currentScore < baselineScore - 0.05 && trend !== 'declining') {
      phase = 'recovery';
    } else {
      phase = 'chronic_distress';
    }
  } else {
    if (currentScore > baselineScore + 0.15 && trend === 'declining') {
      phase = 'early_warning';
    } else {
      phase = 'stable_ok';
    }
  }

  return {
    phase, trend, baselineLevel, currentLevel,
    baselineScore, currentScore, trendSlope, volatility,
    dsm9Ideation, daysWithData, profileClass,
  };
}

export function buildPhaseGuidance(ctx: PhaseContext, isVi = true): string {
  if (!isVi) return `Phase: ${ctx.phase}, class: ${ctx.profileClass}`;

  const pct = (n: number) => `${Math.round(n * 100)}%`;
  const header = `
USER WELLNESS CONTEXT (internal — DO NOT reveal to user)
Profile class: ${ctx.profileClass}
Baseline severity (~90d, decayed): ${ctx.baselineLevel} (${pct(ctx.baselineScore)})
Current severity (last 3d): ${ctx.currentLevel} (${pct(ctx.currentScore)})
Trend (14d): ${ctx.trend}
Volatility (30d): ${ctx.volatility.toFixed(2)}
Data history: ${ctx.daysWithData} ngày
Phase: ${ctx.phase}`;

  // Base guidance by phase, the baseline
  const basePhase: Record<Phase, string> = {
    new_user:
      'User mới dùng app, chưa đủ dữ liệu để đánh giá xu hướng. Giữ thái độ ấm áp, mở, hỏi nhẹ nhàng để hiểu bối cảnh của họ. Đừng đưa nhận định về tình trạng tâm lý.',
    stable_ok:
      'User đang ở trạng thái ổn định. Đồng hành tự nhiên, không dò hỏi vấn đề. Nếu user chia sẻ chuyện vui, chia vui thật lòng; có chút muộn phiền, mirror bình thường — KHÔNG tự động chuyển sang chế độ hỗ trợ khủng hoảng.',
    recovery:
      'User có lịch sử khó khăn nhưng hiện đang hồi phục. Ghi nhận tiến bộ nhẹ nhàng ("dạo này bạn có vẻ nhẹ nhàng hơn" thay vì "tuyệt vời!"). Không nhắc lại quá khứ kiểu gán nhãn. Nếu có setback, chuẩn hóa — hồi phục không phải đường thẳng.',
    early_warning:
      'Baseline user trước đây ổn, nhưng 2 tuần gần đây có dấu hiệu đi xuống. KHÔNG bật chế độ báo động, KHÔNG xác nhận "bạn đang tệ hơn". Mirror cảm xúc, đặt câu hỏi mở để khám phá điều gì thay đổi. Có thể chỉ là tuần khó khăn.',
    chronic_distress:
      'User đang trong giai đoạn khó khăn kéo dài. Ưu tiên hiện diện và lắng nghe hơn giải pháp. Tránh lạc quan ép buộc. Nếu có tín hiệu nguy hiểm, nhẹ nhàng gợi ý hỗ trợ chuyên gia hoặc người thân — không ra lệnh.',
    volatile:
      'Tâm trạng user biến động mạnh. Giữ giọng điệu ổn định, không phản ứng thái quá theo từng tin nhắn. Đặt câu hỏi giúp user nhận ra pattern của chính mình. Tránh lời khuyên dứt khoát trong lúc đang volatile.',
  };

  // Class-specific overlay that ADDS to phase guidance
  const classOverlay: Record<ProfileClass, string> = {
    healthy_baseline:
      'CLASS OVERLAY (healthy_baseline): User thuộc nhóm bình thường — một câu buồn/mệt đơn lẻ KHÔNG phải dấu hiệu tâm lý. Nói chuyện như bạn đồng hành ấm áp, casual, không dùng ngôn ngữ therapy ("tôi nghe thấy bạn đang...", "điều đó có ý nghĩa gì với bạn?"). Nếu user kể chuyện khó khăn bình thường (deadline, cãi nhau), phản hồi như bạn thân: đồng cảm ngắn gọn, có thể hài hước nhẹ nếu tone user cho phép.',
    at_risk_baseline:
      'CLASS OVERLAY (at_risk_baseline): User thuộc nhóm cần chú ý — nhạy với tín hiệu. Tone mềm hơn, chậm hơn, dành thời gian cho user nói. Tránh giải pháp vội. Ghi nhận cảm xúc trước, khám phá sau. Nếu user có vẻ đang ổn hôm nay, vẫn vui vẻ với họ nhưng không bỏ qua hoàn toàn context dài hạn.',
    undetermined:
      'CLASS OVERLAY (undetermined): Chưa đủ dữ liệu để phân loại. Giữ trung lập — ấm áp, tôn trọng, không giả định user có hay không có vấn đề tâm lý.',
  };

  const ideationLine = ctx.dsm9Ideation
    ? '\nTrong 14 ngày gần nhất có tín hiệu ideation (suy nghĩ tự hại). Nhẹ nhàng mở đường để user nói tiếp nếu họ muốn. Nếu tin nhắn hiện tại có ideation rõ ràng, xác nhận cảm xúc, ở lại cùng user, gợi ý hotline (1800 1567 — Tổng đài bảo vệ trẻ em VN / 1800 599 920 — SOS) nhẹ nhàng, không áp đặt.'
    : '';

  return `${header}

Phase guidance:
${basePhase[ctx.phase]}

${classOverlay[ctx.profileClass]}${ideationLine}`;
}
