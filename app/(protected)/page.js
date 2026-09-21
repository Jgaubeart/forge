import { MissionCard } from "@/components/jarvis/mission-card";
import { JarvisHud } from "@/components/jarvis/hud";
import { AgentDot } from "@/components/jarvis/agent-sigil";
import {
  JarvisEmpty,
  JarvisFixtureNotice,
  JarvisHeading,
  JarvisSection,
} from "@/components/jarvis/shell";
import { FIXTURE_MISSIONS, FLEET, fixtureKindKeys } from "@/lib/jarvis-fixtures";
import { MISSION_KINDS, isActiveMission, isTerminalMission } from "@/lib/forge/missions";
import { clockOf, expiryWord, feedLine } from "@/components/jarvis/mission-view";

// Mission Bay, ported from the reference viewer: the mission dock is the centre
// of the screen, the Fleet reads as a team, approvals live inside the mission
// that staged them, and the command bar sits where the reference HUD does.
// Mission kinds come from the canonical mission catalog.
const KINDS = MISSION_KINDS.map((kind) => ({
  key: kind.kind,
  icon: kind.icon,
  name: kind.title,
  needsBrief: kind.brief.required,
}));

export default function MissionBayPage() {
  const active = FIXTURE_MISSIONS.filter(
    (mission) => isActiveMission(mission.status) && !isTerminalMission(mission.status)
  );
  const closed = FIXTURE_MISSIONS.filter((mission) => isTerminalMission(mission.status));
  const awaiting = FIXTURE_MISSIONS.filter(
    (mission) => mission.approval?.state === "pending"
  );

  return (
    <>
      <JarvisHeading
        eyebrow="Mission Bay"
        title="Mission Bay"
        sub="Ask for an outcome. Jarvis coordinates the workers, shows its work, and stops for your word before anything leaves the building."
        meta={`${active.length} active · ${awaiting.length} awaiting your word · ${fixtureKindKeys().length} mission kinds`}
        actions={
          <div className="jv-legend">
            {FLEET.members.map((member) => (
              <span key={member.name}>
                <AgentDot slug={member.slug} live={member.slug === "scout"} />
                {member.name}
              </span>
            ))}
          </div>
        }
      />

      <div className="jv-stack" style={{ marginTop: 12 }}>
        <JarvisFixtureNotice />

        <JarvisHud
          kinds={KINDS}
          counts={{ missions: active.length, awaiting: awaiting.length }}
        />

        <div className="jv-cols">
          <div className="jv-stack">
            <JarvisSection title="Missions" meta={`${active.length} active`}>
              {active.length > 0 ? (
                <div className="jv-dock">
                  {active.map((mission) => (
                    <MissionCard key={mission.id} mission={mission} />
                  ))}
                </div>
              ) : (
                <JarvisEmpty title="No missions running" text="Deploy one from the command bar." />
              )}
            </JarvisSection>

            <JarvisSection title="Recently closed" meta={`${closed.length} missions`}>
              <div className="jv-dock">
                {closed.map((mission) => (
                  <MissionCard key={mission.id} mission={mission} />
                ))}
              </div>
            </JarvisSection>
          </div>

          <div className="jv-stack">
            <JarvisSection title={FLEET.name} meta={`${FLEET.members.length} workers`}>
              <div className="jv-team">
                {FLEET.members.map((member) => (
                  <span className="jv-worker" key={member.name}>
                    <AgentDot slug={member.slug} />
                    {member.name}
                    <em>{member.role}</em>
                  </span>
                ))}
              </div>
              <p className="jv-sub" style={{ marginTop: 8 }}>
                Coordinated by JARVIS. Workers stay idle until work is actually
                delegated, so nothing here pretends to be running.
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
              <ol className="jv-feed" style={{ maxHeight: 220 }}>
                {FIXTURE_MISSIONS.flatMap((mission) =>
                  mission.events.slice(-3).map((event) => ({
                    ...feedLine(event, mission),
                    missionId: mission.id,
                  }))
                )
                  .slice(-12)
                  .map((event) => (
                    <li key={`${event.missionId}-${event.id}`}>
                      <b style={{ color: "#a7c4b6" }}>
                        {String(event.agentSlug).toUpperCase()}
                      </b>
                      <span className={event.tone === "err" ? "lbl err" : "lbl"}>
                        {event.text}
                      </span>
                      <span className="ts">{clockOf(event.at)}</span>
                    </li>
                  ))}
              </ol>
            </JarvisSection>
          </div>
        </div>
      </div>
    </>
  );
}
