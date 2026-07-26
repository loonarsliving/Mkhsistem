/**
 * Vitest stand-in for the `server-only` package.
 *
 * `import "server-only"` is a build-time guard: Next resolves it to a no-op
 * through the "react-server" export condition and to a module that throws
 * everywhere else, which is what stops a server module from being pulled
 * into a client bundle. Vitest runs under neither condition, so importing
 * any server-only module from a test throws "This module cannot be imported
 * from a Client Component module" before a single assertion runs.
 *
 * Aliasing the package to this empty module in vitest.config.ts keeps the
 * real guard intact in every build while letting unit tests reach the
 * server-side logic behind it (see tests/unit/lib/cron-auth.test.ts). The
 * production worker image solves the same problem the other way, by setting
 * NODE_OPTIONS=--conditions=react-server -- see Dockerfile.render-worker.
 */
export {};
