import { defineAction, fail, type ActionRunContext } from "@agent-native/core/action";
import { z } from "zod";

import { createCase, logActivity, pinNode } from "../server/board/store.js";
import type { EvidenceInput } from "../server/board/types.js";
import { buildSources, type Sources } from "../server/sources/registry.js";
import { SourceError } from "../server/sources/types.js";
import { releaseUsage, takeUsage } from "../server/usage/caps.js";
import { failFrom, requireOwner, requirePerson } from "../server/actions-support.js";

const MAX_SEEDS = 10;

const schema = z.object({
  title: z.string().trim().min(1).max(120),
  seeds: z
    .array(
      z.union([
        z.object({ companyNumber: z.string().trim().min(1).max(20) }),
        z.object({
          cik: z.string().trim().regex(/^\d{1,10}$/),
          name: z.string().trim().min(1).max(200),
        }),
      ]),
    )
    .min(1)
    .max(MAX_SEEDS)
    .describe("The companies the investigation starts from: UK by company number, US by SEC CIK and name"),
});

type Seed =
  | { kind: "uk"; number: string }
  | { kind: "us"; cik: string; name: string };

/** One entry per company however it was typed: numbers uppercased, CIKs without leading zeros. */
function normaliseSeeds(raw: z.infer<typeof schema>["seeds"]): Seed[] {
  const seen = new Set<string>();
  const out: Seed[] = [];
  for (const s of raw) {
    const seed: Seed =
      "companyNumber" in s
        ? { kind: "uk", number: s.companyNumber.trim().toUpperCase() }
        : { kind: "us", cik: s.cik.trim().replace(/^0+/, "") || "0", name: s.name.trim() };
    const id = seed.kind === "uk" ? `uk:${seed.number}` : `us:${seed.cik}`;
    if (seed.kind === "uk" ? !seed.number : !seed.name) {
      fail("Each starting company needs a number or name.", { errorCode: "bad_seeds", statusCode: 400 });
    }
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(seed);
  }
  if (out.length === 0 || out.length > MAX_SEEDS) {
    fail(`Pick between 1 and ${MAX_SEEDS} companies to start from.`, {
      errorCode: "bad_seeds",
      statusCode: 400,
    });
  }
  return out;
}

interface SeedNode {
  key: string;
  label: string;
  facts: Record<string, string>;
  evidence: EvidenceInput;
}

/** Reads the register for one seed. Nothing is written until every seed has been read. */
async function readSeed(sources: Sources, seed: Seed): Promise<SeedNode> {
  if (seed.kind === "uk") {
    try {
      const r = await sources.ch.getCompany(seed.number);
      const p = r.data;
      return {
        key: p.number,
        label: p.name || p.number,
        // Expansion needs the jurisdiction; the neighbours step reads the
        // address and the limited-partnership check reads the type.
        facts: {
          jurisdiction: "uk",
          number: p.number,
          ...(p.type ? { type: p.type } : {}),
          ...(p.status ? { status: p.status } : {}),
          ...(p.address ? { address: p.address } : {}),
        },
        evidence: r.evidence,
      };
    } catch (e) {
      if (e instanceof SourceError && e.kind === "not_found") {
        fail(`Companies House has no company numbered ${seed.number}.`, {
          errorCode: "source_not_found",
          statusCode: 404,
        });
      }
      throw e;
    }
  }
  try {
    const r = await sources.sec.recentFilings(seed.cik, { cap: 1 });
    return {
      key: seed.cik,
      label: seed.name,
      facts: { jurisdiction: "us", cik: seed.cik },
      evidence: r.evidence,
    };
  } catch (e) {
    if (e instanceof SourceError && e.kind === "not_found") {
      fail(`The SEC has no filer with CIK ${seed.cik}.`, {
        errorCode: "source_not_found",
        statusCode: 404,
      });
    }
    throw e;
  }
}

export async function createCaseRun(
  args: z.infer<typeof schema>,
  ctx?: ActionRunContext,
  deps: { sources?: Sources } = {},
): Promise<{ caseId: string }> {
  requirePerson(ctx);
  const ownerEmail = requireOwner(ctx);
  const title = args.title.trim();
  if (!title) fail("Give the case a title.", { errorCode: "bad_title", statusCode: 400 });
  const seeds = normaliseSeeds(args.seeds);

  try {
    // Counted up front, in one step, so a burst of requests cannot all slip under the limit.
    await takeUsage(ownerEmail, "case-create");
    const sources = deps.sources ?? buildSources(ownerEmail);
    // Read every company first: a company that cannot be found creates no case, so it costs no case.
    const nodes: SeedNode[] = [];
    try {
      for (const seed of seeds) nodes.push(await readSeed(sources, seed));
    } catch (e) {
      await releaseUsage(ownerEmail, "case-create");
      throw e;
    }

    // The case exists now, so it stays counted against the day's limit even if a pin fails.
    const c = await createCase(ownerEmail, title);
    for (const n of nodes) {
      await pinNode({
        caseId: c.id,
        ownerEmail,
        type: "company",
        key: n.key,
        label: n.label,
        facts: n.facts,
        evidence: [n.evidence],
        actor: "person",
        status: "confirmed",
      });
    }
    await logActivity({
      caseId: c.id,
      ownerEmail,
      actor: "person",
      caller: "frontend",
      kind: "create-case",
      detail: `${nodes.length} starting ${nodes.length === 1 ? "company" : "companies"}: ${nodes
        .map((n) => n.label)
        .join(", ")}`,
    });
    return { caseId: c.id };
  } catch (e) {
    return failFrom(e);
  }
}

export default defineAction({
  description:
    "Start a case from one to ten companies the person picked. Every starting company is read from its register and pinned as confirmed. Only the person does this.",
  schema,
  uiOnly: true,
  http: { method: "POST" },
  run: createCaseRun,
});
