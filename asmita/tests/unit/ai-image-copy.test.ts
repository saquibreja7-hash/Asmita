/*
 * WP35: survivor-facing copy on the "Is this image AI-made?" page and the
 * deepfakes issue page. Pins the four wording rules: the report-and-believe
 * message near the top, no victim-blaming advice, exactly one attributed US
 * research line (never presented as Indian data), and check results that
 * never call an image real or fake.
 */
import { describe, expect, it } from "vitest";
import en from "@/i18n/en.json";
import hi from "@/i18n/hi.json";
import status from "@/i18n/hi-review-status.json";
import { getIssueTopic, issueTopics } from "@/lib/issue-content";
import { issueContentHi } from "@/lib/issue-content-hi";
import { THORN_DEEPFAKE_SURVEY_URL } from "@/lib/ai-image-research";

const THORN_URL = "https://www.thorn.org/research/library/deepfake-nudes-and-young-people/";

const enDict = en as Record<string, string>;
const hiDict = hi as Record<string, string>;

/** "Don't share nudes"-style advice: lines that put the choice or blame on her. */
const blamePattern =
  /(should ?n.?t have|should not have|could have avoided|asked for it|your own fault|be more careful|think before|do ?n.?t (send|share|take)|never (send|share|take)|avoid (sharing|sending))/i;

/** Words that verdict an image's realness. Results may only say what was or was not found. */
const realFakePattern = /\b(real|fake|genuine|authentic)\b/i;

/** The result strings of the image checker (local, C2PA and deeper check). */
const verdictKeys = (dict: Record<string, string>) =>
  Object.keys(dict).filter(
    (key) =>
      key.startsWith("check.result.") ||
      key.startsWith("check.c2pa.result.") ||
      key.startsWith("check.deep.result.") ||
      key === "check.deep.limitation" ||
      key === "check.c2pa.ai" ||
      key === "check.c2pa.validation.untrusted",
  );

const checkKeys = (dict: Record<string, string>) =>
  Object.keys(dict).filter((key) => key.startsWith("check."));

