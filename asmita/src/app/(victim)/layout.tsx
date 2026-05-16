import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth/middleware";

export default async function VictimLayout({ children }: { children: React.ReactNode }) {
  const auth = await requireSession();
  if (!auth.ok) {
    redirect("/start");
  }
  if (auth.ok && !auth.session.ageOver18) {
    redirect("/minor-support");
  }
  return children;
}
