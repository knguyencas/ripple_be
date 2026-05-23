CREATE TYPE "AdminRole" AS ENUM ('SUPER_ADMIN', 'MANAGER');

CREATE TYPE "WellnessPeriodType" AS ENUM ('WEEK', 'MONTH', 'QUARTER', 'YEAR');

CREATE TABLE "AdminAccount" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "displayName" TEXT,
    "role" "AdminRole" NOT NULL DEFAULT 'MANAGER',
    "isRoot" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdminAccount_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AdminAuditLog" (
    "id" TEXT NOT NULL,
    "actorAdminId" TEXT,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminAuditLog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "UserWellnessAggregate" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "periodType" "WellnessPeriodType" NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "avgPhqScore" DOUBLE PRECISION,
    "maxPhqScore" DOUBLE PRECISION,
    "avgMoodScore" DOUBLE PRECISION,
    "dominantAlertLevel" TEXT,
    "logCount" INTEGER NOT NULL DEFAULT 0,
    "chatAlertAvg" DOUBLE PRECISION,
    "chatAlertMax" DOUBLE PRECISION,
    "chatMessageCount" INTEGER NOT NULL DEFAULT 0,
    "topKeywords" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserWellnessAggregate_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AdminAccount_email_key" ON "AdminAccount"("email");

CREATE UNIQUE INDEX "AdminAccount_username_key" ON "AdminAccount"("username");

CREATE INDEX "AdminAccount_role_active_idx" ON "AdminAccount"("role", "active");

CREATE INDEX "AdminAccount_createdById_idx" ON "AdminAccount"("createdById");

CREATE INDEX "AdminAuditLog_actorAdminId_createdAt_idx" ON "AdminAuditLog"("actorAdminId", "createdAt");

CREATE INDEX "AdminAuditLog_targetType_targetId_idx" ON "AdminAuditLog"("targetType", "targetId");

CREATE INDEX "UserWellnessAggregate_userId_periodType_periodStart_idx" ON "UserWellnessAggregate"("userId", "periodType", "periodStart");

CREATE INDEX "UserWellnessAggregate_periodType_periodStart_idx" ON "UserWellnessAggregate"("periodType", "periodStart");

CREATE UNIQUE INDEX "UserWellnessAggregate_userId_periodType_periodStart_key" ON "UserWellnessAggregate"("userId", "periodType", "periodStart");

ALTER TABLE "AdminAccount" ADD CONSTRAINT "AdminAccount_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "AdminAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AdminAuditLog" ADD CONSTRAINT "AdminAuditLog_actorAdminId_fkey" FOREIGN KEY ("actorAdminId") REFERENCES "AdminAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "UserWellnessAggregate" ADD CONSTRAINT "UserWellnessAggregate_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
