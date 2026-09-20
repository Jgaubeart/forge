"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { ensureUserProfile } from "@/lib/auth";
import { createClient } from "@/utils/supabase/server";

function loginRedirect(message) {
  redirect(`/login?message=${encodeURIComponent(message)}`);
}

async function getSiteUrl() {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  if (configured) {
    return configured.replace(/\/+$/, "");
  }

  try {
    const requestHeaders = await headers();
    const host =
      requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
    const proto = requestHeaders.get("x-forwarded-proto") ?? "https";
    if (host) {
      return `${proto}://${host}`;
    }
  } catch {
    // headers() is unavailable outside a request scope.
  }

  return null;
}

export async function login(formData) {
  const supabase = await createClient();

  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    loginRedirect("Could not authenticate user");
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    await ensureUserProfile(user);
  }

  revalidatePath("/", "layout");
  redirect("/");
}

export async function signup(formData) {
  const supabase = await createClient();

  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const siteUrl = await getSiteUrl();

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      ...(siteUrl ? { emailRedirectTo: `${siteUrl}/auth/confirm` } : {}),
    },
  });

  if (error) {
    loginRedirect("Could not sign up");
  }

  if (data?.user) {
    await ensureUserProfile(data.user);
  }

  if (data?.session) {
    revalidatePath("/", "layout");
    redirect("/");
  }

  loginRedirect("Check your email to continue sign in process");
}
