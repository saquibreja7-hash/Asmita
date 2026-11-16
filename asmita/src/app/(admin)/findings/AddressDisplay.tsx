// Shows a revealed page and image address as plain text. Never a link, never
// an image or frame source: the app does not open, fetch or preview what a
// survivor's case may point at. Presentational only, so it can be tested.
import { COPY_CAUTION } from "./findings-client";

export function AddressDisplay({
  pageUrl,
  imageUrl,
  secondsLeft,
  copied,
  onCopy,
  onHide,
}: {
  pageUrl: string;
  imageUrl: string;
  secondsLeft: number;
  copied: "page" | "image" | null;
  onCopy: (which: "page" | "image") => void;
  onHide: () => void;
}) {
  const rows: Array<["page" | "image", string, string]> = [
    ["page", "Page address", pageUrl],
    ["image", "Image address", imageUrl],
  ];
  return (
    <div className="grid gap-3 text-sm" role="status">
      {rows.map(([which, label, value]) => (
        <div className="grid gap-1" key={which}>
          <p className="eyebrow">{label}</p>
          <code className="block break-all rounded border border-[var(--line)] p-2 font-mono text-xs" translate="no">
            {value}
          </code>
          <div>
            <button className="btn btn-secondary px-3 py-1 text-xs" onClick={() => onCopy(which)} type="button">
              {copied === which ? "Copied" : `Copy ${label.toLowerCase()}`}
            </button>
          </div>
        </div>
      ))}
      <p className="muted text-xs" data-testid="copy-caution">
        {COPY_CAUTION}
      </p>
      <p className="muted text-xs tabular-nums">
        Hidden in {secondsLeft}s. Shown as text only: do not open it on a personal device.{" "}
        <button className="link-underline" onClick={onHide} type="button">
          Hide now
        </button>
      </p>
    </div>
  );
}
