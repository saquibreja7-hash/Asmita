import { AppShell } from "@/components/layout/AppShell";

const resources = [
  {
    name: "Emergency Response Support System",
    contact: "112",
    description: "Immediate danger, police, fire, ambulance, and emergency response in India.",
    href: "tel:112",
    source: "https://www.mha.gov.in/en/commoncontent/emergency-response-support-system-erss",
  },
  {
    name: "CHILDLINE",
    contact: "1098",
    description: "For minors and child safety concerns. Adults concerned about a child can also call.",
    href: "tel:1098",
    source: "https://childlineindia.org/a/p/concerned-adults",
  },
  {
    name: "iCALL TISS",
    contact: "9152987821",
    description: "Psychosocial counselling by telephone and email.",
    href: "tel:9152987821",
    source: "https://icallhelpline.org/strengthening-response-to-violence-against-women-and-girls/",
  },
  {
    name: "NALSA / DLSA Directory",
    contact: "nalsa.gov.in/directory",
    description: "Official directory for national, state, and district legal services authorities.",
    href: "https://nalsa.gov.in/directory/",
    source: "https://nalsa.gov.in/directory/",
  },
  {
    name: "Cyber Peace Foundation",
    contact: "cyberpeace.org",
    description: "Cyber safety guidance and public awareness resources.",
    href: "https://cyberpeace.org",
    source: "https://cyberpeace.org",
  },
  {
    name: "Red Dot Foundation",
    contact: "reddotfoundation.org",
    description: "Support and reporting ecosystem for gender-based violence and safety.",
    href: "https://reddotfoundation.org/",
    source: "https://reddotfoundation.org/",
  },
  {
    name: "National Cybercrime Portal",
    contact: "cybercrime.gov.in",
    description: "Plain-language path for filing cybercrime complaints in India.",
    href: "https://cybercrime.gov.in/",
    source: "https://cybercrime.gov.in/",
  },
];

export default function ResourcesPage() {
  return (
    <AppShell>
      <section className="container py-16">
        <h1 className="text-4xl font-black">Support resources</h1>
        <p className="muted mt-4 max-w-2xl leading-7">
          These links do not require an Asmita account. Use emergency services first if someone is
          in immediate danger.
        </p>
        <p className="muted mt-3 text-sm">Last verified against public source pages: 12 May 2026.</p>
        <div className="panel mt-8 p-5">
          <h2 className="text-2xl font-black">Filing a cybercrime complaint</h2>
          <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm leading-6 text-[var(--muted)]">
            <li>Open the national cybercrime portal and choose the women/child related reporting path if it applies.</li>
            <li>Use your Asmita case reference and legal package when available.</li>
            <li>Do not upload intimate images to Asmita; only submit material where the official portal asks for it.</li>
            <li>Call 112 if there is immediate danger, or 1098 for child safety concerns.</li>
          </ol>
        </div>
        <div className="mt-8 grid gap-4 md:grid-cols-2">
          {resources.map((resource) => (
            <a className="panel block p-5" href={resource.href} key={resource.name}>
              <p className="text-sm font-bold uppercase tracking-widest text-[var(--teal)]">{resource.name}</p>
              <p className="mt-3 text-2xl font-black">{resource.contact}</p>
              <p className="muted mt-2">{resource.description}</p>
              <p className="muted mt-4 text-xs">Source: {resource.source}</p>
            </a>
          ))}
        </div>
      </section>
    </AppShell>
  );
}
