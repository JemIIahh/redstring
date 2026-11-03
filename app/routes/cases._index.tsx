import { useActionQuery } from "@agent-native/core/client/use-action";
import { useSetPageTitle } from "@agent-native/toolkit/app-shell/header-actions";
import { IconArrowRight } from "@tabler/icons-react";
import { Link, useNavigate } from "react-router";

import { NewCase } from "@/components/board/NewCase";
import { SAMPLE_CASE_ID, SAMPLE_TITLE } from "@/fixtures/laundromat-board";
import type { CaseSummary } from "../../server/board/types";

export function meta() {
  return [{ title: "Cases - Redstring" }];
}

function waiting(n: number): string {
  return n === 1 ? "1 waiting for you" : `${n} waiting for you`;
}

function CaseRow({ c }: { c: CaseSummary }) {
  return (
    <li>
      <Link
        to={`/case/${encodeURIComponent(c.id)}`}
        className="flex items-center justify-between gap-3 px-3 py-3 transition-colors hover:bg-accent"
      >
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-sm font-medium">{c.title}</span>
          <span className="text-xs text-muted-foreground">
            {c.items} {c.items === 1 ? "card" : "cards"}
            {c.proposed > 0 ? ` · ${waiting(c.proposed)}` : ""}
          </span>
        </span>
        <IconArrowRight size={16} className="shrink-0 text-muted-foreground" aria-hidden="true" />
      </Link>
    </li>
  );
}

export default function CasesPage() {
  useSetPageTitle("Cases");
  const navigate = useNavigate();
  const { data, isLoading, error } = useActionQuery("list-cases", {});
  const cases = (data as CaseSummary[] | undefined) ?? [];

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-4 py-8">
      <section aria-labelledby="start-heading" className="flex flex-col gap-3">
        <h2 id="start-heading" className="text-base font-semibold">
          Start a case
        </h2>
        <p className="text-sm text-muted-foreground">
          Search a company register, pick where to begin, and the agent pins what the public records
          show. You decide what is confirmed.
        </p>
        <NewCase onCreated={(id) => navigate(`/case/${encodeURIComponent(id)}`)} />
      </section>

      <section aria-labelledby="cases-heading" className="flex flex-col gap-3">
        <h2 id="cases-heading" className="text-base font-semibold">
          Your cases
        </h2>
        {error ? (
          <p className="text-sm text-muted-foreground">Your cases could not be loaded.</p>
        ) : isLoading ? (
          <p className="text-sm text-muted-foreground" aria-busy="true">
            Loading…
          </p>
        ) : cases.length === 0 ? (
          <p className="text-sm text-muted-foreground">No cases yet. Start one above.</p>
        ) : (
          <ul className="flex flex-col divide-y rounded-lg border">
            {cases.map((c) => (
              <CaseRow key={c.id} c={c} />
            ))}
          </ul>
        )}
        <p className="text-xs text-muted-foreground">
          Want to look around first?{" "}
          <Link className="underline underline-offset-2" to={`/case/${SAMPLE_CASE_ID}`}>
            Open the sample board
          </Link>{" "}
          ({SAMPLE_TITLE}, invented data).
        </p>
      </section>
    </div>
  );
}
