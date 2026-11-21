import { z } from "zod";

/*
 * Shared building blocks for the organization's public forms (org-pages
 * spec, WP56). One shared pipeline validates and stores them; each form
 * kind declares its own Zod schema in src/lib/org-submissions.ts.
 */

// India's 28 states and 8 union territories, English short names.
export const INDIAN_STATE_OPTIONS: readonly string[] = (() => {
  const states = [
    "Andhra Pradesh",
    "Arunachal Pradesh",
    "Assam",
    "Bihar",
    "Chhattisgarh",
    "Goa",
    "Gujarat",
    "Haryana",
    "Himachal Pradesh",
    "Jharkhand",
    "Karnataka",
    "Kerala",
    "Madhya Pradesh",
    "Maharashtra",
    "Manipur",
    "Meghalaya",
    "Mizoram",
    "Nagaland",
    "Odisha",
    "Punjab",
    "Rajasthan",
    "Sikkim",
    "Tamil Nadu",
    "Telangana",
    "Tripura",
    "Uttar Pradesh",
    "Uttarakhand",
    "West Bengal",
  ];
  const unionTerritories = [
    "Andaman and Nicobar Islands",
    "Chandigarh",
    "Dadra and Nagar Haveli and Daman and Diu",
    "Delhi",
    "Jammu and Kashmir",
    "Ladakh",
    "Lakshadweep",
    "Puducherry",
  ];
  return [...states, ...unionTerritories];
})();

export const stateEnum = z.string().refine((value) => INDIAN_STATE_OPTIONS.includes(value), "unknown_state");

export const languageOptions = [
  "English",
  "Hindi",
  "Assamese",
  "Bengali",
  "Gujarati",
  "Kannada",
  "Kashmiri",
  "Konkani",
  "Malayalam",
  "Marathi",
  "Meitei (Manipuri)",
  "Nepali",
  "Odia",
  "Punjabi",
  "Sanskrit",
  "Sindhi",
  "Tamil",
  "Telugu",
  "Urdu",
  "Other",
] as const;

export const phoneSchema = z
  .string()
  .trim()
  .regex(/^\+?[0-9 ()-]{7,20}$/)
  .optional()
  .or(z.literal("").transform(() => undefined));

export const emailSchema = z.string().trim().toLowerCase().max(254).email();

export const text = (min: number, max: number) => z.string().trim().min(min).max(max);

export const shortText = text(2, 120);

export const messageSchema = z.string().trim().max(1500).optional();

// Volunteer roles (56.4), shared by the form, the page and the admin view.
export const VOLUNTEER_ROLES = {
  LEGAL: "Legal (lawyers and law students)",
  POLICY: "Policy and advocacy",
  RESEARCH: "Research and data",
  TECHNOLOGY: "Technology and engineering",
  DESIGN: "Design and creative",
  TRANSLATION: "Translation and language review",
  OUTREACH: "Outreach and communications",
  CONTENT: "Writing and content",
  OTHER: "Something else",
} as const;
export type VolunteerRole = keyof typeof VOLUNTEER_ROLES;

export const VOLUNTEER_HOURS = {
  UP_TO_2: "Up to 2 hours a week",
  FROM_3_TO_5: "3 to 5 hours a week",
  FROM_6_TO_10: "6 to 10 hours a week",
  MORE_THAN_10: "More than 10 hours a week",
} as const;
export type VolunteerHours = keyof typeof VOLUNTEER_HOURS;

// Training audiences (56.6), one per programme on /training.
export const TRAINING_AUDIENCES = {
  COLLEGE: "College or university (students)",
  SCHOOL: "School (teachers, counsellors, parents)",
  POLICE: "Police or cyber cell",
  WORKPLACE: "Workplace (HR, POSH committee)",
  NGO: "NGO or helpline (frontline staff)",
  MEDIA: "Journalists and media",
} as const;
export type TrainingAudience = keyof typeof TRAINING_AUDIENCES;

export const AUDIENCE_SIZES = {
  UNDER_30: "Fewer than 30 people",
  FROM_30_TO_60: "30 to 60 people",
  FROM_60_TO_150: "60 to 150 people",
  OVER_150: "More than 150 people",
} as const;

export const TRAINING_MODES = {
  ONLINE: "Online",
  IN_PERSON: "In person",
  EITHER: "Either works",
} as const;

// Partner inquiry types (57.2), one option set per partner type page. The
// keys are stored; the labels appear in the form and the admin detail view.

// The /partners/[type] slugs, shared by the server page and the client form
// (defined here, not in the client module, so the server can read the array).
export const PARTNER_FORM_TYPE_SLUGS = ["ngos", "legal", "law-enforcement", "academic"] as const;
export type PartnerFormType = (typeof PARTNER_FORM_TYPE_SLUGS)[number];

export const NGO_PARTNER_TYPES = {
  NGO: "NGO or community organization",
  HELPLINE: "Helpline",
  COMMUNITY_GROUP: "Community or support group",
  OTHER: "Other",
} as const;

export const NGO_SERVICES = {
  COUNSELLING: "Counselling and emotional support",
  LEGAL_AID: "Legal aid or advice",
  SHELTER: "Shelter or safe space",
  MEDICAL: "Medical help",
  HELPLINE: "Running a helpline",
  AWARENESS: "Awareness and education",
  OTHER: "Other",
} as const;

// Offered with the states select: means they work across India.
export const PAN_INDIA = "Pan-India";

export const LEGAL_PARTNER_TYPES = {
  LAWYER: "Individual lawyer",
  LAW_FIRM: "Law firm",
  LEGAL_AID_CLINIC: "Legal aid clinic",
  LAW_SCHOOL_CLINIC: "Law school clinic",
} as const;

export const LEGAL_PRACTICE_AREAS = {
  CYBER_CRIME: "Cyber crime",
  CRIMINAL: "Criminal law",
  FAMILY: "Family law",
  WOMEN_CHILD: "Women and child protection",
  TECH_MEDIA: "Technology and media law",
  OTHER: "Other",
} as const;

export const PRO_BONO_HOURS = {
  UP_TO_2: "Up to 2 hours a month",
  FROM_2_TO_5: "2 to 5 hours a month",
  FROM_5_TO_10: "5 to 10 hours a month",
  MORE_THAN_10: "More than 10 hours a month",
} as const;

export const POLICE_PARTNER_TYPES = {
  POLICE_STATION: "Police station",
  CYBER_CELL: "Cyber cell or cyber police",
  OTHER_UNIT: "Other police unit",
} as const;

export const POLICE_INTERESTS = {
  TRAINING: "Training for our unit",
  REFERRAL: "A referral pathway with Asmita",
  OTHER: "Something else",
} as const;

export const ACADEMIC_PARTNER_TYPES = {
  DEPARTMENT: "University department",
  RESEARCH_CENTRE: "Research centre or institute",
  RESEARCHER: "Independent researcher",
  STUDENT_GROUP: "Student group or committee",
} as const;

export const ACADEMIC_INTERESTS = {
  RESEARCH: "Research collaboration",
  CAMPUS: "Campus programme",
  INTERNSHIPS: "Internships and fellowships",
  OTHER: "Something else",
} as const;
