import { AgentDot, AgentSigil } from "@/components/jarvis/agent-sigil";
import { JarvisHeading, JarvisSection } from "@/components/jarvis/shell";
import {
  AGENTS,
  FLEET,
  FLEET_BEHAVIOR_CONTRACT,
  WORKFORCE_STATE,
  agentsByDepartment,
  agentsForMissionKind,
} from "@/lib/forge/agents";
import { getForgePersistence } from "@/lib/forge/persistence";

// The workforce, rendered from the real catalog.
//
// Primary view: who each agent is, what it does, and what state its capabilities
// are actually in. The full system instructions stay secondary — available under
// a disclosure for inspection, never the headline.

function stateLabel(state) {
  switch (state) {
    case "defined":
      return { text: "defined", tone: "accent" };
    case "fixture-only":
      return { text: "fixture-only", tone: "wait" };
    case "not-connected":
      return { text: "not connected", tone: "wait" };
    case "future":
      return { text: "future", tone: "" };
    default:
      return { text: state, tone: "" };
  }
}

export default async function FleetPage() {
  const departments = [...agentsByDepartment().entries()];

  // Durable state (does the row exist, is it active, may it delegate) is shown
  // separately. The catalog stays the source of identity and behaviour.
  let durable = [];
  try {
    const persistence = await getForgePersistence();
    durable = await persistence.agents.listDurable();
  } catch {
    durable = [];
  }

  return (
    <>
      <JarvisHeading
        eyebrow="Fleet"
        title="The workforce"
        sub="Shared agents with their roles, ceilings, and honest capability state. The Fleet is the three-agent team JARVIS deploys for open-ended work."
        meta={`${AGENTS.length} agents · ${departments.length} departments · runtime ${WORKFORCE_STATE.runtimeState}`}
      />

      <div className="jv-stack" style={{ marginTop: 12 }}>
        <div className="jv-notice wait">
          <span className="jv-mono">state</span>
          {WORKFORCE_STATE.note}
        </div>

        <JarvisSection
          title={FLEET.name}
          meta={`${FLEET.members.length} workers · led by ${FLEET.lead.toUpperCase()}`}
        >
          <div className="jv-team">
            <span className="jv-worker">
              <AgentDot slug={FLEET.lead} />
              {FLEET.lead.toUpperCase()}
              <em>coordinator</em>
            </span>
            {FLEET.members.map((member) => (
              <span className="jv-worker" key={member.slug}>
                <AgentDot slug={member.slug} />
                {member.slug.toUpperCase()}
                <em>{member.role}</em>
              </span>
            ))}
          </div>
          <p className="jv-sub" style={{ marginTop: 8 }}>
            {FLEET.description} {FLEET.capabilityNote}
          </p>
          <details className="jv-receipt">
            <summary>Fleet behaviour contract</summary>
            <ol className="jv-feed" style={{ maxHeight: "none" }}>
              {FLEET_BEHAVIOR_CONTRACT.steps.map((step) => (
                <li key={step}>
                  <span className="lbl">{step}</span>
                </li>
              ))}
            </ol>
            <p className="jv-sub" style={{ marginTop: 6 }}>
              {FLEET_BEHAVIOR_CONTRACT.rules[0]} {FLEET_BEHAVIOR_CONTRACT.rules[2]}
            </p>
          </details>
        </JarvisSection>

        {departments.map(([department, agents]) => (
          <JarvisSection key={department} title={department} meta={agents.length}>
            <div className="jv-agents">
              {agents.map((agent) => {
                const state = stateLabel(agent.capabilityState);

                return (
                  <article className="jv-agent" key={agent.slug} data-agent={agent.name}>
                    <AgentSigil slug={agent.slug} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ color: "#f1f5f9", fontWeight: 600 }}>
                          {agent.name}
                        </span>
                        <span className="jv-pill">{agent.role}</span>
                        <span className={`jv-pill ${state.tone}`}>{state.text}</span>
                      </div>

                      <div className="jv-sub" style={{ marginTop: 3 }}>
                        {agent.summary}
                      </div>

                      <div className="jv-meta" style={{ marginTop: 6 }}>
                        max {agent.actionCeiling.toUpperCase()} ·{" "}
                        {agent.delegationAllowed ? "may delegate" : "no delegation"} ·
                        missions: {agent.missionKinds.join(", ")}
                      </div>

                      <div className="jv-meta" style={{ marginTop: 2 }}>
                        needs {agent.capabilities.required.join(", ")}
                        {agent.capabilities.optional.length > 0
                          ? ` · optional ${agent.capabilities.optional.join(", ")}`
                          : ""}
                      </div>

                      <div className="jv-sub" style={{ marginTop: 5 }}>
                        {agent.capabilityNote}
                      </div>

                      <details className="jv-receipt">
                        <summary>System instructions</summary>
                        <p className="jv-prose">{agent.instructions}</p>
                      </details>
                    </div>
                  </article>
                );
              })}
            </div>
          </JarvisSection>
        ))}

        <JarvisSection title="Mission routing" meta="declarative">
          <ol className="jv-feed" style={{ maxHeight: "none" }}>
            {[
              ["general", "jarvis"],
              ["fleet", "the-fleet"],
              ["buildapp", "forge"],
              ["reaper", "reaper"],
              ["warroom", "warroom"],
              ["announce", "herald"],
              ["haters", "haters"],
            ].map(([kind, target]) => (
              <li key={kind}>
                <b style={{ color: "#a7c4b6" }}>{kind}</b>
                <span className="lbl">
                  {target === "the-fleet"
                    ? FLEET.name
                    : agentsForMissionKind(kind)
                        .map((agent) => agent.name)
                        .join(" + ") || target.toUpperCase()}
                </span>
              </li>
            ))}
          </ol>
          <p className="jv-sub" style={{ marginTop: 8 }}>
            Declarative defaults only — no AI routing yet. JARVIS may choose a
            subset of the Fleet later, and the canonical order stays SCOUT →
            FORGE → SAGE.
          </p>
        </JarvisSection>

        <JarvisSection
          title="Durable agent state"
          meta={`${durable.length} rows`}
          action={
            <span className="jv-meta">
              migration 004 seeds the built-in slugs
            </span>
          }
        >
          {durable.length > 0 ? (
            <ol className="jv-feed" style={{ maxHeight: "none" }}>
              {durable.map((row) => (
                <li key={row.id}>
                  <b style={{ color: "#a7c4b6" }}>{row.slug}</b>
                  <span className="lbl">
                    {row.name}
                    {row.isBuiltIn ? " · built-in" : " · workspace agent"}
                    {row.isActive ? "" : " · inactive"}
                    {row.delegationAllowed ? " · may delegate" : ""}
                  </span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="jv-sub">
              No agent rows are readable yet. The catalog above is the canonical
              definition; the database rows exist so missions can hold durable
              references to a lead agent.
            </p>
          )}
        </JarvisSection>
      </div>
    </>
  );
}
