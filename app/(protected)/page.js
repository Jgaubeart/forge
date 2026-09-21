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

// Mission Bay, ported from the reference viewer: the mission dock is the centre
// of the screen, the Fleet reads as a team, approvals live inside the mission
// that staged them, and the command bar sits where the reference HUD does.
const KINDS = [
  { key: "fleet", icon: "⚔️", name: "THE FLEET", needsBrief: true },
  { key: "buildapp", icon: "🛠️", name: "BUILD-ME-AN-APP", needsBrief: true },
  { key: "reaper", icon: "💰", name: "SUBSCRIPTION REAPER", needsBrief: false },
  { key: "warroom", icon: "📊", name: "CHANNEL WAR ROOM", needsBrief: false },
  { key: "announce", icon: "📣", name: "ANNOUNCE-IT-EVERYWHERE", needsBrief: true },
  { key: "haters", icon: "🔥", name: "READ-THE-HATERS", needsBrief: false },
];

export default function MissionBayPage() {
  const active = FIXTURE_MISSIONS.filter((mission) =>
    ["running", "awaiting_confirm"].includes(mission.status)
  );
  const closed = FIXTURE_MISSIONS.filter((mission) =>
    ["done", "error", "cancelled"].includes(mission.status)
  );
  const awaiting = FIXTURE_MISSIONS.filter(
    (mission) => mission.status === "awaiting_confirm"
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
                <AgentDot name={member.name} live={member.name === "SCOUT"} />
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
                    <AgentDot name={member.name} />
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
                        <span>expires {mission.approval?.expires}</span>
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
                  mission.events.slice(-3).map((event) => ({ ...event, id: mission.id }))
                )
                  .slice(-12)
                  .map((event) => (
                    <li key={`${event.id}-${event.ts}-${event.label}`}>
                      <b style={{ color: "#a7c4b6" }}>{event.agent}</b>
                      <span className="lbl">{event.label}</span>
                      <span className="ts">{event.ts.slice(11, 16)}</span>
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
