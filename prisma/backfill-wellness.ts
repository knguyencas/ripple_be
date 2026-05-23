import { PrismaClient } from '@prisma/client';
import { upsertJournalDailyInsight } from '../src/services/journal-insight.service';
import { recomputeUserLifetimeChatStats } from '../src/services/chat-insight.service';

const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany({ select: { id: true, username: true } });
  console.log(`Backfilling ${users.length} users...`);

  for (const u of users) {
    const logDates = await prisma.personalLog.findMany({
      where: { userId: u.id },
      select: { createdAt: true },
      orderBy: { createdAt: 'asc' },
    });

    const uniqueDays = new Set(
      logDates.map((l) => l.createdAt.toISOString().slice(0, 10))
    );

    for (const dayStr of uniqueDays) {
      await upsertJournalDailyInsight(u.id, new Date(`${dayStr}T00:00:00.000Z`));
    }

    await recomputeUserLifetimeChatStats(u.id);

    console.log(`${u.username} — ${uniqueDays.size} journal days backfilled`);
  }

  console.log('Done.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
