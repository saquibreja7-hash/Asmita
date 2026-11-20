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
  TRANSLATION: "Translation and language review",
  RESEARCH: "Research (data and policy)",
  DESIGN_TECH: "Design and technology",
  OUTREACH: "Outreach and campus ambassador",
  FACILITATION: "Workshop facilitation (after training)",
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
