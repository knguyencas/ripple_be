CREATE TYPE "AccountRecoveryStatus" AS ENUM ('PIN_VERIFIED', 'COMPLETED', 'REJECTED', 'EXPIRED');

ALTER TABLE "User" ADD COLUMN "recoveryPinHash" TEXT;

CREATE TABLE "AccountRecoveryRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "AccountRecoveryStatus" NOT NULL DEFAULT 'PIN_VERIFIED',
    "reason" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "pinVerifiedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "reviewedByAdminId" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountRecoveryRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AccountRecoveryRequest_userId_status_expiresAt_idx" ON "AccountRecoveryRequest"("userId", "status", "expiresAt");

CREATE INDEX "AccountRecoveryRequest_status_expiresAt_idx" ON "AccountRecoveryRequest"("status", "expiresAt");

CREATE INDEX "AccountRecoveryRequest_reviewedByAdminId_createdAt_idx" ON "AccountRecoveryRequest"("reviewedByAdminId", "createdAt");

ALTER TABLE "AccountRecoveryRequest" ADD CONSTRAINT "AccountRecoveryRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AccountRecoveryRequest" ADD CONSTRAINT "AccountRecoveryRequest_reviewedByAdminId_fkey" FOREIGN KEY ("reviewedByAdminId") REFERENCES "AdminAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
