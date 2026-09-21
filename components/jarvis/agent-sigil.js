import { agentColor } from "@/lib/jarvis-fixtures";

// Agent identity: the reference gives each agent its own colour, and the dock
// feed colours the agent name. Same rule here, at two sizes.
export function AgentDot({ name, live = false, className = "" }) {
  const color = agentColor(name);
  return (
    <span
      className={`jv-dot lg on ${live ? "live" : ""} ${className}`}
      style={{ background: color, color }}
      data-agent={name}
      aria-hidden="true"
    />
  );
}

export function AgentFeedName({ name }) {
  return (
    <b data-agent={name} style={{ color: agentColor(name) }}>
      {name}
    </b>
  );
}

export function AgentSigil({ name, size = 30 }) {
  const color = agentColor(name);
  return (
    <span
      className="sigil"
      style={{ color, background: "rgba(255,255,255,.03)", width: size, height: size }}
      aria-hidden="true"
    >
      {name.slice(0, 2)}
    </span>
  );
}
