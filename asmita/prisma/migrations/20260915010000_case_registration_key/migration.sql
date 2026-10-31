ALTER TABLE "Case" ADD COLUMN "registrationKeyHash" TEXT;
CREATE UNIQUE INDEX "Case_userId_registrationKeyHash_key" ON "Case"("userId", "registrationKeyHash");
