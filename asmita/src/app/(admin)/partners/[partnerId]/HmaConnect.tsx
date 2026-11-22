"use client";

import { useRef, useState } from "react";

/*
 * "Connect with HMA" (research-tools spec WP111, item 3): the three-step
 * quick start an admin hands a platform that runs Meta's open-source
 * Hasher-Matcher-Actioner. Collapsed by default (a native disclosure, per
 * the design system), pure copyable code blocks — and this block can never
 * show a real key: the placeholder names the once-shown key, nothing
 * else, and the component receives no key material at all.
 */

type CodeBlock = {
  id: string;
  heading: string;
  text: string;
  code: string;
};

const BLOCKS: CodeBlock[] = [
  {
    id: "hma-step-image",
    heading: "1. Add the Asmita exchange to your HMA image",
    text: "Asmita does not publish the package to PyPI. Build the wheel from Asmita's repository (integrations/hma/tx-extension-asmita, python -m build --wheel), then install it in an image derived from the official one.",
    code: [
      "FROM ghcr.io/meta/threatexchange/hma:1.2.2",
      "COPY tx_extension_asmita-1.0.0-py3-none-any.whl /wheels/",
      "RUN pip install /wheels/tx_extension_asmita-1.0.0-py3-none-any.whl",
    ].join("\n"),
  },
  {
    id: "hma-step-config",
    heading: "2. List the exchange in your OMM config",
    text: "One import and one line in exchange_types in the file your OMM_CONFIG points at.",
    code: [
      "from tx_extension_asmita import AsmitaSignalExchangeAPI",
      "",
      "STORAGE_IFACE_INSTANCE = DefaultOMMStore(",
      "    signal_types=[PdqSignal, ...],",
      "    exchange_types=[",
      "        ...,",
      "        AsmitaSignalExchangeAPI,",
      "    ],",
      ")",
    ].join("\n"),
  },
  {
    id: "hma-step-exchange",
    heading: "3. Create the exchange with this partner's key",
    text: "Asmita shows a partner key only once, when it is issued — never again. Paste the key you were shown here; if it is lost, revoke it and issue another on this page.",
    code: [
      "POST /c/exchanges",
      "{",
      '  "bank": "ASMITA_NCII",',
      '  "api": "asmita",',
      '  "api_json": {"base_url": "https://<your Asmita deployment>/api/partner/v1"},',
      '  "credential_json": {"api_key": "<the key you were shown>"}',
      "}",
    ].join("\n"),
  },
];

export function HmaConnect() {
  const [copiedState, setCopiedState] = useState<Record<string, boolean>>({});
  const refs = useRef(new Map<string, HTMLElement | null>());

  async function copy(block: CodeBlock) {
    try {
      await navigator.clipboard.writeText(block.code);
      setCopiedState((current) => ({ ...current, [block.id]: true }));
      return;
    } catch {
      // No clipboard access: select the code so it can be copied by hand.
    }
    const node = refs.current.get(block.id) ?? null;
    if (node) {
      const range = document.createRange();
      range.selectNodeContents(node);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
    }
  }

  return (
    <details className="a-card mt-4 p-4">
      <summary className="cursor-pointer text-sm font-semibold">
        Connect with HMA (Hasher-Matcher-Actioner)
      </summary>
      <p className="muted mt-3 max-w-2xl text-sm">
        Meta&apos;s open-source Hasher-Matcher-Actioner pulls hashes from Asmita through the
        Asmita exchange package. Three steps, then HMA&apos;s own fetcher keeps the bank in
        sync — including deletions, within minutes of a survivor withdrawing her consent.
      </p>
      <ol className="mt-4 grid gap-6">
        {BLOCKS.map((block) => (
          <li key={block.id} className="grid gap-2">
            <h3 className="text-sm font-semibold">{block.heading}</h3>
            <p className="muted max-w-2xl text-sm">{block.text}</p>
            <div className="grid gap-2">
              <pre className="overflow-x-auto rounded-xl bg-[var(--parchment)] p-3 text-xs leading-relaxed">
                <code className="font-mono" ref={(node) => { refs.current.set(block.id, node); }}>
                  {block.code}
                </code>
              </pre>
              <div>
                <button
                  aria-label={`Copy the code for step ${block.id}`}
                  className="btn btn-secondary px-3 py-1 text-xs"
                  onClick={() => copy(block)}
                  type="button"
                >
                  {copiedState[block.id] ? "Copied" : "Copy"}
                </button>
              </div>
            </div>
          </li>
        ))}
      </ol>
    </details>
  );
}
