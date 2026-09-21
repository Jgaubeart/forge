"use server";

import { revalidatePath } from "next/cache";

import { getCurrentUser } from "@/lib/auth";
import { toSafeError } from "@/lib/forge/runtime/errors.js";
import { getForgeRuntime } from "@/lib/forge/runtime/index.js";

// Cancellation is the only mission mutation exposed to the browser in this
// phase. The user id always comes from the server session, and the stop call to
// Hermes happens inside the run controller, never in the browser.
export async function cancelMissionAction(previousState, formData) {
  const user = await getCurrentUser();
  if (!user) {
    return { ok: false, message: "You are not signed in." };
  }

  const taskId = String(formData.get("taskId") ?? "").trim();
  if (!taskId) {
    return { ok: false, message: "Missing mission id." };
  }

  const reasonRaw = String(formData.get("reason") ?? "").trim();
  const reason = reasonRaw ? reasonRaw.slice(0, 200) : null;

  try {
    const runtime = await getForgeRuntime();
    const result = await runtime.runController.cancelMission({
      actorUserId: user.id,
      taskId,
      reason,
    });

    revalidatePath(`/tasks/${taskId}`);
    revalidatePath("/tasks");
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
