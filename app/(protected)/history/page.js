import { AgentFeedName } from "@/components/jarvis/agent-sigil";
import { MissionResult } from "@/components/jarvis/results";
import {
  JarvisEmpty,
  JarvisFixtureNotice,
  JarvisHeading,
  JarvisSection,
} from "@/components/jarvis/shell";
import { FIXTURE_MISSIONS } from "@/lib/jarvis-fixtures";

// History: the same mission feed, in chronological order, with the results that
// were produced. Fixture data in this phase.
export default function HistoryPage() {
  const closed = FIXTURE_MISSIONS.filter((mission) =>
    ["done", "error", "cancelled"].includes(mission.status)
  );
  const eventCount = FIXTURE_MISSIONS.reduce(
    (total, mission) => total + mission.events.length,
    0
  );

  return (
    <>
      <JarvisHeading
        eyebrow="History"
        title="What happened"
        sub="Every mission keeps its own timeline and its result. Nothing is rewritten after the fact."
        meta={`${FIXTURE_MISSIONS.length} missions · ${eventCount} events`}
      />

      <div className="jv-stack" style={{ marginTop: 12 }}>
        <JarvisFixtureNotice />

        {closed.length > 0 ? (
          closed.map((mission) => (
            <JarvisSection
              key={mission.id}
              title={mission.title}
              meta={`${mission.statusLabel} · ${mission.events.length} events`}
            >
              <ol className="jv-feed" style={{ maxHeight: "none" }}>
                {mission.events.map((event) => (
                  <li key={`${event.ts}-${event.label}`}>
                    <AgentFeedName slug={event.agentSlug} />
                    <span className={event.kind === "error" ? "lbl err" : "lbl"}>
                      {event.label}
                    </span>
                    <span className="ts">{event.ts.slice(11, 16)}</span>
                  </li>
                ))}
              </ol>
              {mission.result ? (
                <div className="jv-receipt" open>
                  <div className="jv-eyebrow" style={{ marginBottom: 8 }}>
                    Result
                  </div>
                  <MissionResult mission={mission} />
                </div>
              ) : null}
            </JarvisSection>
          ))
        ) : (
          <JarvisEmpty title="Nothing closed yet" />
        )}
      </div>
    </>
  );
}
