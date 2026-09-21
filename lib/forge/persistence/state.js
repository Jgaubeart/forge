import "server-only";

import { cache } from "react";

import { getForgePersistence } from "./index.js";

// One read of everything Mission Bay needs, with the failure mode made explicit.
//
// If the database cannot be reached or is not configured, the UI is told so
// plainly rather than being handed an empty workspace — "no workspace" and
// "cannot reach the database" are different states and must not be confused.
export const loadMissionBayState = cache(async function loadMissionBayState(userId) {
  try {
    const persistence = await getForgePersistence();
    const membership = await persistence.workspaces.membershipForUser(userId);

    const missions = membership?.workspace
      ? await persistence.missions.list({ workspaceId: membership.workspace.id, limit: 50 })
      : [];

    return {
      ok: true,
      error: null,
      membership,
      missions,
      hasTrustedWrites: persistence.hasTrustedWrites,
    };
  } catch (error) {
    return {
      ok: false,
      error: error?.message ?? "Forge could not reach its database.",
      membership: null,
      missions: [],
      hasTrustedWrites: false,
    };
  }
});