describe("AI image check page copy (WP35)", () => {
  it("says near the top that an AI-made image can be reported like a real one and she will be believed", () => {
    const enLine = enDict["check.hero.report"];
    expect(enLine).toContain("report it exactly like a real one");
    expect(enLine).toContain("you will be believed");
    expect(enLine).toContain("abuse");
    const hiLine = hiDict["check.hero.report"];
    expect(hiLine).toContain("रिपोर्ट");
    expect(hiLine).toContain("विश्वास");
    expect(hiLine).toContain("दुर्व्यवहार");
  });

  it("carries exactly one research line: a US survey, attributed to Thorn 2025, never presented as Indian data", () => {
    expect(THORN_DEEPFAKE_SURVEY_URL).toBe(THORN_URL);
    const line = enDict["check.research.line"];
    expect(line).toContain("US survey");
    expect(line).toContain("Thorn");
    expect(line).toContain("Deepfake Nudes & Young People");
    expect(line).toContain("1 in 17");
    expect(line).not.toMatch(/india|bharat|भारत/i);
    expect(line).not.toContain("%");
    // The 1-in-17 figure and the 2025 year are the only numbers in the line.
    expect(line.replace(/2025/g, "").match(/\d+/g)).toEqual(["1", "17"]);

    const hiLine = hiDict["check.research.line"];
    expect(hiLine).toContain("अमेरिकी सर्वेक्षण");
    expect(hiLine).toContain("Thorn");
    expect(hiLine).toContain("Deepfake Nudes & Young People");
    expect(hiLine).not.toMatch(/भारत/i);
    expect(hiLine.replace(/2025/g, "").match(/\d+/g)).toEqual(["17", "1"]);
    expect(enDict["check.research.read"]).toBeTruthy();
    expect(hiDict["check.research.read"]).toBeTruthy();
  });

  it("never says an image is real or fake in the check results, in either language", () => {
    expect(verdictKeys(enDict).length).toBeGreaterThanOrEqual(10);
    for (const key of verdictKeys(enDict)) {
      expect(enDict[key], key).not.toMatch(realFakePattern);
    }
    expect(verdictKeys(hiDict)).toEqual(verdictKeys(enDict));
    for (const key of verdictKeys(hiDict)) {
      expect(hiDict[key], key).not.toMatch(realFakePattern);
    }
  });

  it("keeps the page free of victim-blaming advice, in either language", () => {
    expect(checkKeys(enDict).length).toBeGreaterThan(30);
    for (const key of checkKeys(enDict)) {
      expect(enDict[key], key).not.toMatch(blamePattern);
    }
    for (const key of checkKeys(hiDict)) {
      expect(hiDict[key], key).not.toMatch(blamePattern);
    }
  });

  it("keeps the under-18 line as safe routing to minor support, not as advice to her", () => {
    expect(enDict["check.age.body"]).toContain("under 18");
    expect(enDict["check.age.minorLink"]).toBeTruthy();
    expect(hiDict["check.age.body"]).toContain("18");
    expect(hiDict["check.age.minorLink"]).toBeTruthy();
  });

  it("lists the new and reworded Hindi strings as machine translated", () => {
    const keys = status.machineTranslated.keys;
    for (const key of [
      "check.hero.report",
      "check.research.line",
      "check.research.read",
      "check.result.noneFound.body",
      "check.deep.result.none.body",
      "check.disclaimer",
    ]) {
      expect(keys).toContain(key);
    }
  });

  it("lists every WP38 string as machine translated, in both directions of the batch", () => {
    const keys = status.machineTranslated.keys;
    for (const key of [
      "check.deep.body",
      "check.deep.consent",
      "check.deep.unavailable",
      "check.c2pa.title",
      "check.c2pa.loading",
      "check.c2pa.result.found.title",
      "check.c2pa.result.found.body",
      "check.c2pa.result.none.title",
      "check.c2pa.result.none.body",
      "check.c2pa.result.unavailable",
      "check.c2pa.ai",
      "check.c2pa.tool",
      "check.c2pa.signer",
      "check.c2pa.source",
      "check.c2pa.validation",
      "check.c2pa.validation.valid",
      "check.c2pa.validation.invalid",
      "check.c2pa.validation.untrusted",
      "check.meta.title",
      "check.google.line",
    ]) {
      expect(keys, key).toContain(key);
    }
  });
});

describe("check-image page copy (WP38)", () => {
  it("keeps WP35's wording for 'no Content Credentials found': it says only that none were found", () => {
    const enBody = enDict["check.c2pa.result.none.body"];
    expect(enBody).toContain("no Content Credentials");
    expect(enBody).toContain("that is all this result says");
    expect(enBody).toContain("can still show none");
    const hiBody = hiDict["check.c2pa.result.none.body"];
    expect(hiBody).toContain("Content Credentials");
    expect(hiBody).toContain("नतीजे का मतलब बस इतना है");
    expect(hiBody).toContain("नहीं दिख सकते");
  });

  it("explains the deeper check next to the button: what is sent, to whom, what it can and cannot see, both languages", () => {
    const body = enDict["check.deep.body"];
    expect(body).toContain("sends the image");
    expect(body).toContain("OpenAI");
    expect(body).toContain("Content Credentials");
    expect(body).toContain("SynthID watermark");
    expect(body).toContain("only recognise images made with OpenAI's tools");
    expect(body).toContain("Asmita does not store the image");
    expect(body).toContain("under OpenAI's own terms");
    expect(body).toContain("You can report the image whether or not anything is found");

    const hiBody = hiDict["check.deep.body"];
    expect(hiBody).toContain("OpenAI");
    expect(hiBody).toContain("SynthID watermark");
    expect(hiBody).toContain("सिर्फ़ OpenAI के टूल से बनी इमेज");
    expect(hiBody).toContain("स्टोर नहीं");
    expect(hiBody).toContain("अपनी शर्तों");
    expect(hiBody).toContain("रिपोर्ट कर सकते हैं");
  });

  it("requires her explicit tick per check, and says so", () => {
    expect(enDict["check.deep.consent"]).toContain("for this one check");
    expect(enDict["check.deep.consent"]).toContain("18 or older");
    expect(hiDict["check.deep.consent"]).toContain("इस एक जाँच");
    expect(hiDict["check.deep.consent"]).toContain("18 साल");
    // And a clear "temporarily unavailable" line for the missing-key case.
    for (const dict of [enDict, hiDict]) {
      expect(dict["check.deep.unavailable"]).toBeTruthy();
      expect(dict["check.c2pa.result.unavailable"]).toBeTruthy();
    }
  });

  it("points her at Google's own SynthID check without Asmita sending anything, and without overclaiming", () => {
    const line = enDict["check.google.line"];
    expect(line).toContain("SynthID");
    expect(line).toContain("Gemini");
    expect(line).toContain("Google Lens / Circle to Search");
    // Worded so the no-blame rule holds: "never sends" reads like the
    // "never send" advice the blame pattern forbids; the promise is the same.
    expect(line).toContain("does not send your image to Google");
    expect(line).toContain("does not catch every AI image");
    const hiLine = hiDict["check.google.line"];
    expect(hiLine).toContain("SynthID");
    expect(hiLine).toContain("Gemini");
    expect(hiLine).toContain("Google");
    expect(hiLine).toContain("नहीं भेजता");
    expect(hiLine).toContain("हर AI इमेज को नहीं");
  });

  it("names the two signals so she can tell the signed one from the unsigned one", () => {
    expect(enDict["check.c2pa.title"]).toContain("signed");
    expect(enDict["check.meta.title"]).toContain("not signed");
    expect(hiDict["check.c2pa.title"]).toContain("हस्ताक्षरित");
    expect(hiDict["check.meta.title"]).toContain("हस्ताक्षरित नहीं");
  });
});

