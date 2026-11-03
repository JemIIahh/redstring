import {
  IconBuilding,
  IconFileText,
  IconMapPin,
  IconPaperclip,
  IconSparkles,
  IconUser,
} from "@tabler/icons-react";

import type { BoardNode, NodeType, Status } from "../../../server/board/types";
import { pinAngle } from "./thread";

const TYPE_WORD: Record<NodeType, string> = {
  company: "Company",
  person: "Person",
  address: "Address",
  document: "Document",
};

const TYPE_ICON: Record<NodeType, typeof IconBuilding> = {
  company: IconBuilding,
  person: IconUser,
  address: IconMapPin,
  document: IconFileText,
};

export const STATUS_WORD: Record<Status, string> = {
  proposed: "proposed",
  confirmed: "confirmed",
  rejected: "rejected",
  "dead-end": "dead end",
};

/** Who put it there, in words. A proposal from the agent says so, because only the person decides. */
export function whoAdded(node: Pick<BoardNode, "status" | "addedBy">): string {
  if (node.addedBy === "agent") {
    return node.status === "proposed" ? "Proposed by agent" : "Added by agent";
  }
  return "Added by you";
}

/** One line of the record's own facts: number, kind, standing. Birth dates never appear here. */
export function factsLine(node: Pick<BoardNode, "type" | "key" | "facts">): string {
  const f = node.facts;
  if (node.type === "company" && f.number) {
    return [f.number, f.type, f.status].filter(Boolean).join(" · ");
  }
  if (node.type === "document" && f.score) return `score ${f.score}`;
  return [f.role, f.status].filter(Boolean).join(" · ");
}

interface NodeCardProps {
  node: BoardNode;
  selected?: boolean;
  /** Something else is selected and this card is not connected to it. */
  dimmed?: boolean;
}

/** An index card pinned to the board. Pure display: the canvas places it and handles clicks. */
export function NodeCard({ node, selected = false, dimmed = false }: NodeCardProps) {
  const Icon = TYPE_ICON[node.type];
  const count = node.evidence.length;
  const facts = factsLine(node);
  const reasoned = node.status === "rejected" || node.status === "dead-end";

  return (
    <article
      className={`rs-card rs-card--${node.status}${selected ? " is-selected" : ""}${dimmed ? " is-dim" : ""}`}
      style={{ "--rs-tilt": `${pinAngle(node.id)}deg` } as React.CSSProperties}
      aria-label={`${TYPE_WORD[node.type]} ${node.label}, ${STATUS_WORD[node.status]}, ${whoAdded(node).toLowerCase()}, ${count} ${count === 1 ? "source" : "sources"}`}
      data-node-id={node.id}
      data-status={node.status}
    >
      <span className="rs-pin" aria-hidden="true" />
      <header className="rs-card-head">
        <span className="rs-card-type">
          <Icon size={13} stroke={1.75} aria-hidden="true" />
          {TYPE_WORD[node.type]}
        </span>
        <span className={`rs-stamp rs-stamp--${node.status}`}>{STATUS_WORD[node.status]}</span>
      </header>
      <h3 className="rs-card-title">{node.label}</h3>
      {facts ? <p className="rs-card-facts">{facts}</p> : null}
      {reasoned && node.reason ? <p className="rs-card-reason">{node.reason}</p> : null}
      <footer className="rs-card-foot">
        <span className="rs-actor">
          <span className={`rs-actor-mark rs-actor-mark--${node.addedBy}`} aria-hidden="true">
            {node.addedBy === "agent" ? (
              <IconSparkles size={10} stroke={2} />
            ) : (
              <IconUser size={10} stroke={2} />
            )}
          </span>
          {whoAdded(node)}
        </span>
        <span className="rs-sources">
          <IconPaperclip size={12} stroke={1.75} aria-hidden="true" />
          {count} {count === 1 ? "source" : "sources"}
        </span>
      </footer>
    </article>
  );
}
