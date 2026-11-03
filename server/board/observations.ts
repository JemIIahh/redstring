import type { Board, BoardEdge, EdgeType, NodeType, Observation, Status } from "./types.js";

const isLive = (x: { status: Status }) =>
  x.status !== "rejected" && x.status !== "dead-end";

/**
 * Patterns in the stored records: companies sharing an address and officers
 * on more than one company. Pure, and it reports counts and ids only; wording
 * is the interface's job. Anything the person rejected or marked a dead end is
 * left out, so a call they made is not re-raised as a pattern.
 */
export function computeObservations(
  board: Pick<Board, "nodes" | "edges">,
): Observation[] {
  const order = new Map(board.nodes.map((n, i) => [n.id, i]));
  const byId = new Map(board.nodes.map((n) => [n.id, n]));
  const liveEdges = board.edges.filter(isLive);
  const rank = (id: string) => order.get(id) ?? Number.MAX_SAFE_INTEGER;

  const isLiveNode = (id: string, type?: NodeType) => {
    const n = byId.get(id);
    return !!n && isLive(n) && (type === undefined || n.type === type);
  };

  const evidenceOf = (list: BoardEdge[]) => [
    ...new Set(list.flatMap((e) => e.evidence.map((x) => x.id))),
  ];

  /** Companies grouped around one hub node (an address, or an officer). */
  function hubbed(
    kind: Observation["kind"],
    edgeTypes: EdgeType[],
    pick: (e: BoardEdge) => { hub: string; member: string },
    hubType?: NodeType,
  ) {
    const groups = new Map<string, { members: Set<string>; edges: BoardEdge[] }>();
    for (const e of liveEdges) {
      if (!edgeTypes.includes(e.type)) continue;
      const { hub, member } = pick(e);
      if (!isLiveNode(hub, hubType) || !isLiveNode(member, "company")) continue;
      const g = groups.get(hub) ?? { members: new Set<string>(), edges: [] };
      g.members.add(member);
      g.edges.push(e);
      groups.set(hub, g);
    }
    const found: Array<Observation & { members: Set<string> }> = [];
    for (const [hub, g] of groups) {
      if (g.members.size < 2) continue;
      found.push({
        kind,
        count: g.members.size,
        nodeIds: [hub, ...[...g.members].sort((a, b) => rank(a) - rank(b))],
        evidenceIds: evidenceOf(g.edges),
        members: g.members,
      });
    }
    return found;
  }

  const atAddress = hubbed(
    "shared-address",
    ["registered-at"],
    (e) => ({ hub: e.toId, member: e.fromId }),
    "address",
  );
  const sharedOfficer = hubbed(
    "shared-officer",
    ["officer-of", "member-of"],
    (e) => ({ hub: e.fromId, member: e.toId }),
  );

  // Companies joined by same-address links alone (no address node between them).
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    let r = x;
    while (parent.get(r) !== r) r = parent.get(r)!;
    parent.set(x, r);
    return r;
  };
  const links = liveEdges.filter(
    (e) =>
      e.type === "same-address" &&
      isLiveNode(e.fromId, "company") &&
      isLiveNode(e.toId, "company"),
  );
  for (const e of links) {
    for (const id of [e.fromId, e.toId]) if (!parent.has(id)) parent.set(id, id);
    parent.set(find(e.fromId), find(e.toId));
  }
  const clusters = new Map<string, { members: Set<string>; edges: BoardEdge[] }>();
  for (const e of links) {
    const root = find(e.fromId);
    const c = clusters.get(root) ?? { members: new Set<string>(), edges: [] };
    c.members.add(e.fromId).add(e.toId);
    c.edges.push(e);
    clusters.set(root, c);
  }
  const joined: Array<Observation & { members: Set<string> }> = [];
  for (const c of clusters.values()) {
    const covered = atAddress.some((g) =>
      [...c.members].every((m) => g.members.has(m)),
    );
    if (c.members.size < 2 || covered) continue;
    joined.push({
      kind: "shared-address",
      count: c.members.size,
      nodeIds: [...c.members].sort((a, b) => rank(a) - rank(b)),
      evidenceIds: evidenceOf(c.edges),
      members: c.members,
    });
  }

  return [...atAddress, ...joined, ...sharedOfficer]
    .sort(
      (a, b) =>
        b.count - a.count ||
        a.kind.localeCompare(b.kind) ||
        rank(a.nodeIds[0]!) - rank(b.nodeIds[0]!),
    )
    .map(({ kind, count, nodeIds, evidenceIds }) => ({
      kind,
      count,
      nodeIds,
      evidenceIds,
    }));
}
