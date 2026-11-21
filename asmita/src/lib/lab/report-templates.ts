import type { LabChokepointKind, LabServiceKind } from "@/lib/lab/lab-store";

/*
 * E2 report templates, one per chokepoint kind (docs/lab/charter.md). The
 * draft is filled from the stored service and chokepoint data; the analyst
 * reviews it in the console and may edit it before it is sent. English,
 * like the rest of admin.
 *
 * The Indian-law lines below follow the same citations the complaint
 * workflow's templates use (PRD Section 4, MeitY NCII SOP October 2025):
 * Rule 3(1)(b)(ii) IT Rules 2021 (no hosting of privacy-invasive content)
 * and the MeitY SOP covering artificially morphed images. The ask itself is
 * policy-based: a chokepoint provider is being asked to enforce its own
 * terms, not to act as the platform's Grievance Officer.
 *
 * Placeholders are invented tokens (tests assert the full list); no real
 * service, person or URL is ever named in a template.
 */

export const LAB_TEMPLATE_PLACEHOLDERS = [
  "{{SERVICE_NAME}}",
  "{{SERVICE_KIND_LABEL}}",
  "{{SERVICE_URLS}}",
  "{{PROVIDER_NAME}}",
  "{{EVIDENCE_NOTES}}",
  "{{REPORT_DATE}}",
] as const;

export const LAB_SERVICE_KIND_LABELS: Record<LabServiceKind, string> = {
  APP: "mobile app",
  WEBSITE: "website",
  CHAT_BOT: "chat bot",
  CHANNEL: "messaging channel",
  SOCIAL_ACCOUNT: "social media account",
};

const PROVIDER_ROLES: Record<LabChokepointKind, string> = {
  HOST: "you host the service's website",
  CDN: "your CDN serves the service's content",
  REGISTRAR: "you registered the service's domain name",
  PAYMENT_PROCESSOR: "you process the service's payments",
  APP_STORE: "you distribute the service's app",
  AD_NETWORK: "the service publishes ads through your network",
  PLATFORM_ACCOUNT: "the service operates an account on your platform",
};

const ASKS: Record<LabChokepointKind, string> = {
  HOST: "disable the hosting account or otherwise make the service unreachable from the content you deliver, as your abuse policies provide",
  CDN: "stop serving the service's content through your network, as your abuse policies provide",
  REGISTRAR: "review the domain's registration under your abuse policy and, where the violation is established, suspend or lock the domain",
  PAYMENT_PROCESSOR: "review the merchant account under your acceptable-use rules and terminate or suspend the processing relationship where the violation is established",
  APP_STORE: "review the app under your store's content policies and remove or suspend it where the violation is established",
  AD_NETWORK: "stop serving ads on the service's inventory and terminate the publisher account under your ad policies where the violation is established",
  PLATFORM_ACCOUNT: "review the account under your platform's rules and suspend or remove it where the violation is established",
};

const SUBJECTS: Record<LabChokepointKind, string> = {
  HOST: "Abuse report: service hosted on your infrastructure ({{SERVICE_NAME}})",
  CDN: "Abuse report: service served through your CDN ({{SERVICE_NAME}})",
  REGISTRAR: "Abuse report: domain registered through you ({{SERVICE_NAME}})",
  PAYMENT_PROCESSOR: "Acceptable-use report: merchant you process payments for ({{SERVICE_NAME}})",
  APP_STORE: "Policy report: app you distribute ({{SERVICE_NAME}})",
  AD_NETWORK: "Ad policy report: publisher in your network ({{SERVICE_NAME}})",
  PLATFORM_ACCOUNT: "Abuse report: account on your platform ({{SERVICE_NAME}})",
};

export type LabReportTemplateData = {
  serviceName: string;
  serviceKind: LabServiceKind;
  serviceUrls: string[];
  provider: string;
  evidenceNotes: string | null;
  reportDate: string;
};

function fill(text: string, data: LabReportTemplateData) {
  const replacements: Record<string, string> = {
    "{{SERVICE_NAME}}": data.serviceName,
    "{{SERVICE_KIND_LABEL}}": LAB_SERVICE_KIND_LABELS[data.serviceKind],
    "{{SERVICE_URLS}}": data.serviceUrls.length > 0 ? data.serviceUrls.join("\n") : "<TO_BE_VERIFIED_BY_HUMAN>",
    "{{PROVIDER_NAME}}": data.provider,
    "{{EVIDENCE_NOTES}}": data.evidenceNotes?.trim() || "<TO_BE_VERIFIED_BY_HUMAN>",
    "{{REPORT_DATE}}": data.reportDate,
  };
  return Object.entries(replacements).reduce((text, [token, value]) => text.split(token).join(value), text);
}

/** The template text for one chokepoint kind: how the service depends on the provider. */
function roleFor(kind: LabChokepointKind) {
  return PROVIDER_ROLES[kind];
}

/** Renders the E2 abuse report for one chokepoint, filled from service data. */
export function fillLabReportTemplate(kind: LabChokepointKind, data: LabReportTemplateData): { subject: string; body: string } {
  const subject = fill(SUBJECTS[kind], data);
  const body = [
    `To the abuse team at ${data.provider},`,
    "",
    "We write from the Asmita AI Lab, an independent research team that studies services which create non-consensual intimate images of women (often called 'nudify' tools, or face-swap and 'undress' generators).",
    "",
    `${roleFor(kind)}. The ${LAB_SERVICE_KIND_LABELS[data.serviceKind]} "${data.serviceName}" creates and distributes such images. Its addresses:`,
    "",
    data.serviceUrls.length > 0 ? data.serviceUrls.join("\n") : "<TO_BE_VERIFIED_BY_HUMAN>",
    "",
    "Non-consensual intimate imagery, including artificially morphed images, is prohibited content in India: under the Information Technology (Intermediary Guidelines and Digital Media Ethics Code) Rules, 2021 (Rule 3(1)(b)(ii), no hosting or sharing of content invasive of privacy), and it is covered by the MeitY Standard Operating Procedure on Non-Consensual Intimate Imagery (October 2025). The MeitY SOP expressly covers artificially morphed images.",
    "",
    "Our evidence and observations:",
    "",
    data.evidenceNotes?.trim() || "<TO_BE_VERIFIED_BY_HUMAN>",
    "",
    `We ask you to ${ASKS[kind]}. This is a policy complaint to your company as a provider the service depends on; it is not a grievance under the IT Rules, which the service's own platforms must handle.`,
    "",
    `Date: ${data.reportDate}`,
    "Asmita AI Lab",
  ].join("\n");
  return { subject, body };
}
