import { hardDeleteDueUsers } from "@/lib/case-ops";

export async function processDeletionJobs(now = new Date()) {
  return hardDeleteDueUsers(now);
}
