import type { Config } from "@react-router/dev/config";

export default {
  appDirectory: "app",
  // The Netlify backend retains SSR for its auth/protocol endpoints. Vercel
  // receives only the separately built static application shell and assets.
  // guard:allow-env-credential — build-only mode selector, not a credential
  ssr: process.env.REDSTRING_FRONTEND_ONLY !== "1",
  splitRouteModules: false,
  routeDiscovery: { mode: "initial" },
} satisfies Config;
