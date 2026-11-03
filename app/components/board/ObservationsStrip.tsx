import type { BoardNode, Observation } from "../../../server/board/types";

function heading(o: Observation): string {
  const hub = o.nodeIds.length === o.count + 1;
  if (o.kind === "shared-address") {
    return hub ? `${o.count} companies at this address` : `${o.count} companies at the same address`;
  }
  return `${o.count} companies share an officer`;
}

/**
 * Patterns the records show, as counts with a way to open each card. It states what the
 * records contain and nothing about why: no scores, no judgement.
 */
export function ObservationsStrip({
  observations,
  nodes,
  onOpenNode,
}: {
  observations: Observation[];
  nodes: BoardNode[];
  onOpenNode: (nodeId: string) => void;
}) {
  if (observations.length === 0) {
    return <p className="text-sm text-muted-foreground">No patterns yet.</p>;
  }
  const label = new Map(nodes.map((n) => [n.id, n.label]));
  return (
    <ul aria-label="Patterns in the records" className="flex flex-col gap-4">
      {observations.map((o, i) => (
        <li key={`${o.kind}-${i}`} className="flex flex-col gap-2">
          <p className="text-sm font-medium">{heading(o)}</p>
          <div className="flex flex-wrap gap-1.5">
            {o.nodeIds.map((id) =>
              label.has(id) ? (
                <button
                  key={id}
                  type="button"
                  onClick={() => onOpenNode(id)}
                  className="rounded-md border px-2 py-1 text-left text-xs transition-colors hover:bg-accent"
                >
                  {label.get(id)}
                </button>
              ) : null,
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
