import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";

import { createAdminClient } from "@/utils/supabase/admin";
import { createClient } from "@/utils/supabase/server";

// Resolves the authenticated user from the server-side Supabase session.
// It never accepts a client-supplied user id; identity comes from the session
// cookie via supabase.auth.getUser().
export const getCurrentUser = cache(async function getCurrentUser() {
  const supabase = await createClient();

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return null;
  }

  return user;
});

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }
  return user;
}

function fallbackDisplayName(user) {
  return (
    user?.user_metadata?.display_name ??
    user?.user_metadata?.full_name ??
    user?.email ??
    null
  );
}

// Keeps public.profiles in sync after authentication. The database trigger is
// the primary mechanism; this covers users created before the trigger and fills
// a missing display_name when one can be derived. The user id always comes from
// a server-verified session, never from client input.
export async function ensureUserProfile(user) {
  if (!user?.id) {
    return null;
  }

  const admin = createAdminClient();
  if (!admin) {
    // Service role key is not configured; the trigger owns profile creation.
    return null;
  }

  const { data: existing } = await admin
    .from("profiles")
    .select("id, display_name")
    .eq("id", user.id)
    .maybeSingle();

  if (existing) {
    if (!existing.display_name) {
      const nextName = fallbackDisplayName(user);
      if (nextName) {
        await admin
          .from("profiles")
          .update({ display_name: nextName })
          .eq("id", user.id);
      }
    }
    return existing;
  }

  const { data, error } = await admin
    .from("profiles")
    .insert({ id: user.id, display_name: fallbackDisplayName(user) })
    .select()
    .maybeSingle();

  if (error) {
    console.error("ensureUserProfile: unable to create profile", error);
    return null;
  }

  return data;
}
