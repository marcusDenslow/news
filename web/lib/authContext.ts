// Per-request Miniflux auth, carried without threading a credential through
// every function signature. API routes seed this (from the caller's session)
// via `withSession`; the low-level `mf()` client reads it. When empty (system
// tasks like the backfill timer, or the unauthenticated auth routes) `mf()`
// falls back to the env admin token.

import { AsyncLocalStorage } from "node:async_hooks";

export interface AuthCtx {
  authHeaders: Record<string, string>;
}

export const authStore = new AsyncLocalStorage<AuthCtx>();
