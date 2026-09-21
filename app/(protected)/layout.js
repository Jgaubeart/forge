import { JarvisShell } from "@/components/jarvis/shell";
import { requireUser } from "@/lib/auth";
import { AGENTS, FIXTURE_MISSIONS, fixtureTools } from "@/lib/jarvis-fixtures";

// The Jarvis shell wraps every authenticated surface. Authentication itself is
// unchanged: the session still comes from Supabase, and this phase adds no
// persistence — the counts below describe the fixture set.
export default async function ProtectedLayout({ children }) {
  const user = await requireUser();

  const counts = {
    label: "fixture workspace",
    missions: FIXTURE_MISSIONS.filter((mission) => mission.status === "running").length,
    agents: AGENTS.length,
    tools: fixtureTools().filter((tool) => tool.status === "connected").length,
    events: FIXTURE_MISSIONS.reduce((total, mission) => total + mission.events.length, 0),
    awaiting: FIXTURE_MISSIONS.filter((mission) => mission.status === "awaiting_confirm")
      .length,
  };

  return (
    <JarvisShell user={user} context={{ workspace: null }} counts={counts}>
      {children}
    </JarvisShell>
  );
}
