import { agentColor } from "@/lib/forge/agents";

// Agent identity: the reference gives each agent its own colour, and the dock
// feed colours the agent name. Same rule here, at two sizes.
export function AgentDot({ slug = null, name = null, live = false, className = "" }) {
  const key = slug ?? name;
  const color = agentColor(key);
  return (
    <span
      className={`jv-dot lg on ${live ? "live" : ""} ${className}`}
      style={{ background: color, color }}
      data-agent={String(key).toUpperCase()}
      aria-hidden="true"
    />
  );
}

export function AgentFeedName({ slug = null, name = null }) {
  const key = slug ?? name;
  return (
    <b data-agent={String(key).toUpperCase()} style={{ color: agentColor(key) }}>
      {String(key).toUpperCase()}
    </b>
  );
}

export function AgentSigil({ slug = null, name = null, size = 30 }) {
  const key = slug ?? name;
  const label = String(key).toUpperCase();
  const color = agentColor(key);
  return (
    <span
      className="sigil"
      style={{ color, background: "rgba(255,255,255,.03)", width: size, height: size }}
      aria-hidden="true"
    >
      {label.slice(0, 2)}
    </span>
  );
}
