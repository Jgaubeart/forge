import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/utils/supabase/server";

export async function POST() {
  const supabase = await createClient();

  try {
    await supabase.auth.signOut();
  } catch {
    // Ignore: the user may already be signed out.
  }

  revalidatePath("/", "layout");
  redirect("/login");
}
