"use client";

import { useState, useSyncExternalStore } from "react";
import { t, type Locale } from "@/lib/i18n";

/*
 * The code snippet block on a tool page (docs/lab/open-tools-spec.md,
 * Part C3): a <pre><code> block with a copy button (12px corners,
 * monospace, --surface-muted background). Snippets exist only where the
 * spec or the official README gives the exact command, and the text is
 * always the data from the catalogue.
 *
 * The copy button renders only after hydration, like the directory's
 * filters: without JavaScript the code is still fully readable and
 * selectable, and no dead control appears.
 */

const noSubscribe = () => () => {};

export function CodeBlock({ code, locale }: { code: string; locale: Locale }) {
  // The same hydration gate as OpenToolsDirectory.tsx: false on the server
  // and the first client render, true after that.
  const mounted = useSyncExternalStore(
    noSubscribe,
    () => true,
    () => false,
  );
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard unavailable (permission or http): the code stays
      // selectable text, which is the honest fallback.
    }
  };

  return (
    <div className="ot-code">
      <pre>
        <code>{code}</code>
      </pre>
      {mounted && (
        <button type="button" className="ot-copy" onClick={copy}>
          {copied
            ? t(locale, "lab.openTools.tool.copied")
            : t(locale, "lab.openTools.tool.copy")}
        </button>
      )}
    </div>
  );
}
