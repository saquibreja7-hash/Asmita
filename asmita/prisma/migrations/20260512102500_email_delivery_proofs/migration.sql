CREATE TABLE "EmailDeliveryProof" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "platformId" TEXT,
    "rawEventHash" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailDeliveryProof_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "EmailDeliveryProof_messageId_idx" ON "EmailDeliveryProof"("messageId");
CREATE INDEX "EmailDeliveryProof_platformId_idx" ON "EmailDeliveryProof"("platformId");
CREATE INDEX "EmailDeliveryProof_receivedAt_idx" ON "EmailDeliveryProof"("receivedAt");
CREATE UNIQUE INDEX "EmailDeliveryProof_provider_messageId_eventType_rawEventHash_key" ON "EmailDeliveryProof"("provider", "messageId", "eventType", "rawEventHash");
