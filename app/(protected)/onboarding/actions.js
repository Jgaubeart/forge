"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth";
import { getForgePersistence } from "@/lib/forge/persistence";

// First-workspace onboarding.
//
// The browser submits a name. Everything else — who owns the organisation, who
// the membership belongs to, which capabilities are granted — is decided here
// from the verified session. A submitted user id is never read, and ownership is
// never taken from the form.
export async function createWorkspaceAction(previousState, formData) {
  const user = await requireUser();

  const name = String(formData.get("name") ?? "").trim().slice(0, 80);
  const organizationName = String(formData.get("organization") ?? "").trim().slice(0, 80);

  if (!name) {
    return { ok: false, message: "Give the workspace a name." };
  }

  try {
    const persistence = await getForgePersistence();
    const created = await persistence.workspaces.createForUser({
      userId: user.id,
      name,
      organizationName: organizationName || null,
    });

    revalidatePath("/", "layout");

    return {
      ok: true,
      message: created.capabilitiesGranted
        ? `${created.workspace.name} is ready. Opening Mission Bay…`
        : `${created.workspace.name} is ready, but the capability grants did not save. That can be fixed in Settings.`,
    };
  } catch (error) {
    return {
      ok: false,
      message: error?.message ?? "The workspace could not be created.",
    };
  }
}
