-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "public"."AnonymousLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "mood" TEXT NOT NULL,
    "moodScore" INTEGER NOT NULL,
    "factors" TEXT[],
    "nlpScore" DOUBLE PRECISION,
    "nlpEmotion" TEXT,
    "ageGroup" TEXT,
    "city" TEXT,
    "lang" TEXT NOT NULL DEFAULT 'vi',
    "hour" INTEGER NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnonymousLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."AudioRecording" (
    "id" TEXT NOT NULL,
    "logId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "publicId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "encrypted" BOOLEAN NOT NULL DEFAULT false,
    "iv" TEXT,
    "mimeType" TEXT,
    "resourceType" TEXT NOT NULL DEFAULT 'video',

    CONSTRAINT "AudioRecording_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ChatInsight" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "alertLevel" TEXT NOT NULL DEFAULT 'low',
    "alertScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "messageCount" INTEGER NOT NULL DEFAULT 0,
    "keywords" TEXT[],
    "notableSentences" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChatInsight_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Feedback" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Feedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."MeditationSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "soundId" TEXT NOT NULL,
    "targetMin" INTEGER NOT NULL,
    "actualMin" INTEGER NOT NULL,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MeditationSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."MeditationSound" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "fileSizeMB" DOUBLE PRECISION NOT NULL,
    "durationSec" INTEGER NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MeditationSound_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "data" JSONB,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."PersonalLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "mood" TEXT NOT NULL,
    "moodScore" INTEGER NOT NULL,
    "factors" TEXT[],
    "note" TEXT,
    "nlpScore" DOUBLE PRECISION,
    "nlpEmotion" TEXT,
    "alertLevel" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PersonalLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."PhotoAttachment" (
    "id" TEXT NOT NULL,
    "logId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "publicId" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "encrypted" BOOLEAN NOT NULL DEFAULT false,
    "iv" TEXT,
    "mimeType" TEXT,
    "resourceType" TEXT NOT NULL DEFAULT 'image',

    CONSTRAINT "PhotoAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."SleepSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "bedtime" TIMESTAMP(3) NOT NULL,
    "wakeTime" TIMESTAMP(3) NOT NULL,
    "duration" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SleepSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."StepCount" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "steps" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StepCount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."User" (
    "id" TEXT NOT NULL,
    "email" TEXT,
    "username" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "avatar" TEXT,
    "bio" TEXT,
    "ageGroup" TEXT,
    "city" TEXT,
    "streak" INTEGER NOT NULL DEFAULT 0,
    "lastLogDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "displayName" TEXT,
    "profileClass" TEXT NOT NULL DEFAULT 'undetermined',
    "profileClassUpdatedAt" TIMESTAMP(3),
    "encryptedMediaKey" TEXT,
    "mediaKeyIv" TEXT,
    "mediaKeySalt" TEXT,
    "mediaKeyVersion" INTEGER NOT NULL DEFAULT 1,
    "passwordResetExpires" TIMESTAMP(3),
    "passwordResetToken" TEXT,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."WaterIntake" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "glasses" INTEGER NOT NULL DEFAULT 0,
    "goal" INTEGER NOT NULL DEFAULT 8,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WaterIntake_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ChatInsight_userId_date_idx" ON "public"."ChatInsight"("userId" ASC, "date" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "ChatInsight_userId_date_key" ON "public"."ChatInsight"("userId" ASC, "date" ASC);

-- CreateIndex
CREATE INDEX "Feedback_userId_createdAt_idx" ON "public"."Feedback"("userId" ASC, "createdAt" ASC);

-- CreateIndex
CREATE INDEX "MeditationSession_userId_createdAt_idx" ON "public"."MeditationSession"("userId" ASC, "createdAt" ASC);

-- CreateIndex
CREATE INDEX "MeditationSession_userId_startedAt_idx" ON "public"."MeditationSession"("userId" ASC, "startedAt" ASC);

-- CreateIndex
CREATE INDEX "Notification_userId_createdAt_idx" ON "public"."Notification"("userId" ASC, "createdAt" ASC);

-- CreateIndex
CREATE INDEX "Notification_userId_readAt_idx" ON "public"."Notification"("userId" ASC, "readAt" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "StepCount_userId_date_key" ON "public"."StepCount"("userId" ASC, "date" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "public"."User"("email" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "User_passwordResetToken_key" ON "public"."User"("passwordResetToken" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "public"."User"("username" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "WaterIntake_userId_date_key" ON "public"."WaterIntake"("userId" ASC, "date" ASC);

-- AddForeignKey
ALTER TABLE "public"."AnonymousLog" ADD CONSTRAINT "AnonymousLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AudioRecording" ADD CONSTRAINT "AudioRecording_logId_fkey" FOREIGN KEY ("logId") REFERENCES "public"."PersonalLog"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AudioRecording" ADD CONSTRAINT "AudioRecording_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ChatInsight" ADD CONSTRAINT "ChatInsight_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Feedback" ADD CONSTRAINT "Feedback_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MeditationSession" ADD CONSTRAINT "MeditationSession_soundId_fkey" FOREIGN KEY ("soundId") REFERENCES "public"."MeditationSound"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MeditationSession" ADD CONSTRAINT "MeditationSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PersonalLog" ADD CONSTRAINT "PersonalLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PhotoAttachment" ADD CONSTRAINT "PhotoAttachment_logId_fkey" FOREIGN KEY ("logId") REFERENCES "public"."PersonalLog"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PhotoAttachment" ADD CONSTRAINT "PhotoAttachment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SleepSession" ADD CONSTRAINT "SleepSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."StepCount" ADD CONSTRAINT "StepCount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WaterIntake" ADD CONSTRAINT "WaterIntake_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

