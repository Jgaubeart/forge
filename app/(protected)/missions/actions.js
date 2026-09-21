"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth";
import { missionKind } from "@/lib/forge/missions";
import { getForgePersistence } from "@/lib/forge/persistence";

// Mission mutations available in this phase: create a durable record, and cancel
// one. Nothing here calls a runtime: creating a mission persists it as queued and
// says so, and cancelling only closes the record.
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
        `${mission.title} is queued. No runtime is connected yet, so nothing has started.`,
    };
  } catch (error) {
    return { ok: false, message: error?.message ?? "The mission could not be saved." };
  }
}

export async function cancelMissionAction(previousState, formData) {
  const user = await requireUser();
  const missionId = String(formData.get("missionId") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim().slice(0, 200) || null;

  if (!missionId) return { ok: false, message: "Missing mission id." };

  const persistence = await getForgePersistence();
  const membership = await persistence.workspaces.membershipForUser(user.id);
  if (!membership?.workspace) {
    return { ok: false, message: "No workspace membership." };
  }

  try {
    await persistence.missions.cancel({
      missionId,
      workspaceId: membership.workspace.id,
      actorUserId: user.id,
      reason,
    });

    revalidatePath("/");
    revalidatePath("/history");

    return { ok: true, message: "Mission cancelled. History and partial work are kept." };
  } catch (error) {
    return { ok: false, message: error?.message ?? "The mission could not be cancelled." };
  }
}
