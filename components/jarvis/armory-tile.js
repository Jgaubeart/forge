// Tool Armory tile, ported from viewer/tools.js: logo chip, name, status pill,
// blurb, and an action/meta row. Unavailable tools stay visibly unavailable.
import { ARMORY_STATUS } from "@/lib/jarvis-fixtures";

export function ArmoryTile({ tool }) {
  const status = ARMORY_STATUS[tool.status] ?? ARMORY_STATUS.available;

  return (
    <article className="jv-tile" data-status={tool.status}>
      <div className="jv-tile-head">
        <span className="logo" aria-hidden="true">
          {tool.slug.slice(0, 2).toUpperCase()}
        </span>
        <span className="jv-tile-pill">
          {tool.status === "unavailable" ? "not implemented" : status.label}
        </span>
      </div>

      <div style={{ marginTop: 9 }}>
        <div className="jv-tile-name">{tool.name}</div>
        <div className="slug">
          {tool.provider} · {tool.id}
        </div>
      </div>

      <p className="blurb">{tool.blurb}</p>

      <div className="jv-tile-meta">
        <span className="lvl">{tool.level.toUpperCase()}</span>
        <span>{tool.review}</span>
        {tool.connection ? <span>{tool.connection}</span> : <span>no connection</span>}
        {tool.unknown ? <span>remote · always reviewed</span> : null}
        {tool.demo ? <span>demo state</span> : null}
      </div>
    </article>
  );
}
