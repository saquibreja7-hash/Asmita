-- CreateTable: one-time access tokens for URLs sent in notice emails.
-- The raw URL never appears in email — only the portal link. The platform
-- officer enters an access code to view the URL once; the token is consumed.
CREATE TABLE "UrlPortalToken" (
    "id"             TEXT NOT NULL,
    "urlId"          TEXT NOT NULL,
    "token"          TEXT NOT NULL,
    "accessCodeHash" TEXT NOT NULL,
    "usedAt"         TIMESTAMP(3),
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UrlPortalToken_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "UrlPortalToken" ADD CONSTRAINT "UrlPortalToken_urlId_fkey"
    FOREIGN KEY ("urlId") REFERENCES "SubmittedUrl"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateIndex
CREATE UNIQUE INDEX "UrlPortalToken_token_key" ON "UrlPortalToken"("token");
CREATE INDEX "UrlPortalToken_token_idx" ON "UrlPortalToken"("token");
CREATE INDEX "UrlPortalToken_urlId_idx" ON "UrlPortalToken"("urlId");
