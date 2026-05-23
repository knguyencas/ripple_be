ALTER TABLE "User" ADD COLUMN     "firstLogDate" TIMESTAMP(3),
ADD COLUMN     "lifetimeChatScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "lifetimeJournalScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "totalChatDays" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "totalJournalDays" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "JournalDailyInsight" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "logCount" INTEGER NOT NULL DEFAULT 0,
    "avgPhqScore" DOUBLE PRECISION,
    "maxPhqScore" DOUBLE PRECISION,
    "dominantLevel" TEXT,
    "dominantEmotion" TEXT,
    "hasIdeation" BOOLEAN NOT NULL DEFAULT false,
    "factorsHit" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JournalDailyInsight_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "JournalDailyInsight_userId_date_idx" ON "JournalDailyInsight"("userId", "date");

CREATE UNIQUE INDEX "JournalDailyInsight_userId_date_key" ON "JournalDailyInsight"("userId", "date");

ALTER TABLE "JournalDailyInsight" ADD CONSTRAINT "JournalDailyInsight_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
