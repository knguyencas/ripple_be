import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function fmt(v: number | null | undefined, unit = '/27') {
  if (v == null) return '—';
  return `${v.toFixed(1)}${unit}`;
}

function bandFromPhq(phq: number | null): string {
  if (phq == null) return 'n/a';
  if (phq < 5)  return 'minimal';
  if (phq < 10) return 'mild';
  if (phq < 15) return 'moderate';
  if (phq < 20) return 'mod_severe';
  return 'severe';
}

async function main() {
  const username = process.argv[2] ?? 'testuser1';

  const user = await prisma.user.findUnique({
    where: { username },
    select: {
      id: true, username: true,
      lifetimeJournalScore: true,
      totalJournalDays: true,
      firstLogDate: true,
      lifetimeChatScore: true,
      totalChatDays: true,
      streak: true,
      profileClass: true,
    },
  });

  if (!user) {
    console.log(`Không tìm thấy user "${username}"`);
    process.exit(1);
  }

  const now = new Date();
  const todayUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const tomorrowUtc = new Date(todayUtc.getTime() + 86400000);

  const [todayInsight, todayLogs, last7Insights, allInsights, recentLogs] = await Promise.all([
    prisma.journalDailyInsight.findUnique({
      where: { userId_date: { userId: user.id, date: todayUtc } },
    }),
    prisma.personalLog.findMany({
      where: { userId: user.id, createdAt: { gte: todayUtc, lt: tomorrowUtc } },
      select: { id: true, note: true, nlpScore: true, nlpEmotion: true, alertLevel: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.journalDailyInsight.findMany({
      where: { userId: user.id, date: { gte: new Date(todayUtc.getTime() - 6 * 86400000) } },
      orderBy: { date: 'asc' },
    }),
    prisma.journalDailyInsight.findMany({
      where: { userId: user.id, avgPhqScore: { not: null } },
      orderBy: { date: 'asc' },
      select: { date: true, avgPhqScore: true, logCount: true, dominantLevel: true },
    }),
    prisma.personalLog.findMany({
      where: { userId: user.id, nlpScore: { not: null } },
      orderBy: { createdAt: 'desc' },
      take: 7,
      select: { nlpScore: true, alertLevel: true, createdAt: true },
    }),
  ]);

  const line = '─'.repeat(70);

  console.log('\n' + line);
  console.log(`USER: ${user.username}  (${user.id})`);
  console.log(`profileClass: ${user.profileClass}  ·  streak: ${user.streak}`);
  console.log(line);

  console.log('HÔM NAY (' + todayUtc.toISOString().slice(0, 10) + ')');
  if (!todayInsight && todayLogs.length === 0) {
    console.log('   Chưa có log nào.');
  } else {
    if (todayInsight) {
      console.log(`   logCount        : ${todayInsight.logCount}`);
      console.log(`   avgPhqScore     : ${fmt(todayInsight.avgPhqScore)}  → band ${bandFromPhq(todayInsight.avgPhqScore)}`);
      console.log(`   maxPhqScore     : ${fmt(todayInsight.maxPhqScore)}`);
      console.log(`   dominantLevel   : ${todayInsight.dominantLevel}`);
      console.log(`   dominantEmotion : ${todayInsight.dominantEmotion}`);
      console.log(`   hasIdeation     : ${todayInsight.hasIdeation}`);
    } else {
      console.log('   (chưa có JournalDailyInsight cho hôm nay, có thể NLP chưa chạy xong)');
    }
    if (todayLogs.length > 0) {
      console.log(`\n   Logs riêng lẻ hôm nay (${todayLogs.length}):`);
      todayLogs.forEach((l, i) => {
        const time = l.createdAt.toISOString().slice(11, 16);
        const note = (l.note ?? '').slice(0, 50);
        console.log(`     ${i + 1}. [${time}] PHQ=${fmt(l.nlpScore)} ${l.nlpEmotion ?? '?'} alert=${l.alertLevel ?? '?'}`);
        console.log(`        "${note}${note.length === 50 ? '…' : ''}"`);
      });
    }
  }

  console.log('TRUNG BÌNH TỚI HÔM NAY (LIFETIME)');
  console.log(`   lifetimeJournalScore : ${fmt(user.lifetimeJournalScore)}  → band ${bandFromPhq(user.lifetimeJournalScore || null)}`);
  console.log(`   totalJournalDays     : ${user.totalJournalDays} ngày có log đã NLP`);
  console.log(`   firstLogDate         : ${user.firstLogDate?.toISOString().slice(0, 10) ?? '—'}`);
  console.log(`   lifetimeChatScore    : ${fmt(user.lifetimeChatScore, '')} (0-1)`);
  console.log(`   totalChatDays        : ${user.totalChatDays} ngày có chat`);

  console.log('7 NGÀY GẦN NHẤT (JournalDailyInsight)');
  if (last7Insights.length === 0) {
    console.log('   Không có aggregate trong 7 ngày qua.');
  } else {
    last7Insights.forEach((d) => {
      const date = d.date.toISOString().slice(0, 10);
      const phq = fmt(d.avgPhqScore);
      const band = bandFromPhq(d.avgPhqScore);
      const bar = d.avgPhqScore != null ? '█'.repeat(Math.min(20, Math.round(d.avgPhqScore))) : '';
      console.log(`   ${date}  ${phq.padStart(7)}  [${d.dominantLevel ?? '—'}] ${bar} ${band}`);
    });
  }

  console.log('7 LOG GẦN NHẤT (đầu vào của WellnessSnapshot.recent7Logs)');
  if (recentLogs.length === 0) {
    console.log('   Chưa có log nào được NLP phân tích.');
  } else {
    const phqs = recentLogs.map((l) => l.nlpScore!).filter((v) => v != null);
    const avg = phqs.reduce((a, b) => a + b, 0) / phqs.length;
    recentLogs.slice().reverse().forEach((l, i) => {
      const date = l.createdAt.toISOString().slice(0, 16).replace('T', ' ');
      console.log(`   ${i + 1}. ${date}  PHQ=${fmt(l.nlpScore)}  alert=${l.alertLevel ?? '?'}`);
    });
    console.log(`   ─────────`);
    console.log(`   AVG 7-log     : ${fmt(avg)}  → band ${bandFromPhq(avg)}`);
    console.log(`   MAX 7-log     : ${fmt(Math.max(...phqs))}`);
  }

  console.log('\n' + line);
  const todayStr = todayInsight?.avgPhqScore != null ? fmt(todayInsight.avgPhqScore) : 'chưa có';
  const lifetimeStr = fmt(user.lifetimeJournalScore);
  console.log(`TÓM TẮT: hôm nay = ${todayStr}  ·  lifetime = ${lifetimeStr} (${user.totalJournalDays} ngày)`);
  console.log(line + '\n');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
