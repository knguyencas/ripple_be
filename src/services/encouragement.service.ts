import prisma from '../models/prisma';
import { computePhaseContext } from './phase.service';
import { computeProfileClass, getClassModifiers } from './profile-class.service';

function pickMoodMessage(phase: string, trend: string, avgMood7d: number | null): string {
  if (phase === 'new_user') {
    return 'Chào mừng bạn đến Ripple. Ghi lại vài ngày nữa để bạn thấy rõ hơn xu hướng tâm trạng của mình nhé.';
  }

  if (trend === 'improving') {
    return 'Xu hướng cảm xúc gần đây đang tốt lên. Dù chậm rãi thôi, đó vẫn là một tín hiệu đáng ghi nhận.';
  }

  if (trend === 'declining') {
    if (phase === 'early_warning' || phase === 'chronic_distress') {
      return 'Mấy hôm nay có vẻ hơi nặng nề. Bạn không cần phải mạnh mẽ một mình, thử nói chuyện với ai đó bạn tin tưởng nhé.';
    }
    return 'Tâm trạng có hơi đi xuống gần đây. Nhớ nghỉ ngơi, hít thở sâu một chút, và cho bản thân một khoảng lặng nhé.';
  }

  if (phase === 'volatile') {
    return 'Cảm xúc đang lên xuống khá nhanh. Khi mọi thứ rối hơn, thử viết ra 3 điều nhỏ khiến bạn dễ chịu hơn hôm nay.';
  }

  if (phase === 'stable_ok') {
    return avgMood7d != null && avgMood7d >= 6
      ? 'Tâm trạng tuần này khá ổn. Giữ nhịp sống này, những thói quen nhỏ tích cực tạo ra khác biệt lớn.'
      : 'Mọi thứ đang ổn định. Dành một chút thời gian làm điều gì đó mình thích hôm nay nhé.';
  }

  if (phase === 'recovery') {
    return 'Bạn đang đi trên hành trình hồi phục, chậm mà chắc. Kiên nhẫn với chính mình là điều quan trọng nhất lúc này.';
  }

  return 'Một ngày mới, bắt đầu với một việc nhỏ bạn có thể làm cho bản thân.';
}

function pickWaterMessage(glasses: number, goal: number): string {
  if (glasses === 0) return 'Hôm nay bạn chưa uống nước. Hãy bắt đầu với một ly ngay nhé.';
  if (glasses < goal / 2) return `Bạn mới uống ${glasses}/${goal} ly. Uống thêm một ly ngay bây giờ nhé.`;
  if (glasses < goal) return `Đã ${glasses}/${goal} ly, còn ${goal - glasses} ly nữa là đạt mục tiêu.`;
  return `Bạn đã đạt mục tiêu ${goal} ly hôm nay.`;
}

function pickStepsMessage(steps: number | null, avgSteps: number | null): string {
  if (steps == null) return 'Chưa có dữ liệu bước chân hôm nay. Một chuyến đi bộ ngắn cũng đủ giúp tâm trạng tốt lên.';
  if (steps < 2000) return 'Hôm nay cơ thể vận động còn ít. Thử đi bộ 10 phút để cơ thể và tinh thần dễ chịu hơn.';
  if (steps < 5000) return `Đã đi ${steps.toLocaleString('vi-VN')} bước. Thêm vài vòng dạo nhẹ là đủ cho cả ngày.`;
  if (avgSteps != null && steps > avgSteps * 1.2) return `${steps.toLocaleString('vi-VN')} bước, hôm nay bạn năng động hơn mức trung bình.`;
  return `Đã ${steps.toLocaleString('vi-VN')} bước. Vận động đều đặn giúp tinh thần ổn định hơn.`;
}

function pickSleepMessage(minutes: number | null): string {
  if (minutes == null) return 'Chưa có dữ liệu giấc ngủ đêm qua. Ngủ đủ là một cách đơn giản để chăm sóc bản thân.';
  const hours = minutes / 60;
  if (hours < 5) return 'Đêm qua bạn ngủ khá ít. Thử đi ngủ sớm hơn 30 phút tối nay xem sao.';
  if (hours < 6.5) return 'Giấc ngủ hơi thiếu. Tắt màn hình 30 phút trước khi ngủ có thể giúp bạn vào giấc dễ hơn.';
  if (hours > 9.5) return 'Bạn ngủ khá nhiều đêm qua. Nếu vẫn thấy mệt, thử vận động nhẹ buổi sáng để tỉnh táo hơn.';
  return `Ngủ được ${hours.toFixed(1)} giờ, khá ổn. Duy trì giờ đi ngủ đều đặn để cơ thể quen nhịp.`;
}

export async function getEncouragement(userId: string) {
  const today = new Date();
  const todayStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const sevenDaysAgo = new Date(todayStart);
  sevenDaysAgo.setUTCDate(sevenDaysAgo.getUTCDate() - 7);

  const classInfo = await computeProfileClass(userId);
  const mods = getClassModifiers(classInfo.cls);
  const phaseCtx = await computePhaseContext(userId, classInfo.cls, mods);

  const [recentLogs, todayWater, todaySteps, lastSleep, weekSteps] = await Promise.all([
    prisma.personalLog.findMany({
      where: { userId, createdAt: { gte: sevenDaysAgo } },
      select: { moodScore: true },
    }),
    prisma.waterIntake.findUnique({ where: { userId_date: { userId, date: todayStart } } }),
    prisma.stepCount.findUnique({ where: { userId_date: { userId, date: todayStart } } }),
    prisma.sleepSession.findFirst({
      where: { userId },
      orderBy: { wakeTime: 'desc' },
      select: { duration: true },
    }),
    prisma.stepCount.findMany({
      where: { userId, date: { gte: sevenDaysAgo } },
      select: { steps: true },
    }),
  ]);

  const avgMood7d = recentLogs.length > 0
    ? recentLogs.reduce((sum, log) => sum + log.moodScore, 0) / recentLogs.length
    : null;

  const avgSteps = weekSteps.length > 0
    ? weekSteps.reduce((sum, row) => sum + row.steps, 0) / weekSteps.length
    : null;

  return {
    mood: pickMoodMessage(phaseCtx.phase, phaseCtx.trend, avgMood7d),
    water: pickWaterMessage(todayWater?.glasses ?? 0, todayWater?.goal ?? 8),
    steps: pickStepsMessage(todaySteps?.steps ?? null, avgSteps),
    sleep: pickSleepMessage(lastSleep?.duration ?? null),
  };
}
