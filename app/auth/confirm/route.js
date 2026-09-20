import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { ensureUserProfile } from "@/lib/auth";
import { createClient } from "@/utils/supabase/server";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error && data?.user) {
      await ensureUserProfile(data.user);
      revalidatePath("/", "layout");
      redirect("/");
    }
  }

  redirect("/login?message=" + encodeURIComponent("Could not verify email"));
}
