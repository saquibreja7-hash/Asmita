import type { StackStep } from "@/lib/lab/open-tools/types";
import { getOpenTool } from "@/lib/lab/open-tools/catalogue";

/*
 * PipelineDiagram (docs/lab/open-tools-spec.md, Part C4, the stack
 * variant): the steps of one stack as numbered boxes joined by thin
 * --line arrows — left to right on desktop, top to bottom on phones. Each
 * box carries the step's number in a round coral marker (the Part C4
 * marker colour), the step name, and the tool names under it as links.
 *
 * Like every diagram in this folder it is line art on semantic tokens
 * (the ot-dg-* classes in lab-open-tools.css) and aria-hidden: the
 * numbered step sections next to it carry the same facts as real
 * headings and real links, so the drawing is decoration. The tool-name
 * anchors inside the SVG are real links for pointer users (Part C3 asks
 * for them) but sit outside the tab order (tabIndex -1): keyboard and
 * screen-reader visitors use the same links in the step sections.
 */

type DiagramStep = {
  number: number;
  name: string[];
  tools: { slug: string; name: string[] }[];
};

/** Break "Hasher-Matcher-Actioner" into "Hasher-", "Matcher-", "Actioner". */
function hyphenTokens(word: string): string[] {
  const parts = word.split(/(?<=-)/);
  return parts.length > 0 ? parts : [word];
}

/** Greedy word wrap at hyphens and spaces, for SVG <text> lines. */
function wrapText(text: string, maxChars: number): string[] {
  const tokens = text.split(/\s+/).filter(Boolean).flatMap(hyphenTokens);
  const lines: string[] = [];
  let line = "";
  for (const token of tokens) {
    if (line === "") line = token;
    else if (`${line} ${token}`.length <= maxChars) line += ` ${token}`;
    else {
      lines.push(line);
      line = token;
    }
  }
  if (line !== "") lines.push(line);
  return lines;
}

function toDiagramSteps(steps: readonly StackStep[], nameChars: number, toolChars: number): DiagramStep[] {
  return steps.map((step, index) => ({
    number: index + 1,
    name: wrapText(step.name, nameChars),
    tools: step.tools
      .map((slug) => getOpenTool(slug))
      .filter((tool): tool is NonNullable<typeof tool> => tool !== undefined)
      .map((tool) => ({ slug: tool.slug, name: wrapText(tool.name, toolChars) })),
  }));
}

/** The box height the whole row shares, so the pipeline reads as one line. */
function boxHeight(steps: DiagramStep[], nameLine: number, toolLine: number, pad: number): number {
  const height = (step: DiagramStep) => {
    const toolLines = step.tools.reduce((sum, tool) => sum + tool.name.length, 0);
    return pad + 24 + 6 + step.name.length * nameLine + (toolLines > 0 ? 6 + toolLines * toolLine : 0) + pad;
  };
  return Math.max(...steps.map(height));
}

/** A step number in its round coral marker (the Part C3 pipeline marker). */
function StepMarker({ x, y, n }: { x: number; y: number; n: number }) {
  return (
    <>
      <circle cx={x} cy={y} r="12" className="ot-dg-stepnum-bg" />
      <text x={x} y={y + 4.5} textAnchor="middle" className="ot-dg-stepnum">
        {n}
      </text>
    </>
  );
}

/** The tool names as SVG anchors, one tool per line group. */
function ToolLinks({
  lines,
  x,
  y0,
  line,
  slug,
}: {
  lines: string[];
  x: number;
  y0: number;
  line: number;
  slug: string;
}) {
  return (
    <a className="ot-dg-link" href={`/lab/open-tools/${slug}`} tabIndex={-1}>
      {lines.map((text, index) => (
        <text key={index} x={x} y={y0 + index * line} className="ot-dg-tool">
          {text}
        </text>
      ))}
    </a>
  );
}

export function PipelineDiagram({
  steps,
  orientation,
}: {
  steps: readonly StackStep[];
  orientation: "row" | "col";
}) {
  if (orientation === "row") {
    return <PipelineRow steps={steps} />;
  }
  return <PipelineColumn steps={steps} />;
}

