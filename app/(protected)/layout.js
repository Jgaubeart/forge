import { JarvisShell } from "@/components/jarvis/shell";
import { requireUser } from "@/lib/auth";
import { AGENTS } from "@/lib/forge/agents";
import { isActiveMission } from "@/lib/forge/missions";
import { loadMissionBayState } from "@/lib/forge/persistence/state.js";

// The shell reads durable state: the signed-in person's workspace and missions.
// Authentication is unchanged (Supabase session via middleware + requireUser).
export default async function ProtectedLayout({ children }) {
  const user = await requireUser();
  const state = await loadMissionBayState(user.id);

  const counts = {
    label: state.membership?.workspace?.name ?? "No workspace yet",
    missions: state.missions.filter((mission) => isActiveMission(mission.status)).length,
    agents: AGENTS.length,
    tools: 0,
    events: state.missions.reduce((total, mission) => total + mission.events.length, 0),
    awaiting: state.missions.filter((mission) => mission.approval?.state === "pending").length,
  };

  return (
    <JarvisShell
      user={user}
      context={{ workspace: state.membership?.workspace ?? null, organization: state.membership?.organization ?? null }}
      counts={counts}
    >
      {children}
    </JarvisShell>
  );
}
