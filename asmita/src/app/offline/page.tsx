import Link from "next/link";
import { LabToolHero, LabToolShell } from "@/components/lab/LabToolPage";
import { getLocale } from "@/lib/get-locale";
import { HELPLINE } from "@/lib/helpline";

export default async function OfflinePage() {
  const hi = await getLocale() === "hi";

  return (
    <LabToolShell variant="calm">
      <LabToolHero
        title={hi ? "इंटरनेट कनेक्शन नहीं है" : "You’re offline"}
        intro={
          <p>
            {hi
              ? "अगर आप शिकायत भर रहे थे, तो इस टैब को खुला रखें। कनेक्शन लौटने पर ब्राउज़र में पीछे जाएँ और अपना मसौदा देखें।"
              : "If you were filing a complaint, keep this tab open. Once you reconnect, use your browser’s Back button and check your draft."}
          </p>
        }
      >
        <Link href="/" className="btn btn-secondary !m-0 mt-6">
          {hi ? "कनेक्शन लौटने पर होम पेज खोलें" : "Open the home page once connected"}
        </Link>
        <p className="mt-6 leading-relaxed text-[var(--text)]">
          {hi ? "फ़ोन से मदद के लिए, अस्मिता के AI सहायक को कॉल करें " : "For help by phone, call Asmita’s AI assistant at "}
          <a className="text-link" href={`tel:${HELPLINE.tel}`}>
            {HELPLINE.display}
          </a>
          .
        </p>
      </LabToolHero>
    </LabToolShell>
  );
}
