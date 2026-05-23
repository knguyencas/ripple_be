import prisma from '../models/prisma';
import {
  buildWellnessSnapshot,
  WellnessSnapshot,
  SeverityBand,
} from './wellness-snapshot.service';

/**
 * Mood message — bases on PHQ-9 band from last 7 logs + ideation + trend.
 * KHÔNG dùng moodScore (icon) — chỉ dùng tín hiệu NLP thật.
 */
function pickMoodMessage(snap: WellnessSnapshot): string {
  const { recent7Logs, lifetime, hasRecentIdeation, recentChat7d } = snap;

  // Chưa có log NLP nào
  if (recent7Logs.daysCovered === 0) {
    if (lifetime.totalJournalDays === 0) {
      return 'Khi bạn sẵn sàng, ghi vài dòng nhật ký — mình sẽ hiểu bạn hơn qua mỗi lần viết.';
    }
    return 'Đã lâu chưa viết — không sao, vài câu cũng đủ để bạn nhìn lại hôm nay.';
  }

  if (hasRecentIdeation) {
    return 'Mấy ngày này có những điều khá nặng trong những gì bạn viết. Mình ở đây — và nếu được, thử chia sẻ với một người bạn tin tưởng. Không phải vì bạn yếu, mà vì bạn xứng đáng được lắng nghe.';
  }

  const band = recent7Logs.severityBand;
  const trend = recent7Logs.trend;
  const historicallyHeavy = lifetime.totalJournalDays >= 14 && lifetime.avgJournalPhq >= 10;

  if (band === 'severe') {
    if (trend === 'improving')
      return 'Tuần này vẫn còn nặng, nhưng có vẻ đang nhẹ dần. Cứ chậm thôi cũng được — không cần phải tốt lên ngay.';
    return 'Nội dung mấy ngày qua khá nặng. Một cuộc nói chuyện với chuyên gia có thể giúp được nhiều hơn bạn nghĩ. Mình không thay được điều đó.';
  }

  if (band === 'mod_severe') {
    if (trend === 'improving')
      return 'Vẫn chưa dễ, nhưng có vẻ đang nhẹ dần so với đầu tuần. Ghi nhận điều đó.';
    if (trend === 'declining')
      return 'Nội dung gần đây đang nặng dần lên. Cho bản thân chậm lại một chút — đừng đòi hỏi phải vận hành như thường lệ.';
    return 'Mấy hôm nay khá trĩu. Không cần phải vượt qua một mình, có ai bạn muốn nhắn tin lúc này không?';
  }

  if (band === 'moderate') {
    if (trend === 'declining')
      return 'Mấy hôm nay có vẻ trĩu hơn trước. Đừng vội đánh giá bản thân — chỉ là một quãng dốc.';
    if (trend === 'improving')
      return 'Có những lúc khó, nhưng nội dung gần đây bắt đầu nhẹ dần. Giữ nhịp này.';
    if (historicallyHeavy)
      return 'Mức này quen thuộc với bạn rồi. Hôm nay làm một điều nhỏ cho bản thân thôi cũng đã đủ.';
    return 'Cảm xúc dạo này khá hỗn hợp. Không cần phải ổn ngay — viết ra đã là một cách tự chăm sóc.';
  }

  if (band === 'mild') {
    if (trend === 'declining' && !historicallyHeavy)
      return 'Bình thường bạn nhẹ hơn — tuần này có chút chùng xuống. Nghỉ một chút nếu cần.';
    if (recentChat7d.elevatedDays >= 3)
      return 'Nhật ký nhẹ nhưng những gì bạn chia sẻ với Sora gần đây có vẻ nặng hơn. Cả hai đều thật — không cần phải chọn.';
    return 'Có những khoảnh khắc không hoàn toàn dễ chịu, nhưng tổng thể vẫn ổn. Bạn đang xử lý tốt.';
  }

  // minimal
  if (trend === 'improving' && historicallyHeavy)
    return 'Bạn đang nhẹ hơn so với trước rất nhiều. Mừng cùng bạn một chút.';
  if (trend === 'improving') return 'Một tuần khá yên và có vẻ đang nhẹ dần. Tận hưởng nó.';
  return 'Một tuần khá yên. Viết tiếp khi có gì muốn nói.';
}

/**
 * Water/steps/sleep — tone điều chỉnh theo band.
 * Khi user đang heavy band, không thúc giục, không lecture.
 */
