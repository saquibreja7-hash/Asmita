import { AppShell } from "@/components/layout/AppShell";

export default function MinorSupportPage() {
  return (
    <AppShell>
      <section className="container py-16">
        <p className="text-sm font-bold uppercase tracking-widest text-[var(--teal)]">For minors</p>
        <h1 className="mt-3 text-4xl font-black">
          You deserve immediate support from trusted adults and child safety services.
        </h1>
        <p className="muted mt-5 max-w-3xl leading-8">
          Asmita does not collect URLs or create adult takedown cases from minors in this pathway.
          Please contact CHILDLINE or a trusted adult. If you are in danger, call emergency services.
        </p>
        <div className="mt-8 grid gap-4 md:grid-cols-2">
          <a className="panel block p-6" href="https://takeitdown.ncmec.org/">
            <p className="text-sm font-bold uppercase tracking-widest text-[var(--teal)]">Take It Down</p>
            <p className="mt-3 text-2xl font-black">NCMEC</p>
            <p className="muted mt-3">A free service designed for minors to help remove intimate images online.</p>
          </a>
          <a className="panel block p-6" href="https://stopncii.org/">
            <p className="text-sm font-bold uppercase tracking-widest text-[var(--teal)]">StopNCII.org</p>
            <p className="mt-3 text-2xl font-black">Hash-based support</p>
            <p className="muted mt-3">For adults and young people who need help preventing resharing.</p>
          </a>
          <a className="panel block p-6" href="tel:1098">
            <p className="text-sm font-bold uppercase tracking-widest text-[var(--teal)]">CHILDLINE</p>
            <p className="mt-3 text-4xl font-black">1098</p>
            <p className="muted mt-3">Free 24-hour child safety helpline.</p>
          </a>
          <a className="panel block p-6" href="tel:112">
            <p className="text-sm font-bold uppercase tracking-widest text-[var(--rose)]">Emergency</p>
            <p className="mt-3 text-4xl font-black">112</p>
            <p className="muted mt-3">Call if you are in immediate danger.</p>
          </a>
          <a className="panel block p-6" href="https://cybercrime.gov.in/">
            <p className="text-sm font-bold uppercase tracking-widest text-[var(--teal)]">Cybercrime portal</p>
            <p className="mt-3 text-2xl font-black">cybercrime.gov.in</p>
            <p className="muted mt-3">National cybercrime reporting portal for India.</p>
          </a>
          <a className="panel block p-6" href="https://cyberpeace.org/">
            <p className="text-sm font-bold uppercase tracking-widest text-[var(--teal)]">Cyber Peace Foundation</p>
            <p className="mt-3 text-2xl font-black">Cyber safety support</p>
            <p className="muted mt-3">Public cyber safety guidance and support resources.</p>
          </a>
        </div>
      </section>
    </AppShell>
  );
}
