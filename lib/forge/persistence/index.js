import "server-only";

import { getUserClient, trustedClientOrNull } from "./client.js";
import { listDurableAgents } from "./agents.js";
import {
  appendMissionEvents,
  cancelMissionRecord,
  createMissionRecord,
  getMission,
  listMissions,
  missionStages,
} from "./missions.js";
import {
  consumeApprovalRecord,
  decideApprovalRecord,
  stageApprovalRecord,
} from "./approvals.js";
import { createWorkspaceForUser, getMembershipForUser } from "./workspaces.js";

// The single boundary the server components and server actions use. Nothing
// above this line touches a Supabase row shape; nothing below it knows about the
// domain.
export async function getForgePersistence() {
  const userClient = await getUserClient();
  const trustedClient = trustedClientOrNull();
  const clients = { userClient, trustedClient };

  return {
    clients,
    hasTrustedWrites: Boolean(trustedClient),
    workspaces: {
      membershipForUser: (userId) => getMembershipForUser(userClient, userId),
      createForUser: (input) => createWorkspaceForUser(userClient, input),
    },
    missions: {
      create: (input) => createMissionRecord(clients, input),
      list: (input) => listMissions({ userClient }, input),
      get: (missionId) => getMission({ userClient }, missionId),
      cancel: (input) => cancelMissionRecord(clients, input),
      appendEvents: (input) => appendMissionEvents(clients, input),
      stages: missionStages,
    },
    approvals: {
      stage: (input) => stageApprovalRecord(clients, input),
      decide: (input) => decideApprovalRecord(clients, input),
      consume: (input) => consumeApprovalRecord(clients, input),
    },
    agents: {
      listDurable: () => listDurableAgents(userClient),
    },
  };
}
