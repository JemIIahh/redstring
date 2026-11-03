import { IconExternalLink } from "@tabler/icons-react";

import type { EvidenceRow } from "../../../server/board/types";
import { sourceLabel } from "./labels";

function day(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

/** Only an https address becomes a link, whatever a record holds. */
const isHttps = (url: string) => /^https:\/\//i.test(url);

/**
 * Where an item came from: every source row with its record id, when it was read and a short
 * fingerprint of what was read. This is the only place the excerpt shows, and so the only
 * place a month and year of birth appears (it is there to tell same-name people apart).
 */
export function EvidencePanel({ title, evidence }: { title: string; evidence: EvidenceRow[] }) {
  return (
    <section aria-label={`Sources for ${title}`} className="flex flex-col gap-3">
      <h3 className="text-sm font-semibold">Sources</h3>
      <ul className="flex flex-col gap-3">
        {evidence.map((e) => (
          <li key={e.id} className="flex flex-col gap-1 rounded-md border p-3 text-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium">{sourceLabel(e.source)}</span>
              {isHttps(e.url) ? (
                <a
                  href={e.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs underline underline-offset-2"
                >
                  Open record
                  <IconExternalLink size={12} aria-hidden="true" />
                </a>
              ) : null}
            </div>
            <span className="font-mono text-xs text-muted-foreground">{e.recordId}</span>
            {e.excerpt ? <p className="text-xs">{e.excerpt}</p> : null}
            <span className="text-xs text-muted-foreground">
              Retrieved {day(e.retrievedAt)} · <span className="font-mono">{e.contentHash.slice(0, 8)}</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
