/*
 * The diagram catalogue (docs/lab/open-tools-spec.md, Part C4): which
 * reusable drawing illustrates which tool kind. PipelineDiagram, the stack
 * variant, arrives with the stack pages (WP153). Tools with diagram "none"
 * (the two ROOST directories) render no drawing.
 */

import type { DiagramKind } from "@/lib/lab/open-tools/types";
import { HashMatchDiagram } from "./HashMatchDiagram";
import { SimilarityDiagram } from "./SimilarityDiagram";
import { ReviewQueueDiagram } from "./ReviewQueueDiagram";
import { ClassifierDiagram } from "./ClassifierDiagram";
import { ProvenanceDiagram } from "./ProvenanceDiagram";

const DIAGRAMS = {
  hash: HashMatchDiagram,
  similarity: SimilarityDiagram,
  review: ReviewQueueDiagram,
  classifier: ClassifierDiagram,
  provenance: ProvenanceDiagram,
} as const;

/** The drawing for one tool's `diagram` kind, inside its scroll wrapper. */
export function ToolDiagram({ kind }: { kind: DiagramKind }) {
  const Diagram = DIAGRAMS[kind as keyof typeof DIAGRAMS];
  if (!Diagram) return null;
  return (
    <div className="ot-diagram">
      <Diagram />
    </div>
  );
}
