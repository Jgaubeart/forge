import { AgentDot, AgentSigil } from "@/components/jarvis/agent-sigil";
import {
  JarvisFixtureNotice,
  JarvisHeading,
  JarvisSection,
} from "@/components/jarvis/shell";
import { AGENTS, FLEET } from "@/lib/jarvis-fixtures";

// Fleet identity, ported from the reference: each agent keeps its colour and
// reads as a worker with a role, not as a directory card.
export default function FleetPage() {
  return (
    <>
      <JarvisHeading
        eyebrow="Fleet"
        title="The workforce"
        sub="Shared agents with their capabilities and ceilings. The Fleet is the three-agent team the coordinator deploys for research, making, and critique."
        meta={`${AGENTS.length} agents · fleet: ${FLEET.members.map((m) => m.name).join(" + ")}`}
      />

      <div className="jv-stack" style={{ marginTop: 12 }}>
        <JarvisFixtureNotice />

        <JarvisSection
          title={FLEET.name}
          meta={`${FLEET.members.length} workers · led by ${FLEET.coordinator}`}
        >
          <div className="jv-team">
            <span className="jv-worker">
              <AgentDot name={FLEET.coordinator} />
              {FLEET.coordinator}
              <em>coordinator</em>
            </span>
            {FLEET.members.map((member) => (
              <span className="jv-worker" key={member.name}>
                <AgentDot name={member.name} />
                {member.name}
                <em>{member.role}</em>
              </span>
            ))}
          </div>
        </JarvisSection>

        <JarvisSection title="Agents" meta={AGENTS.length}>
          <div className="jv-agents">
            {AGENTS.map((agent) => (
              <article className="jv-agent" key={agent.id} data-agent={agent.name}>
                <AgentSigil name={agent.name} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ color: "#f1f5f9", fontWeight: 600 }}>
                      {agent.name}
                    </span>
                    <span className="jv-pill">{agent.role}</span>
                  </div>
                  <div className="jv-sub" style={{ marginTop: 2 }}>
                    {agent.summary}
                  </div>
                  <div className="jv-meta" style={{ marginTop: 5 }}>
                    {agent.capability} · max {agent.level.toUpperCase()} ·{" "}
                    {agent.delegation ? "delegates to subagents" : "no delegation"}
                  </div>
                </div>
              </article>
            ))}
          </div>
        </JarvisSection>
      </div>
    </>
  );
}
