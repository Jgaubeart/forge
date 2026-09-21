import { ForgeAppShell } from "@/components/forge/app-shell";
import { requireUser } from "@/lib/auth";
import { requireForgeContext } from "@/lib/forge/context";
import { countPendingApprovals } from "@/lib/forge/queries";

// Every Forge screen depends on the signed-in session and live workspace data.
export const dynamic = "force-dynamic";

export default async function ProtectedLayout({ children }) {
  await requireUser();

  const context = await requireForgeContext();

  const pendingApprovals = await countPendingApprovals(
    context.supabase,
    context.workspace?.id
  );

  return (
    <ForgeAppShell
      context={context}
      badges={{ "/approvals": pendingApprovals }}
    >
      {children}
    </ForgeAppShell>
  );
}
