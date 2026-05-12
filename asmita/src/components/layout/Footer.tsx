import Link from "next/link";

export function Footer() {
  return (
    <footer className="mt-auto border-t border-[var(--border)] bg-[#111827] py-10 text-white">
      <div className="container grid gap-6 md:grid-cols-[1fr_auto]">
        <div>
          <p className="text-lg font-black">Asmita</p>
          <p className="mt-2 max-w-xl text-sm text-white/65">
            An independent dignity restoration platform. Not affiliated with any government body.
          </p>
          <div className="mt-4 flex flex-wrap gap-4 text-sm text-white/70">
            <Link href="/faq">FAQ</Link>
            <Link href="/feedback">Feedback</Link>
            <Link href="/privacy">Privacy</Link>
            <Link href="/legal">Legal</Link>
            <Link href="/contact">Contact</Link>
          </div>
        </div>
        <div className="rounded-lg border border-white/15 p-4">
          <p className="text-xs uppercase tracking-wider text-white/50">Emergency</p>
          <p className="text-2xl font-black">112</p>
        </div>
      </div>
    </footer>
  );
}
