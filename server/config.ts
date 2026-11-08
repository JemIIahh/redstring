/**
 * The operator's settings, read from the environment in one place.
 *
 * These belong to whoever runs the app, not to the people using it: one
 * Companies House key, one SEC contact string, one set of limits, shared by
 * every signed-in user on purpose (the shared key is what the usage caps in
 * `usage/caps.ts` protect). Nothing here is a user's own credential. Read at
 * call time so a changed setting or a test override takes effect at once.
 */
const read = (v: string | undefined): string | undefined => {
  const t = v?.trim();
  return t ? t : undefined;
};

export const settings = {
  companiesHouseApiKey: () =>
    read(process.env.COMPANIES_HOUSE_API_KEY), // guard:allow-env-credential — the operator's own shared Companies House key, capped per user and globally
  secUserAgent: () =>
    read(process.env.REDSTRING_SEC_USER_AGENT), // guard:allow-env-credential — the operator's contact string that SEC requires on every request
  killSwitch: () =>
    read(process.env.REDSTRING_KILL_SWITCH), // guard:allow-env-credential — operator on/off switch, not a credential
  chCallsPerUserDay: () =>
    read(process.env.REDSTRING_CH_CALLS_PER_USER_DAY), // guard:allow-env-credential — operator limit, not a credential
  chCallsGlobalDay: () =>
    read(process.env.REDSTRING_CH_CALLS_GLOBAL_DAY), // guard:allow-env-credential — operator limit, not a credential
  casesPerUserDay: () =>
    read(process.env.REDSTRING_CASES_PER_USER_DAY), // guard:allow-env-credential — operator limit, not a credential
  agentRunsPerUserDay: () =>
    read(process.env.REDSTRING_AGENT_RUNS_PER_USER_DAY), // guard:allow-env-credential — operator limit, not a credential
  agentContinuationsPerUserDay: () =>
    read(process.env.REDSTRING_AGENT_CONTINUATIONS_PER_USER_DAY), // guard:allow-env-credential — operator limit, not a credential
  demoOwner: () =>
    read(process.env.REDSTRING_DEMO_OWNER_EMAIL), // guard:allow-env-credential — temporary recording-account allowlist, not a credential
  demoBudgetId: () =>
    read(process.env.REDSTRING_DEMO_BUDGET_ID), // guard:allow-env-credential — stable recording allowance identifier, not a credential
  demoBudgetMicroUsd: () =>
    read(process.env.REDSTRING_DEMO_BUDGET_MICRO_USD), // guard:allow-env-credential — recording allowance in millionths of USD, not a credential
  demoExpiresAt: () =>
    read(process.env.REDSTRING_DEMO_EXPIRES_AT), // guard:allow-env-credential — recording window expiry, not a credential
};
