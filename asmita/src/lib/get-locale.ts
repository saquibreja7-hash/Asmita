import { cookies } from "next/headers";
import { normalizeLocale, type Locale } from "@/lib/i18n";
import { COOKIE_BASE_NAMES } from "@/lib/cookie-names";

export async function getLocale(): Promise<Locale> {
  const cookieStore = await cookies();
  return normalizeLocale(cookieStore.get(COOKIE_BASE_NAMES.language)?.value);
}
