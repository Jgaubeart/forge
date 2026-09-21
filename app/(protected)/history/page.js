import { AgentFeedName } from "@/components/jarvis/agent-sigil";
import { MissionResult } from "@/components/jarvis/results";
import { clockOf, feedLine, statusWord } from "@/components/jarvis/mission-view";
import { JarvisEmpty, JarvisHeading, JarvisSection } from "@/components/jarvis/shell";
import { requireUser } from "@/lib/auth";
import { isTerminalMission } from "@/lib/forge/missions";
import { loadMissionBayState } from "@/lib/forge/persistence/state.js";

// History on durable state: the mission event stream exactly as it was written,
// grouped by mission, with the result each mission produced. Nothing is inferred
// and nothing is regenerated.
export default async function HistoryPage() {
  const user = await requireUser();
  const state = await loadMissionBayState(user.id);

  if (!state.ok) {
    return (
      <>
        <JarvisHeading eyebrow="History" title="What happened" />
        <div className="jv-notice wait" style={{ marginTop: 12 }}>
          <span className="jv-mono">offline</span>
          History needs the Forge database. Nothing is shown while it is unreachable.
        </div>
      </>
    );
  }

  const missions = state.missions;
  const eventCount = missions.reduce((total, mission) => total + mission.events.length, 0);
  const closed = missions.filter((mission) => isTerminalMission(mission.status));
  const live = missions.filter((mission) => !isTerminalMission(mission.status));

  const renderMission = (mission) => (
    <JarvisSection
      key={mission.id}
      title={mission.title}
      meta={`${statusWord(mission.status)} · ${mission.events.length} events`}
    >
      {mission.events.length > 0 ? (
        <ol className="jv-feed" style={{ maxHeight: "none" }}>
          {mission.events.map((event) => {
            const line = feedLine(event, mission);
            return (
              <li key={`${mission.id}-${event.id}`}>
                <AgentFeedName slug={line.agentSlug} />
                <span className={line.tone === "err" ? "lbl err" : ""}>{line.text}</span>
                <span className="ts">{clockOf(line.at)}</span>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="jv-sub">No events recorded for this mission yet.</p>
      )}

      {mission.result ? (
        <div className="jv-receipt" open>
          <div className="jv-eyebrow" style={{ marginBottom: 8 }}>
            Result
          </div>
          <MissionResult result={mission.result} />
        </div>
      ) : null}
    </JarvisSection>
  );

  return (
    <>
      <JarvisHeading
        eyebrow="History"
        title="What happened"
        sub="Every mission keeps its own timeline and its result. Nothing is rewritten after the fact."
        meta={
          state.membership?.workspace
            ? `${state.membership.workspace.name} · ${missions.length} missions · ${eventCount} events`
            : "No workspace yet"
        }
      />

      <div className="jv-stack" style={{ marginTop: 12 }}>
        {missions.length === 0 ? (
          <JarvisEmpty
            title="Nothing recorded yet"
            text="Missions dispatched from Mission Bay appear here with their events and results."
          />
        ) : (
          <>
            {live.length > 0 ? live.map(renderMission) : null}
            {closed.length > 0 ? closed.map(renderMission) : null}
          </>
        )}
      </div>
    </>
  );
}
