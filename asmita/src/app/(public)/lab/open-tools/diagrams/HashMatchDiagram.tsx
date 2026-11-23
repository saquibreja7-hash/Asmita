/*
 * HashMatchDiagram (docs/lab/open-tools-spec.md, Part C4): the shared
 * picture behind every hash-matching tool — an image becomes a code, the
 * code is compared against a bank of known codes, and codes close enough
 * are a match for a person to review. Used by PDQ, vPDQ, TMK+PDQF, HMA,
 * StopNCII.org, Take It Down and the Asmita fingerprint feed.
 *
 * Line art only, 1.75 strokes, semantic tokens through the ot-dg-* classes
 * in lab-open-tools.css. The SVG is aria-hidden: the numbered "How it
 * works" list next to it carries the meaning, so the drawing is decoration.
 */

export function HashMatchDiagram() {
  return (
    <svg viewBox="0 0 680 210" className="ot-dg" aria-hidden="true" focusable="false">
      <title>
        How hash matching works: an image becomes a code, the code is compared
        against a bank of known codes, and codes close enough are a match for a
        person to review.
      </title>

      {/* Image */}
      <rect x="16" y="56" width="128" height="96" rx="12" className="ot-dg-box" />
      <text x="80" y="80" textAnchor="middle" className="ot-dg-label">
        Image
      </text>
      <rect x="44" y="92" width="72" height="44" rx="6" className="ot-dg-soft" />
      <path d="M52 128l14-16 10 10 12-18 16 24z" className="ot-dg-line" />
      <circle cx="104" cy="103" r="5" className="ot-dg-line" />

      {/* Arrow: image to code */}
      <line x1="148" y1="104" x2="182" y2="104" className="ot-dg-arrow" />
      <path d="M190 104l-9-5m9 5l-9 5" className="ot-dg-arrow" />

      {/* The code */}
      <rect x="196" y="56" width="150" height="96" rx="12" className="ot-dg-box" />
      <text x="271" y="80" textAnchor="middle" className="ot-dg-label">
        Hash code
      </text>
      {[0, 1, 2].map((row) =>
        [0, 1, 2].map((col) => {
          const filled = (row + col) % 2 === 0;
          return (
            <rect
              key={`${row}-${col}`}
              x={237 + col * 24}
              y={92 + row * 20}
              width="14"
              height="14"
              rx="3"
              className={filled ? "ot-dg-tint" : "ot-dg-soft"}
            />
          );
        }),
      )}

      {/* Arrow: code to bank */}
      <line x1="350" y1="104" x2="374" y2="104" className="ot-dg-arrow" />
      <path d="M382 104l-9-5m9 5l-9 5" className="ot-dg-arrow" />

      {/* The bank */}
      <rect x="396" y="56" width="132" height="96" rx="12" className="ot-dg-box" />
      <text x="462" y="80" textAnchor="middle" className="ot-dg-label">
        Bank
      </text>
      {[0, 1, 2].map((row) =>
        [0, 1, 2, 3].map((col) => (
          <rect
            key={`${row}-${col}`}
            x={418 + col * 24}
            y={94 + row * 18}
            width="16"
            height="9"
            rx="3"
            className={row === 1 ? "ot-dg-codehit" : "ot-dg-code"}
          />
        )),
      )}

      {/* Arrow: bank to match */}
      <line x1="534" y1="104" x2="558" y2="104" className="ot-dg-arrow" />
      <path d="M566 104l-9-5m9 5l-9 5" className="ot-dg-arrow" />

      {/* The match marker: the one attention element */}
      <circle cx="592" cy="96" r="17" className="ot-dg-match" />
      <circle cx="592" cy="96" r="5" className="ot-dg-dot" />
      <text x="592" y="140" textAnchor="middle" className="ot-dg-label">
        Match
      </text>
      <text x="592" y="160" textAnchor="middle" className="ot-dg-muted">
        codes within
      </text>
      <text x="592" y="178" textAnchor="middle" className="ot-dg-muted">
        the threshold
      </text>
    </svg>
  );
}
