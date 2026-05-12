import { FeedbackForm } from "@/app/(public)/feedback/FeedbackForm";

export default function FeedbackPage() {
  return (
    <main className="container py-12">
      <p className="text-sm font-bold uppercase text-[var(--muted)]">Feedback</p>
      <h1 className="mt-3 text-4xl font-black">Share feedback about your Asmita experience</h1>
      <p className="mt-4 max-w-2xl text-[var(--muted)]">
        Do not include intimate content or raw URLs. This form is for service feedback only.
      </p>
      <FeedbackForm />
    </main>
  );
}
