import { notFound } from "next/navigation";

import { MissionCard } from "@/components/jarvis/mission-card";
import { JarvisOnboarding } from "@/components/jarvis/onboarding";
import { JarvisHeading, JarvisSection } from "@/components/jarvis/shell";
import { AgentDot } from "@/components/jarvis/agent-sigil";
import { ArmoryTile } from "@/components/jarvis/armory-tile";
import { FIXTURE_MISSIONS, FIXTURE_NOTICE, FIXTURE_TOOLS, FLEET } from "@/lib/jarvis-fixtures";
import { isActiveMission, isTerminalMission } from "@/lib/forge/missions";
import { createWorkspaceAction } from "../(protected)/onboarding/actions";

// Fixture preview.
//
// Fixtures are no longer the production data source, but they stay useful for
// visual work and regression checks without a database. This route is
// development-only and renders nothing in production.
export const dynamic = "force-dynamic";

export default function PreviewPage() {
  if (process.env.NODE_ENV === "production") notFound();

  const missions = FIXTURE_MISSIONS;
  const active = missions.filter((mission) => isActiveMission(mission.status));
  const closed = missions.filter((mission) => isTerminalMission(mission.status));

  return (
    <>
      <JarvisHeading
        eyebrow="Fixture preview"
        title="Mission Bay"
        sub={`${FIXTURE_NOTICE} This route exists for visual verification and renders nothing in production.`}
        meta={`${missions.length} fixture missions · ${active.length} active`}
        actions={
          <div className="jv-legend">
            {FLEET.members.map((member) => (
              <span key={member.slug}>
                <AgentDot slug={member.slug} />
                {member.slug.toUpperCase()}
              </span>
            ))}
          </div>
        }
      />

      <div className="jv-stack" style={{ marginTop: 12 }}>
        <JarvisSection title="First-run onboarding" meta="no workspace">
          <JarvisOnboarding action={createWorkspaceAction} />
        </JarvisSection>

        <JarvisSection title="Missions" meta={`${active.length} active`}>
          <div className="jv-dock">
            {active.map((mission) => (
              <MissionCard key={mission.id} mission={mission} />
            ))}
          </div>
        </JarvisSection>

        <JarvisSection title="Recently closed" meta={`${closed.length} missions`}>
          <div className="jv-dock">
            {closed.map((mission) => (
              <MissionCard key={mission.id} mission={mission} />
            ))}
          </div>
        </JarvisSection>

        <JarvisSection title="Tool Armory" meta={`${FIXTURE_TOOLS.length} tiles`}>
          <div className="jv-armory">
            {FIXTURE_TOOLS.map((tool) => (
              <ArmoryTile key={tool.id} tool={tool} />
            ))}
          </div>
        </JarvisSection>
      </div>
    </>
  );
}
