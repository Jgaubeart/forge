import "server-only";

import { cache } from "react";

import { createAdminClient } from "@/utils/supabase/admin";
import { createClient } from "@/utils/supabase/server";
import { PersistenceError } from "./errors.js";

// Two clients, two jobs — the same split the runtime uses:
//
//   user client    -> the signed-in session's cookie-scoped client. Every read
//                     and every user-owned write goes through it, so RLS decides
//                     what exists and what may be created.
//   trusted client -> service role, server-only. Used for the records a browser
//                     session must not be able to write: the mission event
//                     stream and staged approvals. Phase 5 grants no INSERT
//                     policy on those tables, so this is the only write path.

export { PersistenceError };

export const getUserClient = cache(async function getUserClient() {
  return createClient();
});

// Returns null when the service role key is not configured, so callers can
// decide whether a missing trusted path is fatal for what they are doing.
export function trustedClientOrNull() {
  return createAdminClient();
}

export function requireTrustedClient() {
  const client = trustedClientOrNull();
  if (!client) {
    throw new PersistenceError(
      "trusted_writes_not_configured",
      "SUPABASE_SERVICE_ROLE_KEY is not configured, so mission events and approvals cannot be recorded yet."
    );
  }
  return client;
}
