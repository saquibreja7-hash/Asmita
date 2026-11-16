// The /admin route tree shares the (admin) shell; keep it untyped here but
// never indexable either.
export const metadata = { robots: { index: false, follow: false } };

export { default } from "@/app/(admin)/layout";
