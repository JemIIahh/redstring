// Public deployment address, never a credential. Requests cannot choose an
// upstream origin: all server/protocol routes go to this fixed backend.
export const BACKEND_ORIGIN = "https://redstring-investigations.netlify.app";

export function frontendRoutes() {
  return [
    {
      src: "/((?:_agent-native|api|mcp|a2a|\\.well-known)(?:/.*)?)",
      dest: `${BACKEND_ORIGIN}/$1`,
      headers: { "x-vercel-enable-rewrite-caching": "0", "Cache-Control": "no-store" },
    },
    {
      src: "/((?:sign-in|login|signup|forgot-password|reset-password|verify-email)(?:/.*)?)",
      dest: `${BACKEND_ORIGIN}/$1`,
      headers: { "x-vercel-enable-rewrite-caching": "0", "Cache-Control": "no-store" },
    },
    // This stable entry belongs to the backend-rendered auth page and must
    // use that same build. Other UI assets are served by Vercel first.
    { src: "/assets/auth-client\\.js", dest: `${BACKEND_ORIGIN}/assets/auth-client.js`, headers: { "Cache-Control": "no-cache" } },
    { src: "/\\.netlify/scripts/(.*)", dest: `${BACKEND_ORIGIN}/.netlify/scripts/$1` },
    { handle: "filesystem" },
    // Auth screens are rendered by the backend's auth handler. Their hashed
    // client assets can differ from this SPA build's assets.
    { src: "/assets/(.*)", dest: `${BACKEND_ORIGIN}/assets/$1` },
    { src: "/.*", dest: "/index.html", headers: { "Cache-Control": "no-cache" } },
  ];
}