/** Desktop: the steps left to right, boxes 148px wide, thin arrows between. */
function PipelineRow({ steps }: { steps: readonly StackStep[] }) {
  const BOX = 148;
  const GAP = 12;
  const MARGIN = 14;
  const nameLine = 17;
  const toolLine = 16;
  const diagram = toDiagramSteps(steps, 17, 18);
  const h = boxHeight(diagram, nameLine, toolLine, 12);
  const width = MARGIN * 2 + diagram.length * BOX + (diagram.length - 1) * GAP;
  const height = h + MARGIN * 2;
  const midY = MARGIN + h / 2;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="ot-dg ot-pipeline-row-svg"
      aria-hidden="true"
      focusable="false"
    >
      <title>
        The steps of this stack in order: numbered boxes joined left to
        right, each naming the tools it uses.
      </title>
      {diagram.map((step, index) => {
        const x = MARGIN + index * (BOX + GAP);
        return (
          <g key={step.number}>
            <rect x={x} y={MARGIN} width={BOX} height={h} rx="12" className="ot-dg-box" />
            <StepMarker x={x + 21} y={MARGIN + 21} n={step.number} />
            {step.name.map((text, line) => (
              <text
                key={line}
                x={x + 14}
                y={MARGIN + 12 + 24 + 6 + nameLine * (line + 1)}
                className="ot-dg-label ot-dg-stepname"
              >
                {text}
              </text>
            ))}
            {step.tools.length > 0 &&
              (() => {
                const toolTop = MARGIN + 12 + 24 + 6 + step.name.length * nameLine + 6;
                const offsets: number[] = [];
                let cursor = 0;
                for (const tool of step.tools) {
                  offsets.push(toolTop + toolLine * (cursor + 1) - 4);
                  cursor += tool.name.length;
                }
                return step.tools.map((tool, index) => (
                  <ToolLinks
                    key={tool.slug}
                    lines={tool.name}
                    x={x + 14}
                    y0={offsets[index]}
                    line={toolLine}
                    slug={tool.slug}
                  />
                ));
              })()}
            {index < diagram.length - 1 && (
              <>
                <line x1={x + BOX + 2} y1={midY} x2={x + BOX + GAP - 3} y2={midY} className="ot-dg-arrow" />
                <path
                  d={`M${x + BOX + GAP - 1} ${midY}l-5-3.5m5 3.5l-5 3.5`}
                  className="ot-dg-arrow"
                />
              </>
            )}
          </g>
        );
      })}
    </svg>
  );
}

/** Phones: the same steps top to bottom, one box per row, arrows down. */
function PipelineColumn({ steps }: { steps: readonly StackStep[] }) {
  const WIDTH = 320;
  const MARGIN = 10;
  const BOX = WIDTH - MARGIN * 2;
  const nameLine = 17;
  const toolLine = 16;
  const GAP = 14;
  const diagram = toDiagramSteps(steps, 30, 26);
  const heights = diagram.map((step) => {
    const toolLines = step.tools.reduce((sum, tool) => sum + tool.name.length, 0);
    return 10 + 24 + 6 + step.name.length * nameLine + (toolLines > 0 ? 6 + toolLines * toolLine : 0) + 10;
  });
  // The rows' geometry, computed up front: each box's top is every
  // earlier box plus its gap (pure, so nothing is reassigned in render).
  const rows = diagram.map((step, index) => {
    const top = MARGIN + heights.slice(0, index).reduce((sum, height) => sum + height + GAP, 0);
    return { step, top, height: heights[index] };
  });
  const height = rows[rows.length - 1].top + rows[rows.length - 1].height + MARGIN;

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${height}`}
      className="ot-dg ot-pipeline-col-svg"
      aria-hidden="true"
      focusable="false"
    >
      <title>
        The steps of this stack in order: numbered boxes joined top to
        bottom, each naming the tools it uses.
      </title>
      {rows.map(({ step, top, height: boxHeight }, index) => {
        const contentTop = top + 10;
        const nextTop = index < rows.length - 1 ? rows[index + 1].top : null;
        return (
          <g key={step.number}>
            <rect x={MARGIN} y={top} width={BOX} height={boxHeight} rx="12" className="ot-dg-box" />
            <StepMarker x={MARGIN + 21} y={contentTop + 12} n={step.number} />
            {step.name.map((text, line) => (
              <text
                key={line}
                x={MARGIN + 42}
                y={contentTop + 17 * (line + 1)}
                className="ot-dg-label ot-dg-stepname"
              >
                {text}
              </text>
            ))}
            {step.tools.length > 0 &&
              (() => {
                const toolTop = contentTop + 24 + 6 + step.name.length * nameLine + 6;
                const offsets: number[] = [];
                let cursor = 0;
                for (const tool of step.tools) {
                  offsets.push(toolTop + toolLine * (cursor + 1) - 4);
                  cursor += tool.name.length;
                }
                return step.tools.map((tool, toolIndex) => (
                  <ToolLinks
                    key={tool.slug}
                    lines={tool.name}
                    x={MARGIN + 42}
                    y0={offsets[toolIndex]}
                    line={toolLine}
                    slug={tool.slug}
                  />
                ));
              })()}
            {nextTop !== null && (
              <>
                <line x1={WIDTH / 2} y1={top + boxHeight + 2} x2={WIDTH / 2} y2={nextTop - 4} className="ot-dg-arrow" />
                <path d={`M${WIDTH / 2} ${nextTop - 1}l-3.5-5m3.5 5l3.5-5`} className="ot-dg-arrow" />
              </>
            )}
          </g>
        );
      })}
    </svg>
  );
}
