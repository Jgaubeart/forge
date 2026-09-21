import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth";
import { getSupabase, read, readOne } from "./db";

// Resolves everything the shell needs about the viewer: identity, profile,
// current workspace, organization, and membership capabilities.
//
// Identity always comes from the server-verified session cookie. A missing
// workspace, organization, or profile is a normal state in this phase, not an
// error, so each lookup degrades to null and records a console warning instead.
const loadForgeContext = cache(async function loadForgeContext() {
  const user = await getCurrentUser();
  if (!user) return null;

  const supabase = await getSupabase();
  const issues = [];

  const profileResult = await readOne(
    supabase
      .from("profiles")
      .select("display_name")
      .eq("id", user.id)
      .maybeSingle(),
    "profile"
  );

  if (profileResult.failed) issues.push("profile");

  const membershipResult = await readOne(
    supabase
      .from("workspace_memberships")
      .select(
        "id, role, workspace_id, workspaces ( id, name, slug, kind, organization_id )"
      )
      .eq("user_id", user.id)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
    "workspace membership"
  );

  if (membershipResult.failed) issues.push("workspace membership");

  const membership = membershipResult.row;
  const workspace = membership?.workspaces ?? null;

  let organization = null;
  if (workspace?.organization_id) {
    const organizationResult = await readOne(
      supabase
        .from("organizations")
        .select("id, name, slug")
        .eq("id", workspace.organization_id)
        .maybeSingle(),
      "organization"
    );

    if (organizationResult.failed) issues.push("organization");
    organization = organizationResult.row;
  }

  let capabilities = [];
  if (membership?.id) {
    const capabilitiesResult = await read(
      supabase
        .from("membership_capabilities")
        .select("capability, action_level")
        .eq("workspace_membership_id", membership.id)
        .order("capability", { ascending: true }),
      "membership capabilities"
    );

    if (capabilitiesResult.failed) issues.push("membership capabilities");
    capabilities = capabilitiesResult.rows ?? [];
  }

  const displayName =
    profileResult.row?.display_name ??
    user.user_metadata?.display_name ??
    user.user_metadata?.full_name ??
    user.email ??
    "Signed in";

  return {
    supabase,
    user: {
      id: user.id,
      email: user.email ?? null,
    },
    displayName,
    profile: profileResult.row,
    membership: membership ? { id: membership.id, role: membership.role } : null,
    workspace,
    organization,
    capabilities,
    issues,
  };
});

// Next renders a layout and its page concurrently, so a page cannot rely on the
// protected layout's redirect having already run. Pages use this accessor, which
// redirects on its own instead of handing back a null context.
export const requireForgeContext = cache(async function requireForgeContext() {
  const context = await loadForgeContext();
  if (!context) {
    redirect("/login");
  }
  return context;
});
