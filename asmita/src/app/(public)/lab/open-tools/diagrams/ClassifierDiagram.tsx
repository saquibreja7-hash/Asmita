/*
 * ClassifierDiagram (docs/lab/open-tools-spec.md, Part C4): the shared
 * picture behind the detection models — a text prompt or an image goes
 * into a model, and the score sorts it into the low, review and block
 * bands, with the block band as the one attention element. Used by NCII
 * Prompt Guard, gpt-oss-safeguard, GenD and YuNet.
 *
 * The SVG is aria-hidden: the numbered "How it works" list next to it
 * carries the meaning, so the drawing is decoration.
 */

export function ClassifierDiagram() {
  return (
    <svg viewBox="0 0 680 210" className="ot-dg" aria-hidden="true" focusable="false">
      <title>
        How a classifier works: a prompt or an image goes into a model, and the
        score sorts it into a low band, a review band and a block band; the
        deployer chooses where the cut-offs sit.
      </title>

      {/* The input: a prompt, or an image */}
      <rect x="16" y="60" width="128" height="92" rx="12" className="ot-dg-box" />
      <text x="80" y="88" textAnchor="middle" className="ot-dg-label">
        Prompt
      </text>
      <text x="80" y="106" textAnchor="middle" className="ot-dg-muted">
        or image
      </text>
      {[0, 1, 2].map((row) => (
        <rect key={row} x="44" y={118 + row * 10} width="72" height="5" rx="2.5" className="ot-dg-code" />
      ))}

      {/* Arrow: input to model */}
      <line x1="148" y1="106" x2="182" y2="106" className="ot-dg-arrow" />
      <path d="M190 106l-9-5m9 5l-9 5" className="ot-dg-arrow" />

      {/* The model: layered nodes */}
      <rect x="196" y="60" width="128" height="92" rx="12" className="ot-dg-box" />
      <text x="260" y="88" textAnchor="middle" className="ot-dg-label">
        Model
      </text>
      <path d="M232 138l28-14-28-14m56 28l-28-14 28-14" className="ot-dg-line" />
      <path d="M232 124l28-14-28-14" className="ot-dg-soft" />

      {/* Arrow: model to bands */}
      <line x1="330" y1="106" x2="354" y2="106" className="ot-dg-arrow" />
      <path d="M362 106l-9-5m9 5l-9 5" className="ot-dg-arrow" />

      {/* The score bands */}
      <rect x="376" y="46" width="132" height="30" rx="12" className="ot-dg-band-soft" />
      <text x="442" y="65" textAnchor="middle" className="ot-dg-bandlabel">
        low
      </text>
      <rect x="376" y="90" width="132" height="30" rx="12" className="ot-dg-box" />
      <text x="442" y="109" textAnchor="middle" className="ot-dg-bandlabel">
        review
      </text>
      {/* The block band: the one attention element */}
      <rect x="376" y="134" width="132" height="30" rx="12" className="ot-dg-match" />
      <text x="442" y="153" textAnchor="middle" className="ot-dg-attention">
        block
      </text>

      {/* The cut-offs are the deployer's choice */}
      <line x1="516" y1="106" x2="540" y2="106" className="ot-dg-arrow" />
      <text x="548" y="98" className="ot-dg-muted">
        you set the
      </text>
      <text x="548" y="116" className="ot-dg-muted">
        cut-offs
      </text>
    </svg>
  );
}
