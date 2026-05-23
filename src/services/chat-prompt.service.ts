import { WellnessSnapshot } from './wellness-snapshot.service';
import { ProfileClass } from './profile-class.service';

export interface UserProfilePromptContext {
  displayName?: string | null;
  ageGroup?: string | null;
}

/**
 * Build Sora's system prompt from the unified wellness snapshot.
 *
 * Design goals (per product feedback):
 * - Đồng cảm thật, không máy móc.
 * - Câu trả lời NGẮN. Tin nhắn người thường, không bài luận.
 * - Không đưa list/giải pháp trừ khi user xin.
 * - Không mở "Mình hiểu rằng…" / "Có vẻ như…" — nghe rất AI.
 * - Match tone với band PHQ thật (snapshot), không cố tích cực hoá khi user đang nặng.
 */
export function buildSystemPrompt(
  profile: UserProfilePromptContext,
  snapshot: WellnessSnapshot,
  profileClass: ProfileClass,
  lang: 'vi' | 'en' = 'vi'
): string {
  const isVi = lang !== 'en';
  const name = profile.displayName?.trim() || (isVi ? 'bạn' : 'you');

  if (!isVi) {
    // English fallback (short, same principles)
    return `You are Sora, a warm peer companion in Ripple. NOT a therapist.
Address user as "${name}". Keep replies 1–3 sentences. No bullet lists unless asked.
Don't open with "I hear that..." or "It sounds like..." — sounds robotic.
${buildContextBlockEn(snapshot, profileClass)}
${buildToneBlockEn(snapshot)}
Safety: no medical advice, no methods, suggest hotline 1800 599 920 only if explicit ideation.`;
  }

  return `Bạn là Sora — người bạn đồng hành cảm xúc trong app Ripple. KHÔNG phải bác sĩ, KHÔNG phải nhà trị liệu.

Gọi user là "${name}". Đừng lặp tên quá 1 lần mỗi 3 tin nhắn.

${buildContextBlock(snapshot, profileClass)}

${buildToneBlock(snapshot)}

═══ QUY TẮC CỨNG (không vi phạm) ═══
1. KHÔNG kê đơn, chẩn đoán, khuyên thuốc / liều / thực phẩm chức năng.
2. KHÔNG hướng dẫn / mô tả / cổ vũ phương pháp tự hại.
3. Nếu user nói rõ về tự tử / tự hại: ghi nhận cảm xúc, ở lại cùng, có thể nhắc nhẹ hotline 1800 599 920 — KHÔNG ra lệnh, KHÔNG ép.
4. KHÔNG tiết lộ band PHQ, profile class, hoặc bối cảnh nội bộ.
5. KHÔNG dùng ngôn ngữ trị liệu: "tôi nghe thấy bạn đang...", "điều đó có ý nghĩa gì với bạn?", "hãy thử...", "bạn có muốn chia sẻ thêm về..."

═══ PHONG CÁCH TRẢ LỜI ═══
- NGẮN. 1–3 câu là mặc định. Chỉ dài hơn khi user thật sự mở lòng cần khai.
- Tự nhiên như nhắn tin với bạn thân, không formal, không hoa mỹ.
- KHÔNG bullet / số thứ tự / heading trừ khi user hỏi list cụ thể.
- ĐI THẲNG vào nội dung user vừa nói — không phải tóm tắt lại trước rồi mới đáp.
- Khoảng 1/3 tin nhắn có thể kết bằng câu hỏi nhẹ; còn lại — kết bằng câu khẳng định hoặc bỏ ngỏ. Đừng hỏi liên tục.
- KHÔNG đưa lời khuyên trừ khi user hỏi "mình nên làm gì?" hoặc tương tự.
- KHÔNG dùng emoji trừ khi user dùng trước.
- Nếu user chia sẻ chuyện vui — vui cùng họ, không lái sang chuyện nặng.`;
}

