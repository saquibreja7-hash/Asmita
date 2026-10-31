-- Admin actors are admin-<hash> ids, not User rows, so every audit entry with
-- an admin actor failed this foreign key and was dropped. Its ON DELETE SET
-- NULL also conflicted with the append-only trigger when a User is deleted.
ALTER TABLE "audit_log" DROP CONSTRAINT "audit_log_actorId_fkey";
