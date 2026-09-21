import { MissionCard } from "@/components/jarvis/mission-card";
import { JarvisHud } from "@/components/jarvis/hud";
import { JarvisOnboarding } from "@/components/jarvis/onboarding";
import { AgentDot } from "@/components/jarvis/agent-sigil";
import {
  JarvisEmpty,
  JarvisHeading,
  JarvisSection,
} from "@/components/jarvis/shell";
import { expiryWord, feedLine, clockOf } from "@/components/jarvis/mission-view";
import { requireUser } from "@/lib/auth";
import { FLEET, agentBySlug } from "@/lib/forge/agents";
import { MISSION_KINDS, isActiveMission, isTerminalMission } from "@/lib/forge/missions";
import { loadMissionBayState } from "@/lib/forge/persistence/state.js";
import { createWorkspaceAction } from "./onboarding/actions";
import { startMissionAction, cancelMissionAction } from "./missions/actions";

// Mission Bay on durable state.
//
// Three honest states, never confused with each other:
//   - the database cannot be reached      -> say so
//   - signed in with no workspace         -> one-step onboarding
//   - a workspace with missions (or none) -> the dock
export default async function MissionBayPage() {
  const user = await requireUser();
  const state = await loadMissionBayState(user.id);

  if (!state.ok) {
    return (
      <>
        <JarvisHeading
          eyebrow="Mission Bay"
          title="Mission Bay"
          sub="Forge keeps its missions in Supabase."
        />
        <div className="jv-notice wait" style={{ marginTop: 12 }}>
          <span className="jv-mono">offline</span>
          Forge could not reach its database, so no mission state is shown. The
          connection and the migration both need to be in place before Mission Bay
          is useful. Nothing here is a fixture.
        </div>
      </>
    );
  }

  if (!state.membership?.workspace) {
    return <JarvisOnboarding action={createWorkspaceAction} />;
  }

  const missions = state.missions;
  const active = missions.filter((mission) => isActiveMission(mission.status));
  const closed = missions.filter((mission) => isTerminalMission(mission.status));
  const awaiting = missions.filter((mission) => mission.approval?.state === "pending");

  const kinds = MISSION_KINDS.map((kind) => ({
    key: kind.kind,
    icon: kind.icon,
    name: kind.title,
    needsBrief: kind.brief.required,
  }));

  const recentEvents = missions
    .flatMap((mission) => mission.events.slice(-2).map((event) => ({ ...feedLine(event, mission), missionId: mission.id })))
    .slice(-10);

  return (
    <>
      <JarvisHeading
        eyebrow="Mission Bay"
        title="Mission Bay"
        sub="Ask for an outcome. Forge records the mission durably; the runtime that will work it is not connected yet."
        meta={`${state.membership.workspace.name} · ${active.length} active · ${awaiting.length} awaiting your word`}
        actions={
          <div className="jv-legend">
            {FLEET.members.map((member) => (
              <span key={member.slug}>
                <AgentDot slug={member.slug} />
                {agentBySlug(member.slug)?.name ?? member.slug.toUpperCase()}
              </span>
            ))}
          </div>
        }
      />

      <div className="jv-stack" style={{ marginTop: 12 }}>
        {!state.hasTrustedWrites ? (
          <div className="jv-notice wait">
            <span className="jv-mono">config</span>
            Mission events and approvals need SUPABASE_SERVICE_ROLE_KEY on the
            server. Missions still save; their history will be empty until it is set.
          </div>
        ) : null}

        <JarvisHud
          kinds={kinds}
          counts={{ missions: active.length, awaiting: awaiting.length }}
          startAction={startMissionAction}
        />

        <div className="jv-cols">
          <div className="jv-stack">
            <JarvisSection title="Missions" meta={`${active.length} active`}>
              {active.length > 0 ? (
                <div className="jv-dock">
                  {active.map((mission) => (
                    <MissionCard
                      key={mission.id}
                      mission={mission}
                      cancelAction={cancelMissionAction}
                    />
                  ))}
                </div>
              ) : (
                <JarvisEmpty
                  title="No missions yet"
                  text="Dispatch one from the command bar. It is saved as queued — no runtime is connected, so nothing starts on its own."
                />
              )}
            </JarvisSection>

            {closed.length > 0 ? (
              <JarvisSection title="Recently closed" meta={`${closed.length} missions`}>
                <div className="jv-dock">
                  {closed.map((mission) => (
                    <MissionCard
                      key={mission.id}
                      mission={mission}
                      cancelAction={cancelMissionAction}
                    />
                  ))}
                </div>
              </JarvisSection>
            ) : null}
          </div>

          <div className="jv-stack">
            <JarvisSection title={FLEET.name} meta={`${FLEET.members.length} workers`}>
              <div className="jv-team">
                {FLEET.members.map((member) => (
                  <span className="jv-worker" key={member.slug}>
                    <AgentDot slug={member.slug} />
                    {agentBySlug(member.slug)?.name ?? member.slug.toUpperCase()}
                    <em>{member.role}</em>
                  </span>
                ))}
              </div>
              <p className="jv-sub" style={{ marginTop: 8 }}>
                Coordinated by JARVIS. Workers stay idle until a runtime reports
                work, and nothing here pretends otherwise.
              </p>
            </JarvisSection>

            <JarvisSection title="Awaiting your word" meta={awaiting.length}>
              {awaiting.length > 0 ? (
                awaiting.map((mission) => (
                  <div className="jv-row" key={mission.id}>
                    <span className="jv-dot lg live" style={{ background: "#f4a93a" }} />
                    <span className="main">
                      <span className="t">{mission.approval?.tool}</span>
                      <span className="m">
                        <span>{mission.approval?.capability}</span>
                        <span>expires {expiryWord(mission.approval?.expiresAt)}</span>
                      </span>
                    </span>
                  </div>
                ))
              ) : (
                <JarvisEmpty title="All clear" text="Nothing is waiting on a decision." />
              )}
            </JarvisSection>

            <JarvisSection title="Recent mission events">
              {recentEvents.length > 0 ? (
                <ol className="jv-feed" style={{ maxHeight: 220 }}>
                  {recentEvents.map((event) => (
                    <li key={`${event.missionId}-${event.id}`}>
                      <b style={{ color: "#a7c4b6" }}>
                        {String(event.agentSlug ?? "jarvis").toUpperCase()}
                      </b>
                      <span className={event.tone === "err" ? "lbl err" : "lbl"}>
                        {event.text}
                      </span>
                      <span className="ts">{clockOf(event.at)}</span>
                    </li>
                  ))}
                </ol>
              ) : (
                <JarvisEmpty
                  title="Nothing recorded yet"
                  text="Mission, worker, tool, and approval events appear here as the mission progresses."
                />
              )}
            </JarvisSection>
          </div>
        </div>
      </div>
    </>
  );
}