function pickWaterMessage(glasses: number, goal: number, band: SeverityBand): string {
  const heavy = band === 'severe' || band === 'mod_severe';
  if (heavy) {
    if (glasses === 0) return 'Một ly nước khi bạn nhớ ra cũng đủ. Không cần ép.';
    if (glasses < goal / 2) return `${glasses}/${goal} ly — bạn vẫn đang chăm sóc bản thân.`;
    return `${glasses}/${goal} ly. Ghi nhận điều đó.`;
  }
  if (glasses === 0) return 'Bắt đầu hôm nay với một ly nước nhé.';
  if (glasses < goal / 2) return `Mới ${glasses}/${goal} ly. Thêm một ly nữa khi tiện.`;
  if (glasses < goal) return `${glasses}/${goal} ly — còn ${goal - glasses} ly là đủ.`;
  return `Đã đủ ${goal} ly hôm nay.`;
}

function pickStepsMessage(
  steps: number | null,
  avgSteps: number | null,
  band: SeverityBand
): string {
  const heavy = band === 'severe' || band === 'mod_severe';

  if (steps == null) {
    if (heavy)
      return 'Hôm nay không cần phải vận động nhiều — nghỉ cũng là một cách phục hồi.';
    return 'Chưa có dữ liệu bước hôm nay. Một vòng đi bộ ngắn cũng giúp đầu nhẹ hơn.';
  }

  if (heavy) {
    if (steps < 1000) return 'Nghỉ ngơi cũng quan trọng như vận động. Đừng tự ép.';
    if (steps < 4000)
      return `${steps.toLocaleString('vi-VN')} bước — đáng ghi nhận trong một ngày khó.`;
    return `${steps.toLocaleString('vi-VN')} bước. Tốt cho hôm nay rồi.`;
  }

  if (steps < 2000) return 'Một chuyến đi bộ 10 phút có thể giúp tâm trạng tốt hơn.';
  if (avgSteps && steps > avgSteps * 1.2)
    return `${steps.toLocaleString('vi-VN')} bước — hôm nay năng động hơn thường ngày.`;
  if (steps < 5000) return `${steps.toLocaleString('vi-VN')} bước. Thêm vài vòng dạo là đủ.`;
  return `${steps.toLocaleString('vi-VN')} bước. Giữ đều đặn giúp tinh thần ổn định.`;
}

function pickSleepMessage(minutes: number | null, band: SeverityBand): string {
  const heavy = band === 'severe' || band === 'mod_severe';

  if (minutes == null) {
    if (heavy) return 'Chưa có dữ liệu giấc ngủ. Giấc ngủ đều rất quan trọng lúc này.';
    return 'Chưa có dữ liệu giấc ngủ. Ngủ đủ là một cách đơn giản để chăm sóc bản thân.';
  }
  const h = minutes / 60;

  if (heavy) {
    if (h < 5)
      return 'Đêm qua ngủ khá ít — điều này có thể đang góp phần làm mọi thứ nặng hơn. Tối nay thử đi ngủ sớm hơn 30 phút.';
    if (h > 10) return 'Ngủ nhiều có thể là cơ thể đang cần phục hồi. Không sao.';
    return `${h.toFixed(1)}h — duy trì giấc ngủ ổn định giúp bạn rất nhiều giai đoạn này.`;
  }

  if (h < 5) return 'Đêm qua ngủ khá ít. Tối nay thử đi ngủ sớm hơn 30 phút.';
  if (h < 6.5) return 'Giấc ngủ hơi thiếu. Tắt màn hình 30 phút trước khi ngủ có thể giúp.';
  if (h > 9.5) return 'Ngủ khá nhiều. Vận động nhẹ buổi sáng giúp tỉnh táo hơn.';
  return `Ngủ ${h.toFixed(1)}h — ổn. Duy trì giờ ngủ đều đặn.`;
}

export async function getEncouragement(userId: string) {
  const snapshot = await buildWellnessSnapshot(userId);

  const today = new Date();
  const todayStart = new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())
  );

  const [todayWater, todaySteps, lastSleep] = await Promise.all([
    prisma.waterIntake.findUnique({
      where: { userId_date: { userId, date: todayStart } },
    }),
    prisma.stepCount.findUnique({
      where: { userId_date: { userId, date: todayStart } },
    }),
    prisma.sleepSession.findFirst({
      where: { userId },
      orderBy: { wakeTime: 'desc' },
      select: { duration: true },
    }),
  ]);

  const band = snapshot.recent7Logs.severityBand;

  return {
    mood: pickMoodMessage(snapshot),
    water: pickWaterMessage(todayWater?.glasses ?? 0, todayWater?.goal ?? 8, band),
    steps: pickStepsMessage(todaySteps?.steps ?? null, snapshot.lifestyle.avgSteps, band),
    sleep: pickSleepMessage(lastSleep?.duration ?? null, band),
    // Để debug / future analytics — FE có thể bỏ qua
    _debug: {
      band,
      trend: snapshot.recent7Logs.trend,
      avgPhq7: snapshot.recent7Logs.avgPhq,
      lifetimePhq: snapshot.lifetime.avgJournalPhq,
      combinedLevel: snapshot.combinedLevel,
      hasRecentIdeation: snapshot.hasRecentIdeation,
    },
  };
}