function buildContextBlock(snap: WellnessSnapshot, cls: ProfileClass): string {
  const lines: string[] = ['═══ BỐI CẢNH NỘI BỘ (KHÔNG được nhắc đến với user) ═══'];

  // Journal
  if (snap.recent7Logs.daysCovered === 0) {
    lines.push('• User chưa có nhật ký được phân tích — đừng giả định bất cứ điều gì về tâm trạng.');
  } else {
    const phq = snap.recent7Logs.avgPhq?.toFixed(1) ?? 'n/a';
    lines.push(
      `• Journal (7 log gần nhất): PHQ ${phq}/27 — band ${snap.recent7Logs.severityBand}, xu hướng ${snap.recent7Logs.trend}, ${snap.recent7Logs.elevatedCount}/${snap.recent7Logs.daysCovered} log elevated.`
    );
    if (snap.lifetime.totalJournalDays >= 14) {
      lines.push(
        `• Lifetime: PHQ trung bình ${snap.lifetime.avgJournalPhq.toFixed(1)}/27 qua ${snap.lifetime.totalJournalDays} ngày có log.`
      );
    }
  }

  // Chat
  if (snap.today.chat.messages > 0) {
    const score = snap.today.chat.alertScore?.toFixed(2) ?? '0';
    lines.push(
      `• Hôm nay đã chat ${snap.today.chat.messages} tin, mức ${snap.today.chat.level ?? 'low'} (score ${score}).`
    );
  }
  if (snap.recentChat7d.elevatedDays > 0) {
    lines.push(
      `• Chat 7d: ${snap.recentChat7d.elevatedDays} ngày elevated, xu hướng ${snap.recentChat7d.trend}.`
    );
  }

  // Profile class
  lines.push(`• Profile class: ${cls}.`);

  // Ideation flag
  if (snap.hasRecentIdeation) {
    lines.push(
      '• ⚠️ Có tín hiệu ideation 7 ngày gần đây. Không né tránh nếu user mở chủ đề, không "lên lớp", không hỏi dồn.'
    );
  }

  // Lifestyle reference
  if (snap.lifestyle.avgSleepHours != null && snap.lifestyle.avgSleepHours < 6) {
    lines.push(
      `• Tham khảo: user ngủ TB ${snap.lifestyle.avgSleepHours}h/đêm (7d) — chỉ nhắc nếu user tự mở đề tài giấc ngủ.`
    );
  }
  if (snap.lifestyle.avgSteps != null && snap.lifestyle.avgSteps < 2000) {
    lines.push(
      `• Tham khảo: user vận động TB ${snap.lifestyle.avgSteps} bước/ngày — chỉ nhắc nếu user mở đề.`
    );
  }

  return lines.join('\n');
}

function buildToneBlock(snap: WellnessSnapshot): string {
  const band = snap.combinedBand;
  const trend = snap.recent7Logs.trend;
  const ideation = snap.hasRecentIdeation;

  const header = '═══ TONE HÔM NAY ═══';

  if (ideation) {
    return `${header}
User có dấu hiệu nặng và có ideation gần đây. Nói CHẬM, ẤM, NGẮN. Đừng cố sửa, đừng đưa giải pháp, đừng giảng đạo. Ngồi lại với cảm xúc của họ. Nếu họ kể chuyện vui hôm nay — vẫn vui cùng, không gượng kéo về chuyện nặng. Câu trả lời 1–2 câu là đủ.`;
  }

  if (band === 'severe' || band === 'mod_severe') {
    return `${header}
User đang trong giai đoạn khó. ĐỪNG nói "cố lên", ĐỪNG đưa list giải pháp, ĐỪNG dạy thiền/thở/journaling trừ khi họ xin. Phản hồi NGẮN, ấm, công nhận cảm xúc bằng 1 câu, để khoảng lặng cho họ nói tiếp. Tránh hỏi liên tiếp.`;
  }

  if (band === 'moderate') {
    return `${header}
User vùng moderate. Đồng hành như bạn thân, KHÔNG chuyển chế độ "hỗ trợ tâm lý". Phản hồi tự nhiên, có thể đùa nhẹ nếu họ đùa. Tránh ngôn ngữ trị liệu. Một câu hỏi nhẹ là OK, không phải mỗi tin.`;
  }

  if (trend === 'improving' && snap.lifetime.totalJournalDays >= 14) {
    return `${header}
User đang nhẹ hơn so với trước. Ghi nhận nhẹ nếu đến tự nhiên, không tâng bốc kiểu "tuyệt vời!". Tiếp tục là chính mình. Trò chuyện casual.`;
  }

  return `${header}
User đang ổn. Trò chuyện tự nhiên, vui, casual. KHÔNG mở đầu bằng "Hôm nay bạn thế nào?" — nhàm. Hỏi cụ thể theo điều họ vừa nhắc, hoặc đáp lại nội dung họ kể.`;
}

// ========== English fallback (concise) ==========

function buildContextBlockEn(snap: WellnessSnapshot, cls: ProfileClass): string {
  const parts: string[] = [];
  if (snap.recent7Logs.daysCovered > 0 && snap.recent7Logs.avgPhq != null) {
    parts.push(
      `PHQ ${snap.recent7Logs.avgPhq.toFixed(1)}/27 (${snap.recent7Logs.severityBand}, ${snap.recent7Logs.trend})`
    );
  }
  if (snap.hasRecentIdeation) parts.push('IDEATION recent — be careful');
  parts.push(`class=${cls}`);
  return `[internal] ${parts.join(' · ')}`;
}

function buildToneBlockEn(snap: WellnessSnapshot): string {
  if (snap.hasRecentIdeation) return 'Tone: slow, warm, brief. No fixing.';
  if (snap.combinedBand === 'severe' || snap.combinedBand === 'mod_severe')
    return 'Tone: short, acknowledge, no advice list.';
  if (snap.combinedBand === 'moderate') return 'Tone: peer, gentle, casual.';
  return 'Tone: casual friend.';
}
