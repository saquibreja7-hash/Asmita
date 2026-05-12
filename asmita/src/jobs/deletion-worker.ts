import { hardDeleteDueUsers } from "@/lib/store";

export async function processDeletionJobs(now = new Date()) {
  return hardDeleteDueUsers(now);
}
