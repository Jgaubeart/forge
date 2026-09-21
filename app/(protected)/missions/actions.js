"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth";
import { missionKind } from "@/lib/forge/missions";
import { getForgePersistence } from "@/lib/forge/persistence";
import {
  getForgeRuntime,
  isRuntimeEligible,
  reconcileMissionRun,
  startSingleAgentMission,
  stopMissionRun,
} from "@/lib/forge/runtime";
import { agentBySlug } from "@/lib/forge/agents";

// Mission mutations: create a durable record, start one through the runtime,
// fold runtime progress back in, and cancel. Every one of them authorizes the
// signed-in user against a workspace before anything else happens, and none of
// them lets the browser near the runtime: the server action is the only caller.
export async function startMissionAction(previousState, formData) {
  const user = await requireUser();

  const kind = String(formData.get("kind") ?? "").trim();
  const brief = String(formData.get("brief") ?? "").trim().slice(0, 400);
  const definition = missionKind(kind);

  if (!definition) {
    return { ok: false, message: "That is not a mission kind Forge knows." };
  }
  if (definition.brief.required && !brief) {
    return { ok: false, message: `${definition.title} needs a brief.` };
  }

  const persistence = await getForgePersistence();
  const membership = await persistence.workspaces.membershipForUser(user.id);

  if (!membership?.workspace) {
    return { ok: false, message: "Create a workspace before dispatching a mission." };
  }

  const durableAgents = await persistence.agents.listDurable();
  const lead = durableAgents.find((agent) => agent.slug === definition.leadAgent);

  if (!lead) {
    return {
      ok: false,
      message: `The ${definition.leadAgent.toUpperCase()} agent is not seeded in this database yet, so the mission was not created.`,
    };
  }

  try {
    const { mission, warning } = await persistence.missions.create({
      workspaceId: membership.workspace.id,
      actorUserId: user.id,
      kind: definition.kind,
      brief,
      agentId: lead.id,
      fleetId: null,
    });

    revalidatePath("/");
    revalidatePath("/history");

    return {
      ok: true,
      message:
        warning ??
        `${mission.title} is queued. Start it when you want ${definition.leadAgent.toUpperCase()} to work it.`,
    };
  } catch (error) {
    return { ok: false, message: error?.message ?? "The mission could not be saved." };
  }
}

// Authorization, then the runtime. The mission is read with the caller's own
// client, so a mission in a workspace they do not belong to simply does not
// exist for them, and the workspace id is checked again before dispatch.
async function authorizeMission(persistence, user, missionId) {
  if (!missionId) return { ok: false, message: "Missing mission id." };

  const membership = await persistence.workspaces.membershipForUser(user.id);
  if (!membership?.workspace) return { ok: false, message: "No workspace membership." };

  const mission = await persistence.missions.get(missionId);
  if (!mission || mission.workspaceId !== membership.workspace.id) {
    return { ok: false, message: "That mission is not available to you." };
  }

  return { ok: true, mission, workspace: membership.workspace };
}

export async function dispatchMissionAction(previousState, formData) {
  const user = await requireUser();
  const missionId = String(formData.get("missionId") ?? "").trim();

  const persistence = await getForgePersistence();
  const allowed = await authorizeMission(persistence, user, missionId);
  if (!allowed.ok) return { ok: false, message: allowed.message };

  const { mission, workspace } = allowed;

  if (!isRuntimeEligible(mission)) {
    return {
      ok: false,
      message: `${mission.kind.toUpperCase()} missions are not executed through the runtime yet. Phase 7 runs single read-only missions, starting with WAR ROOM.`,
    };
  }

  const definition = agentBySlug(mission.leadSlug);
  if (!definition) {
    return { ok: false, message: "The agent for this mission is not in the catalog." };
  }

  let result;
  try {
    result = await startSingleAgentMission({
      runtime: getForgeRuntime(),
      store: persistence.runs.store(),
      mission,
      agent: { ...definition, id: mission.agentId },
      workspace,
      actorUserId: user.id,
    });
  } catch (error) {
    return { ok: false, message: error?.message ?? "The mission could not be started." };
  }

  if (result.ok) {
    revalidatePath("/");
    revalidatePath("/history");
  }

  return { ok: Boolean(result.ok), message: result.message };
}

// Manual reconciliation: the runtime is asked what happened, and only what is
// genuinely new is written down. Running it twice changes nothing the second time.
export async function refreshMissionAction(previousState, formData) {
  const user = await requireUser();
  const missionId = String(formData.get("missionId") ?? "").trim();

  const persistence = await getForgePersistence();
  const allowed = await authorizeMission(persistence, user, missionId);
  if (!allowed.ok) return { ok: false, message: allowed.message };

  const { mission } = allowed;
  const run = mission ? await persistence.runs.forMission(mission.id) : null;

  if (!run?.hermesRunId) {
    return { ok: false, message: "This mission has no runtime run to reconcile with." };
  }

  let result;
  try {
    result = await reconcileMissionRun({
      runtime: getForgeRuntime(),
      store: persistence.runs.store(),
      mission,
      run,
    });
  } catch (error) {
    return { ok: false, message: error?.message ?? "The mission could not be reconciled." };
  }

  if (result.ok) {
    revalidatePath("/");
    revalidatePath("/history");
  }

  return { ok: Boolean(result.ok), message: result.message };
}

export async function cancelMissionAction(previousState, formData) {
  const user = await requireUser();
  const missionId = String(formData.get("missionId") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim().slice(0, 200) || null;

  const persistence = await getForgePersistence();
  const allowed = await authorizeMission(persistence, user, missionId);
  if (!allowed.ok) return { ok: false, message: allowed.message };

  const { mission } = allowed;

  let result;
  try {
    result = await stopMissionRun({
      runtime: getForgeRuntime(),
      store: persistence.runs.store(),
      mission,
      run: await persistence.runs.forMission(mission.id),
      actorUserId: user.id,
      reason,
    });
  } catch (error) {
    return { ok: false, message: error?.message ?? "The mission could not be cancelled." };
  }

  revalidatePath("/");
  revalidatePath("/history");

  return { ok: Boolean(result.ok), message: result.message };
}