describe("deepfakes issue page copy (WP35)", () => {
  const topic = getIssueTopic("deepfakes")!;
  const topicHi = issueContentHi.deepfakes;

  it("says near the top that a fake image of her is abuse, reportable like a real one, and that she will be believed", () => {
    expect(topic.definition).toContain("A fake image of you is abuse");
    expect(topic.definition).toContain("report it exactly like a real one");
    expect(topic.definition).toContain("you will be believed");
    expect(topic.whatToDo).toContain("exactly as you would report any other image");

    expect(topicHi.definition).toContain("दुर्व्यवहार");
    expect(topicHi.definition).toContain("रिपोर्ट");
    expect(topicHi.definition).toContain("विश्वास");
    expect(topicHi.whatToDo).toContain("रिपोर्ट");
  });

  it("carries the same one attributed US survey line with the Thorn source link", () => {
    expect(topic.research?.url).toBe(THORN_URL);
    expect(topic.research?.text).toContain("US survey");
    expect(topic.research?.text).toContain("Thorn");
    expect(topic.research?.text).toContain("1 in 17");
    expect(topic.research?.text).not.toMatch(/india|bharat|भारत/i);
    expect(topicHi.research?.url).toBe(THORN_URL);
    expect(topicHi.research?.text).toContain("अमेरिकी सर्वेक्षण");
    expect(topicHi.research?.text).toContain("17");
  });

  it("uses no other statistic on the page: only the research line carries numbers", () => {
    for (const text of [topic.term, topic.title, topic.short, topic.definition, ...topic.looksLike, topic.whatToDo]) {
      expect(text).not.toMatch(/\d/);
    }
  });

  it("is the only issue topic with a research line", () => {
    expect(issueTopics.filter((t) => t.research).map((t) => t.slug)).toEqual(["deepfakes"]);
    expect(
      Object.entries(issueContentHi)
        .filter(([, t]) => t.research)
        .map(([slug]) => slug),
    ).toEqual(["deepfakes"]);
  });

  it("keeps the topic free of victim-blaming advice, in either language", () => {
    for (const text of [topic.definition, ...topic.looksLike, topic.whatToDo]) {
      expect(text).not.toMatch(blamePattern);
    }
    for (const text of [topicHi.definition, ...topicHi.looksLike, topicHi.whatToDo]) {
      expect(text).not.toMatch(blamePattern);
    }
  });
});
