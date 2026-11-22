import { describe, expect, it } from "vitest";
import {
  checkMessagePatterns,
  MESSAGE_CHECK_PATTERN_IDS,
  routeToMinorSupport,
  type MessageCheckPatternId,
} from "@/lib/lab/message-check/patterns";

/*
 * WP93 (docs/lab/beta-spec.md): every pattern rule and the minor rule, on
 * invented text only. The examples below are written from the shape real
 * sextortion messages take (no real person, number, platform account or
 * URL: the numbers are fictional reserved ranges, the links are .test).
 */

function matches(text: string) {
  return new Set(checkMessagePatterns(text));
}

function expectOnly(text: string, expected: MessageCheckPatternId[]) {
  const found = checkMessagePatterns(text);
  expect([...found].sort()).toEqual([...expected].sort());
}

describe("message check patterns", () => {
  it("lists the eight rule ids in canonical order", () => {
    expect(MESSAGE_CHECK_PATTERN_IDS).toEqual([
      "paymentDemand",
      "deadline",
      "threatContacts",
      "intimateClaim",
      "moreImages",
      "impersonation",
      "cryptoGiftCard",
      "foreignNumber",
    ]);
  });

  it("payment demand: money demanded, in English, Hinglish and Hindi", () => {
    expect(matches("Send me 50000 rupees now or everyone will see everything.").has("paymentDemand")).toBe(true);
    expect(matches("paise bhejo warna photo sabko bhej dunga").has("paymentDemand")).toBe(true);
    expect(matches("पैसे भेजो वरना तस्वीरें सबको भेज दूँगा।").has("paymentDemand")).toBe(true);
    expect(matches("pay the amount to this upi id: test@upi").has("paymentDemand")).toBe(true);
    expect(matches("I paid ₹750 for the tickets, the show was lovely").has("paymentDemand")).toBe(true);

    // Not every sentence with everyday words is a demand.
    expect(matches("hey, it was so good to see you at the wedding last week!").has("paymentDemand")).toBe(false);
    expect(matches("the payload arrives tomorrow, no rush").has("paymentDemand")).toBe(false);
    expect(matches("that meeting cost us three years of effort").has("paymentDemand")).toBe(false);
  });

  it("deadline: a countdown or an or-else, not a normal date", () => {
    expect(matches("You have 24 hours to pay.").has("deadline")).toBe(true);
    expect(matches("This is your last warning.").has("deadline")).toBe(true);
    expect(matches("pay within 48 hours or else").has("deadline")).toBe(true);
    expect(matches("24 ghante mein paise bhejo").has("deadline")).toBe(true);

    expect(matches("I will be travelling all of next week.").has("deadline")).toBe(false);
    expect(matches("see you on the weekend").has("deadline")).toBe(false);
  });

  it("threat to contacts: family and contacts named as the target", () => {
    expect(matches("I will send these photos to your family and every one of your contacts.").has("threatContacts")).toBe(true);
    expect(matches("sabko bhej dunga, ghar walon ko bhi").has("threatContacts")).toBe(true);
    expect(matches("ghar walon ko sab bhej dunga").has("threatContacts")).toBe(true);
    expect(matches("घर वालों को सब भेज दूँगा।").has("threatContacts")).toBe(true);

    expect(matches("your family will love these holiday photos").has("threatContacts")).toBe(false);
    expect(matches("send me the notes from class").has("threatContacts")).toBe(false);
  });

  it("claim of having intimate images, in all three scripts", () => {
    expect(matches("I have your nude photos and the video call recording.").has("intimateClaim")).toBe(true);
    expect(matches("mere paas tumhari photos hain, sab dekhenge").has("intimateClaim")).toBe(true);
    expect(matches("मेरे पास तुम्हारी तस्वीरें हैं।").has("intimateClaim")).toBe(true);

    expect(matches("do you still have the photos from the trip?").has("intimateClaim")).toBe(false);
    expect(matches("I have your book with me, I will return it").has("intimateClaim")).toBe(false);
  });

  it("request for more images", () => {
    expect(matches("send me one more pic and I will delete everything").has("moreImages")).toBe(true);
    expect(matches("send nudes").has("moreImages")).toBe(true);
    expect(matches("aur photos bhejo, phir delete kar dunga").has("moreImages")).toBe(true);
    expect(matches("और फोटो भेजो").has("moreImages")).toBe(true);

    expect(matches("can you send me the party photos?").has("moreImages")).toBe(false);
    expect(matches("share the album with the whole class group").has("moreImages")).toBe(false);
  });

  it("impersonation of police or a platform, not a mention of the police", () => {
    expect(matches("This is Delhi Police cyber cell. Pay the fine immediately or a case will be filed against you.").has("impersonation")).toBe(true);
    expect(matches("This is the WhatsApp verification team. Your account will be banned unless you verify.").has("impersonation")).toBe(true);
    expect(matches("digital arrest warrant has been issued, call this number now").has("impersonation")).toBe(true);
    expect(matches("यह साइबर सेल से बात कर रहा हूँ, अभी कॉल करो").has("impersonation")).toBe(true);

    // The visitor's own words about the police are not an impersonation.
    expect(matches("I went to the police station near my house yesterday").has("impersonation")).toBe(false);
    expect(matches("the officer at the station was kind").has("impersonation")).toBe(false);
  });

  it("crypto or gift-card payment rails", () => {
    expect(matches("pay 200 dollars in bitcoin to this wallet address").has("cryptoGiftCard")).toBe(true);
    expect(matches("buy google play gift cards and send me the codes").has("cryptoGiftCard")).toBe(true);
    expect(matches("usdt bhejo, crypto hi chalega").has("cryptoGiftCard")).toBe(true);

    expect(matches("can you gift-wrap the book for me?").has("cryptoGiftCard")).toBe(false);
    expect(matches("the crypto lecture at college was interesting").has("cryptoGiftCard")).toBe(false);
  });

  it("foreign number pressure, and never a plain Indian +91 number", () => {
    expect(matches("whatsapp me on +1 555 0103456 right now").has("foreignNumber")).toBe(true);
    expect(matches("call me on +92 300 1234567 today").has("foreignNumber")).toBe(true);
    expect(matches("the number is +44 20 7946 0958 only").has("foreignNumber")).toBe(true);
    expect(matches("contact me on my foreign number only").has("foreignNumber")).toBe(true);
    expect(matches("bahar se call aaya tha, usi number par whatsapp karo").has("foreignNumber")).toBe(true);

    expect(matches("my number is +91 9876543210, call anytime").has("foreignNumber")).toBe(false);
    expect(matches("whatsapp me on +919876543210").has("foreignNumber")).toBe(false);
  });

  it("a typical message matches several rules, once each, in canonical order", () => {
    expectOnly(
      "I have your nudes. Send 50000 rupees in bitcoin within 24 hours or I send everything to your family. WhatsApp me on +1 555 0103456.",
      ["intimateClaim", "paymentDemand", "deadline", "threatContacts", "cryptoGiftCard", "foreignNumber"],
    );
    // Canonical order: intimateClaim comes before paymentDemand only if the
    // ids array says so; checkMessagePatterns follows MESSAGE_CHECK_PATTERN_IDS.
    const found = checkMessagePatterns(
      "I have your nudes. Send 50000 rupees in bitcoin within 24 hours or I send everything to your family. WhatsApp me on +1 555 0103456.",
    );
    const positions = found.map((id) => MESSAGE_CHECK_PATTERN_IDS.indexOf(id));
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
    expect(new Set(found).size).toBe(found.length);
  });

  it("a calm message matches nothing, and a match is never invented", () => {
    expect(checkMessagePatterns("Happy birthday! Hope the year ahead is gentle with you.")).toEqual([]);
    expect(checkMessagePatterns("the gym was busy today but the chai afterwards was worth it")).toEqual([]);
  });
});

describe("message check minor rule", () => {
  it("routes a self-reported age under 18 to the minor pathway", () => {
    expect(routeToMinorSupport("I am 15 and he is threatening me with my photos")).toBe(true);
    expect(routeToMinorSupport("मैं 15 साल की हूँ और मुझे धमकी मिली है")).toBe(true);
    expect(routeToMinorSupport("school mein padhti hoon, koi mere photos bhej raha hai")).toBe(true);
  });

  it("routes a third-person under-18 statement to the minor pathway too", () => {
    expect(routeToMinorSupport("my daughter is 14, someone made a fake page about her")).toBe(true);
    expect(routeToMinorSupport("the girl in the photos is only 15, please help")).toBe(true);
  });

  it("does not route an adult to the minor pathway", () => {
    expect(routeToMinorSupport("I am 25 years old and someone is blackmailing me")).toBe(false);
    expect(routeToMinorSupport("मैं 28 साल की हूँ, कोई मेरी तस्वीरें वायरल कर रहा है")).toBe(false);
    expect(routeToMinorSupport("pay 50000 rupees now or I send the photos to everyone")).toBe(false);
  });
});
