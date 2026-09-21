"use server";

import { revalidatePath } from "next/cache";

import { getCurrentUser } from "@/lib/auth";
import { toSafeError } from "@/lib/forge/runtime/errors.js";
import { getForgeRuntime } from "@/lib/forge/runtime/index.js";

// Mission control actions. Every one of them authorizes server-side from the
// session, and every Hermes call happens inside the run controller. The browser
// never talks to Hermes and never supplies identity.

export async function startMissionAction(previousState, formData) {
  const user = await getCurrentUser();
  if (!user) return { ok: false, message: "You are not signed in." };

  const kind = String(formData.get("kind") ?? "").trim();
  const brief = String(formData.get("brief") ?? "").trim().slice(0, 400);

  const runtime = await getForgeRuntime();
  const workspaceId = await currentWorkspaceId(user.id);
  if (!workspaceId) {
    return { ok: false, message: "Your account is not a member of a workspace yet." };
  }

  try {
    const result = await runtime.runController.startCatalogMission({
      actorUserId: user.id,
      workspaceId,
      kind,
      brief,
    });

    revalidatePath("/");
    revalidatePath("/missions");

    if (result.status === "failed") {
      return {
        ok: false,
        message: `Mission recorded, but the run could not start: ${result.error?.message ?? "unknown error"}`,
      };
    }

    return {
      ok: true,
      message: `Mission dispatched. ${result.team?.length ? `${result.team.length} agents assigned.` : ""}`.trim(),
    };
  } catch (error) {
    const safe = toSafeError(error);
    return { ok: false, message: safe.message };
  }
}

// Approving runs the exact staged snapshot through the tool gateway. If the
// provider adapter is not implemented yet, the operator is told plainly instead
// of being shown a success.
export async function approveApprovalAction(previousState, formData) {
  const user = await getCurrentUser();
  if (!user) return { ok: false, message: "You are not signed in." };

  const approvalId = String(formData.get("approvalId") ?? "").trim();
  if (!approvalId) return { ok: false, message: "Missing approval id." };

  const runtime = await getForgeRuntime();

  try {
    const existing = await runtime.repository.getApprovalForUser({
      approvalId,
      userId: user.id,
    });
    if (!existing) return { ok: false, message: "That approval is not available to you." };

    if (existing.status === "pending") {
      await runtime.approvals.decide({
        approvalId,
        actorUserId: user.id,
        decision: "approved",
      });
    }

    const executed = await runtime.toolGateway.executeApprovedAction({
      actorUserId: user.id,
      approvalId,
    });

    revalidatePath(`/missions/${existing.taskId}`);
    revalidatePath("/");
    revalidatePath("/approvals");

    return {
      ok: true,
      message:
        executed.confirmation === "confirmed"
          ? "Confirmed by the provider. The receipt is on the mission."
          : "Accepted by the tool. Check the receipt before treating it as published.",
    };
  } catch (error) {
    const safe = toSafeError(error);
    return { ok: false, message: `${safe.message} No action was taken.` };
  }
}

export async function denyApprovalAction(previousState, formData) {
  const user = await getCurrentUser();
  if (!user) return { ok: false, message: "You are not signed in." };

  const approvalId = String(formData.get("approvalId") ?? "").trim();
  if (!approvalId) return { ok: false, message: "Missing approval id." };

  const runtime = await getForgeRuntime();

  try {
    const approval = await runtime.approvals.decide({
      approvalId,
      actorUserId: user.id,
      decision: "denied",
    });

    revalidatePath(`/missions/${approval?.taskId ?? ""}`);
    revalidatePath("/");
    revalidatePath("/approvals");

    return { ok: true, message: "Declined. Nothing was executed." };
  } catch (error) {
    const safe = toSafeError(error);
    return { ok: false, message: safe.message };
  }
}

export async function cancelMissionAction(previousState, formData) {
  const user = await getCurrentUser();
  if (!user) return { ok: false, message: "You are not signed in." };

  const taskId = String(formData.get("taskId") ?? "").trim();
  if (!taskId) return { ok: false, message: "Missing mission id." };

  const reasonRaw = String(formData.get("reason") ?? "").trim();
  const reason = reasonRaw ? reasonRaw.slice(0, 200) : null;

  const runtime = await getForgeRuntime();

  try {
    const result = await runtime.runController.cancelMission({
      actorUserId: user.id,
      taskId,
      reason,
    });

    revalidatePath(`/missions/${taskId}`);
    revalidatePath("/missions");
    revalidatePath("/");

    return {
      ok: true,
      message: result.hermesStopped
        ? "Mission cancelled and the Hermes run was stopped."
        : "Mission cancelled. There was no Hermes run to stop.",
    };
  } catch (error) {
    const safe = toSafeError(error);
    return { ok: false, message: safe.message };
  }
}

async function currentWorkspaceId(userId) {
  const { getSupabase } = await import("@/lib/forge/db");
  const supabase = await getSupabase();
  const { data } = await supabase
    .from("workspace_memberships")
    .select("workspace_id")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return data?.workspace_id ?? null;
}
