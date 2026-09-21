import { PersistenceError } from "./errors.js";

// Workspace and organisation persistence.
//
// The person creating the workspace always comes from the verified session; the
// browser only supplies a name. Ownership is decided server-side, and the four
// inserts are ordered so a failure cannot leave an organisation behind without
// its owner: if the workspace insert fails, the organisation created moments
// earlier is removed again.

// The initial owner gets internal Forge capability only. Nothing external is
// granted just because someone owns a workspace.
export const OWNER_BOOTSTRAP_CAPABILITIES = Object.freeze([
  { capability: "workspace.read", action_level: "read" },
  { capability: "mission.coordinate", action_level: "read" },
]);

export async function getMembershipForUser(userClient, userId) {
  const { data, error } = await userClient
    .from("workspace_memberships")
    .select("id, role, workspace_id, workspaces ( id, name, slug, kind, organization_id )")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw new PersistenceError("membership_read_failed", error.message);
  if (!data) return null;

  let organization = null;
  const organizationId = data.workspaces?.organization_id ?? null;
  if (organizationId) {
    const { data: org } = await userClient
      .from("organizations")
      .select("id, name, slug")
      .eq("id", organizationId)
      .maybeSingle();
    organization = org ?? null;
  }

  return {
    id: data.id,
    role: data.role,
    workspace: data.workspaces
      ? {
          id: data.workspaces.id,
          name: data.workspaces.name,
          slug: data.workspaces.slug,
          kind: data.workspaces.kind,
        }
      : null,
    organization,
  };
}

export async function createWorkspaceForUser(
  userClient,
  { userId, name, organizationName = null, trustedClient = null }
) {
  const workspaceName = String(name ?? "").trim().slice(0, 80);
  if (!workspaceName) {
    throw new PersistenceError("workspace_name_required", "A workspace name is required.");
  }

  const organizationLabel = String(organizationName ?? "").trim().slice(0, 80) || workspaceName;
  const organizationSlug = slugify(organizationLabel);
  const workspaceSlug = slugify(workspaceName);

  // Ordering matters: an INSERT ... RETURNING has to satisfy the table's SELECT
  // policy as well, and neither an organisation nor a workspace is visible to its
  // creator until the matching membership row exists. So each row is inserted
  // plainly, its membership is created, and only then is the row read back.
  const { error: organizationError } = await userClient
    .from("organizations")
    .insert({ name: organizationLabel, slug: organizationSlug, created_by: userId });

  if (organizationError) {
    throw new PersistenceError("organization_create_failed", organizationError.message);
  }

  // The creator cannot read their own organisation until the membership row
  // exists, so this single read-back goes through the server's trusted client.
  // Everything else stays on the user's own session and RLS.
  const readClient = trustedClient ?? userClient;
  const { data: organization, error: organizationReadError } = await readClient
    .from("organizations")
    .select("id, name, slug")
    .eq("slug", organizationSlug)
    .maybeSingle();

  if (organizationReadError || !organization) {
    throw new PersistenceError(
      "organization_read_failed",
      organizationReadError?.message ?? "The new organisation could not be read back."
    );
  }

  const organizationId = organization.id;

  const { error: organizationMembershipError } = await userClient
    .from("organization_memberships")
    .insert({ organization_id: organizationId, user_id: userId, role: "owner" });

  if (organizationMembershipError) {
    await userClient.from("organizations").delete().eq("id", organizationId);
    throw new PersistenceError(
      "organization_membership_create_failed",
      organizationMembershipError.message
    );
  }

  const { error: workspaceError } = await userClient.from("workspaces").insert({
    organization_id: organizationId,
    name: workspaceName,
    slug: workspaceSlug,
    kind: "business",
    created_by: userId,
  });

  if (workspaceError) {
    // Compensating cleanup: never leave an organisation the owner cannot reach.
    await userClient.from("organizations").delete().eq("id", organizationId);
    throw new PersistenceError("workspace_create_failed", workspaceError.message);
  }

  // Readable now because the workspaces policy also allows its creator.
  const { data: workspace, error: workspaceReadError } = await userClient
    .from("workspaces")
    .select("id, name, slug, kind")
    .eq("slug", workspaceSlug)
    .maybeSingle();

  if (workspaceReadError || !workspace) {
    await userClient.from("organizations").delete().eq("id", organizationId);
    throw new PersistenceError(
      "workspace_read_failed",
      workspaceReadError?.message ?? "The new workspace could not be read back."
    );
  }

  const { data: membership, error: membershipError } = await userClient
    .from("workspace_memberships")
    .insert({ workspace_id: workspace.id, user_id: userId, role: "owner" })
    .select("id")
    .single();

  if (membershipError) {
    await userClient.from("workspaces").delete().eq("id", workspace.id);
    await userClient.from("organizations").delete().eq("id", organizationId);
    throw new PersistenceError("workspace_membership_create_failed", membershipError.message);
  }

  const { error: capabilitiesError } = await userClient
    .from("membership_capabilities")
    .insert(
      OWNER_BOOTSTRAP_CAPABILITIES.map((entry) => ({
        workspace_membership_id: membership.id,
        capability: entry.capability,
        action_level: entry.action_level,
      }))
    );

  if (capabilitiesError) {
    // Capabilities are recoverable without destroying the workspace; report it
    // rather than rolling back the whole onboarding.
    console.error(
      `[forge:persistence] owner capability bootstrap failed: ${capabilitiesError.message}`
    );
  }

  return {
    organization,
    workspace,
    membershipId: membership.id,
    capabilitiesGranted: !capabilitiesError,
  };
}

function slugify(value) {
  const base = String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return `${base || "workspace"}-${Math.random().toString(36).slice(2, 7)}`;
}
