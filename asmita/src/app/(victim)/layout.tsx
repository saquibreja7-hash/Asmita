import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth/middleware";
import { AccountDeactivatedNotice } from "./AccountDeactivatedNotice";

export default async function VictimLayout({ children }: { children: React.ReactNode }) {
  const auth = await requireSession();
  if (!auth.ok) {
    if (auth.error === "account_deactivated") return <AccountDeactivatedNotice />;
    redirect("/start");
  }
  if (auth.ok && !auth.session.ageOver18) {
    redirect("/minor-support");
  }
  return children;
}
