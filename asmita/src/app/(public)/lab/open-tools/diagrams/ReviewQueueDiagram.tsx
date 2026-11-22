/*
 * ReviewQueueDiagram (docs/lab/open-tools-spec.md, Part C4): the shared
 * picture behind the review tools — items arrive, routing rules place them
 * in queues, a trained person decides, and the decision is recorded. Used
 * by Coop, Osprey and Altitude.
 *
 * The SVG is aria-hidden: the numbered "How it works" list next to it
 * carries the meaning, so the drawing is decoration.
 */

const BOX_Y = 60;
const BOX_H = 80;

function Arrow({ x1, x2 }: { x1: number; x2: number }) {
  const y = 100;
  return (
    <g>
      <line x1={x1} y1={y} x2={x2 - 6} y2={y} className="ot-dg-arrow" />
      <path d={`M${x2} ${y}l-9-5m9 5l-9 5`} className="ot-dg-arrow" />
    </g>
  );
}

export function ReviewQueueDiagram() {
  return (
    <svg viewBox="0 0 720 210" className="ot-dg" aria-hidden="true" focusable="false">
      <title>
        How a review tool works: reports arrive, routing rules place each one in
        a queue, a trained person decides, and the decision is recorded.
      </title>

      {/* Reports arrive */}
      <rect x="12" y={BOX_Y} width="108" height={BOX_H} rx="12" className="ot-dg-box" />
      <text x="66" y="92" textAnchor="middle" className="ot-dg-label">
        Reports
      </text>
      <text x="66" y="110" textAnchor="middle" className="ot-dg-muted">
        arrive
      </text>
      {[0, 1, 2].map((row) => (
        <rect key={row} x="38" y={122 + row * 10} width="56" height="5" rx="2.5" className="ot-dg-code" />
      ))}

      <Arrow x1={122} x2={150} />

      {/* Routing rules */}
      <rect x="152" y={BOX_Y} width="122" height={BOX_H} rx="12" className="ot-dg-box" />
      <text x="213" y="92" textAnchor="middle" className="ot-dg-label">
        Routing
      </text>
      <text x="213" y="110" textAnchor="middle" className="ot-dg-muted">
        rules
      </text>
      {[0, 1, 2].map((row) => (
        <g key={row}>
          <circle cx="172" cy={124 + row * 12} r="3" className="ot-dg-dot" />
          <line x1="182" y1={124 + row * 12} x2="254" y2={124 + row * 12} className="ot-dg-soft" />
        </g>
      ))}

      <Arrow x1={276} x2={304} />

      {/* Queues */}
      <rect x="306" y={BOX_Y} width="106" height={BOX_H} rx="12" className="ot-dg-box" />
      <text x="359" y="92" textAnchor="middle" className="ot-dg-label">
        Queues
      </text>
      {[0, 1, 2].map((row) => (
        <rect key={row} x="326" y={104 + row * 14} width="66" height="8" rx="4" className="ot-dg-code" />
      ))}

      <Arrow x1={414} x2={442} />

      {/* Reviewer decides */}
      <rect x="444" y={BOX_Y} width="122" height={BOX_H} rx="12" className="ot-dg-box" />
      <text x="505" y="92" textAnchor="middle" className="ot-dg-label">
        Reviewer
      </text>
      <text x="505" y="110" textAnchor="middle" className="ot-dg-muted">
        decides
      </text>
      <circle cx="505" cy="130" r="10" className="ot-dg-soft" />
      <path d="M501 130l3 3 6-6" className="ot-dg-line" />

      <Arrow x1={568} x2={596} />

      {/* Decision recorded */}
      <rect x="598" y={BOX_Y} width="112" height={BOX_H} rx="12" className="ot-dg-box" />
      <text x="654" y="92" textAnchor="middle" className="ot-dg-label">
        Decision
      </text>
      <text x="654" y="110" textAnchor="middle" className="ot-dg-muted">
        recorded
      </text>
      {[0, 1, 2].map((row) => (
        <rect key={row} x="620" y={122 + row * 10} width="68" height="5" rx="2.5" className="ot-dg-code" />
      ))}
    </svg>
  );
}
