/*
 * SimilarityDiagram (docs/lab/open-tools-spec.md, Part C4): the
 * vector-similarity picture behind SSCD — two images (abstract rectangles
 * with a mountain-and-sun motif, never a person) each become a vector, and
 * copies of one picture get vectors that point the same way. The one
 * attention element is the high-similarity verdict.
 *
 * The SVG is aria-hidden: the numbered "How it works" list next to it
 * carries the meaning, so the drawing is decoration.
 */

export function SimilarityDiagram() {
  return (
    <svg viewBox="0 0 680 210" className="ot-dg" aria-hidden="true" focusable="false">
      <title>
        How copy detection works: each image becomes a vector, and copies of one
        picture get vectors that point the same way, so their similarity stays
        high after edits.
      </title>

      {/* Image */}
      <rect x="16" y="32" width="120" height="82" rx="12" className="ot-dg-box" />
      <text x="76" y="56" textAnchor="middle" className="ot-dg-label">
        Image
      </text>
      <rect x="40" y="66" width="72" height="38" rx="6" className="ot-dg-soft" />
      <path d="M48 96l14-14 10 9 12-15 14 20z" className="ot-dg-line" />
      <circle cx="100" cy="76" r="4" className="ot-dg-line" />

      {/* Edited copy of the same picture */}
      <rect x="16" y="128" width="120" height="82" rx="12" className="ot-dg-box" />
      <text x="76" y="152" textAnchor="middle" className="ot-dg-label">
        Edited copy
      </text>
      <rect x="40" y="162" width="72" height="38" rx="6" className="ot-dg-soft" />
      <path d="M48 192l14-14 10 9 12-15 14 20z" className="ot-dg-line" />
      <circle cx="100" cy="172" r="4" className="ot-dg-line" />

      {/* Each image becomes a vector: a line of dots */}
      <line x1="148" y1="73" x2="296" y2="55" className="ot-dg-arrow" />
      <path d="M304 54l-9-4m9 4l-8 6" className="ot-dg-arrow" />
      {[0, 1, 2, 3].map((i) => (
        <circle key={`a-${i}`} cx={176 + i * 38} cy={70 - i * 4} r="5" className="ot-dg-tint" />
      ))}
      <line x1="148" y1="169" x2="296" y2="159" className="ot-dg-arrow" />
      <path d="M304 158l-9-4m9 4l-8 6" className="ot-dg-arrow" />
      {[0, 1, 2, 3].map((i) => (
        <circle key={`b-${i}`} cx={176 + i * 38} cy={168 - i * 3} r="5" className="ot-dg-tint" />
      ))}
      <text x="228" y="108" textAnchor="middle" className="ot-dg-muted">
        vector
      </text>

      {/* The two vectors converge on the similarity verdict */}
      <line x1="308" y1="58" x2="480" y2="92" className="ot-dg-arrow" />
      <line x1="308" y1="156" x2="480" y2="116" className="ot-dg-arrow" />

      {/* The verdict: the one attention element */}
      <rect x="488" y="72" width="168" height="64" rx="12" className="ot-dg-match" />
      <text x="572" y="98" textAnchor="middle" className="ot-dg-attention">
        High similarity
      </text>
      <text x="572" y="120" textAnchor="middle" className="ot-dg-attention-muted">
        vectors point the
      </text>
      <text x="572" y="136" textAnchor="middle" className="ot-dg-attention-muted">
        same way
      </text>
    </svg>
  );
}
