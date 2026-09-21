// Structured result rendering, ported from the reference viewer's renderResult /
// renderReaper / renderWarroom / renderAnnounce / renderHaters helpers.
//
// Each mission kind has its own presentation, and none of them dump raw JSON.

import { AgentDot } from "./agent-sigil";

export function MissionResult({ mission }) {
  const result = mission.result;
  if (!result) return null;

  if (result.kind === "fleet") {
    return (
      <div className="jv-result">
        {result.summary ? <p className="lead">{result.summary}</p> : null}
        {[
          ["scout", "⚔️ SCOUT — recon"],
          ["forge", "🔨 FORGE — the draft"],
          ["sage", "🧠 SAGE — critique & next actions"],
        ].map(([key, heading]) => (
          <section key={key}>
            <div className="jv-eyebrow">{heading}</div>
            <p className="prose">{result.sections?.[key] ?? "_(no output)_"}</p>
          </section>
        ))}
      </div>
    );
  }

  if (result.kind === "reaper") {
    return (
      <div className="jv-result">
        <p className="lead">
          {result.subs.length} subscriptions · ${Number(result.total_monthly).toFixed(2)} /mo
        </p>
        {(result.subs ?? []).map((sub) => (
          <div className="jv-row" key={sub.name}>
            <span className="main">
              <span className="t">
                {sub.name}
                {sub.cadence === "annual" ? " (annual)" : ""}
              </span>
              <span className="m">
                <span>last seen {sub.last_seen}</span>
                {sub.note ? <span>{sub.note}</span> : null}
              </span>
            </span>
            <span className="end jv-mono">${Number(sub.amount_monthly).toFixed(2)}</span>
          </div>
        ))}
      </div>
    );
  }

  if (result.kind === "warroom") {
    const stats = result.stats ?? {};
    return (
      <div className="jv-result">
        <p className="lead">{result.headline}</p>
        <div className="jv-stats">
          {[
            ["views 24h", stats.views_24h],
            ["vs median", stats.median_delta],
            ["subs", stats.subs],
            ["watch hrs", stats.watch_hours],
          ].map(([label, value]) => (
            <div className="jv-stat" key={label}>
              <b>{String(value ?? "—")}</b>
              <i>{label}</i>
            </div>
          ))}
        </div>
        {(result.videos ?? []).map((video) => (
          <div className="jv-row" key={video.title}>
            <span className="main">
              <span className="t">{video.title}</span>
              <span className="m">{video.published}</span>
            </span>
            <span className="end jv-mono">{video.views}</span>
          </div>
        ))}
        {(result.comments ?? []).map((comment) => (
          <div className="jv-comment" key={comment.author}>
            <div className="au">
              {comment.author}
              {comment.likes ? ` · ${comment.likes} likes` : ""}
            </div>
            <div className="cm">{comment.text}</div>
          </div>
        ))}
      </div>
    );
  }

  if (result.kind === "announce") {
    return (
      <div className="jv-result">
        <p className="lead">
          {(result.posts ?? []).length} drafts staged. Nothing posts without your word.
        </p>
        {(result.posts ?? []).map((post) => (
          <div className="jv-post" key={post.platform}>
            <div className="p">
              <span>{post.platform}</span>
              <span className="jv-mono">draft</span>
            </div>
            <div className="tx">{post.text}</div>
          </div>
        ))}
      </div>
    );
  }

  if (result.kind === "haters") {
    return (
      <div className="jv-result">
        {(result.items ?? []).map((item) => (
          <div className="jv-comment" key={item.comment_id ?? item.comment}>
            <div className="au">
              {item.author}
              {item.likes ? ` · ${item.likes} likes` : ""}
            </div>
            <div className="cm">{item.comment}</div>
            <div className="rp">{item.reply}</div>
          </div>
        ))}
      </div>
    );
  }

  if (result.kind === "buildapp" || result.kind === "artifact") {
    return (
      <div className="jv-result">
        <p className="lead">{result.note ?? result.summary}</p>
        {result.files?.length ? (
          <div className="m jv-mono">artifact: {result.files.join(", ")}</div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="jv-result">
      {result.summary ? <p className="lead">{result.summary}</p> : null}
    </div>
  );
}

export function WorkerRow({ worker }) {
  return (
    <span className="jv-worker">
      <AgentDot name={worker.name} live={worker.state === "active"} />
      {worker.name}
      <em>{worker.role}</em>
    </span>
  );
}
