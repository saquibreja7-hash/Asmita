/*
 * ProvenanceDiagram (docs/lab/open-tools-spec.md, Part C4): the Content
 * Credentials picture behind C2PA — a camera, editing app or AI generator
 * signs the file, the signed credential travels with it, anyone can verify
 * the signature, and a missing credential proves nothing (the one attention
 * element).
 *
 * The SVG is aria-hidden: the numbered "How it works" list next to it
 * carries the meaning, so the drawing is decoration.
 */

function Arrow({ x1, x2 }: { x1: number; x2: number }) {
  const y = 100;
  return (
    <g>
      <line x1={x1} y1={y} x2={x2 - 6} y2={y} className="ot-dg-arrow" />
      <path d={`M${x2} ${y}l-9-5m9 5l-9 5`} className="ot-dg-arrow" />
    </g>
  );
}

export function ProvenanceDiagram() {
  return (
    <svg viewBox="0 0 680 210" className="ot-dg" aria-hidden="true" focusable="false">
      <title>
        How Content Credentials work: a camera or app signs the file, the
        credential travels with it, anyone can verify the signature, and a
        missing credential does not mean the file is genuine or fake.
      </title>

      {/* A camera or app signs */}
      <rect x="12" y="60" width="140" height="86" rx="12" className="ot-dg-box" />
      <text x="82" y="88" textAnchor="middle" className="ot-dg-label">
        Camera or app
      </text>
      <text x="82" y="106" textAnchor="middle" className="ot-dg-muted">
        signs the file
      </text>
      <circle cx="82" cy="128" r="10" className="ot-dg-soft" />
      <path d="M78 128l3 3 6-6" className="ot-dg-line" />

      <Arrow x1={154} x2={182} />

      {/* The file carries the credential */}
      <rect x="184" y="60" width="146" height="86" rx="12" className="ot-dg-box" />
      <text x="257" y="88" textAnchor="middle" className="ot-dg-label">
        File carries
      </text>
      <text x="257" y="106" textAnchor="middle" className="ot-dg-muted">
        the credential
      </text>
      <path d="M237 118h34l12 12v22h-46z" className="ot-dg-soft" />
      <path d="M271 118v12h12" className="ot-dg-soft" />
      <circle cx="248" cy="140" r="6" className="ot-dg-dot" />

      <Arrow x1={332} x2={360} />

      {/* Anyone can verify */}
      <rect x="362" y="60" width="140" height="86" rx="12" className="ot-dg-box" />
      <text x="432" y="88" textAnchor="middle" className="ot-dg-label">
        Anyone can
      </text>
      <text x="432" y="106" textAnchor="middle" className="ot-dg-muted">
        verify
      </text>
      <circle cx="432" cy="128" r="9" className="ot-dg-line" />
      <line x1="438" y1="134" x2="448" y2="144" className="ot-dg-line" />

      <Arrow x1={504} x2={532} />

      {/* Missing does not mean fake: the one attention element */}
      <rect x="534" y="60" width="136" height="86" rx="12" className="ot-dg-match" />
      <text x="602" y="88" textAnchor="middle" className="ot-dg-attention">
        Missing does
      </text>
      <text x="602" y="106" textAnchor="middle" className="ot-dg-attention">
        not mean fake
      </text>
      <text x="602" y="128" textAnchor="middle" className="ot-dg-attention-muted">
        uploaders strip
      </text>
      <text x="602" y="144" textAnchor="middle" className="ot-dg-attention-muted">
        credentials
      </text>
    </svg>
  );
}
