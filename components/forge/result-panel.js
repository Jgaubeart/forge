// Per-kind mission result rendering, ported from the reference build: the fleet
// shows its three sections, the reaper shows the ledger, the war room shows
// stats, announce shows the drafts, haters shows the reply drafts, and the app
// builder points at what it produced.
//
// Values are already sanitized by the query layer; nothing here can print a
// credential, and nothing claims a provider action happened without a receipt.

import { Dot } from "./ui";

export function MissionResult({ mission, receipts = [] }) {
  const result = mission.result ?? {};
  const kind = mission.kind;

  if (!result || Object.keys(result).length === 0) return null;

  if (kind === "fleet") {
    const sections = result.sections ?? {};
    return (
      <div className="forge-result">
        {result.summary ? <p className="forge-result-lead">{result.summary}</p> : null}
        {[
          ["scout", "⚔️ SCOUT — recon"],
          ["forge", "🔨 FORGE — the draft"],
          ["sage", "🧠 SAGE — critique and next actions"],
        ].map(([key, heading]) => (
          <section key={key} className="forge-result-section">
            <h3 className="forge-eyebrow">{heading}</h3>
            <p className="forge-prose">{sections[key] || "_(no output)_"}</p>
          </section>
        ))}
      </div>
    );
  }

  if (kind === "reaper") {
    const subs = Array.isArray(result.subs) ? result.subs : [];
    return (
      <div className="forge-result">
        <p className="forge-result-lead">
          {subs.length} subscriptions · {money(result.total_monthly)} /mo
        </p>
        <div className="forge-rows">
          {subs.map((sub) => (
            <div className="forge-row" key={String(sub.name)}>
              <span className="forge-row-main">
                <span className="forge-row-title">
                  {sub.name}
                  {sub.cadence === "annual" ? " (annual)" : ""}
                </span>
                <span className="forge-row-meta">
                  {sub.last_seen ? <span>last seen {sub.last_seen}</span> : null}
                  {sub.note ? <span>{sub.note}</span> : null}
                </span>
              </span>
              <span className="forge-row-end">
                <span className="forge-row-time">{money(sub.amount_monthly)}</span>
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (kind === "warroom") {
    const stats = result.stats ?? {};
    return (
      <div className="forge-result">
        {result.headline ? <p className="forge-result-lead">{result.headline}</p> : null}
        <div className="forge-metrics">
          {[
            ["views 24h", stats.views_24h],
            ["vs median", stats.median_delta],
            ["subs", stats.subs],
            ["watch hrs", stats.watch_hours],
          ].map(([label, value]) => (
            <div className="forge-metric" key={label}>
              <div className="forge-metric-value">{String(value ?? "—")}</div>
              <div className="forge-metric-label">{label}</div>
            </div>
          ))}
        </div>
        {(result.videos ?? []).slice(0, 3).map((video, index) => (
          <div className="forge-row" key={`video-${index}`}>
            <span className="forge-row-main">
              <span className="forge-row-title">{video.title}</span>
              <span className="forge-row-meta">{video.published}</span>
            </span>
            <span className="forge-row-end">
              <span className="forge-row-time">{String(video.views ?? "")}</span>
            </span>
          </div>
        ))}
        {(result.comments ?? []).slice(0, 3).map((comment, index) => (
          <div className="forge-comment" key={`comment-${index}`}>
            <div className="forge-comment-author">
              {comment.author ?? "someone"}
              {comment.likes ? ` · ${comment.likes} likes` : ""}
            </div>
            <div className="forge-comment-body">{comment.text}</div>
          </div>
        ))}
      </div>
    );
  }

  if (kind === "announce") {
    const posts = Array.isArray(result.posts) ? result.posts : [];
    const publishReceipts = receipts.filter(
      (receipt) => receipt.tool === "social.publish_post"
    );
    return (
      <div className="forge-result">
        <p className="forge-result-lead">
          {posts.length} drafts staged. Nothing publishes without your approval.
        </p>
        {posts.map((post, index) => (
          <div className="forge-post" key={`post-${index}`}>
            <div className="forge-post-head">
              <span>{post.platform}</span>
              {receiptMark(post, publishReceipts)}
            </div>
            <p className="forge-post-text">{post.text}</p>
          </div>
        ))}
      </div>
    );
  }

  if (kind === "haters") {
    const items = Array.isArray(result.items) ? result.items : [];
    const replyReceipts = receipts.filter((receipt) => receipt.tool === "comments.reply");
    return (
      <div className="forge-result">
        {result.read ? <p className="forge-result-lead">{result.read}</p> : null}
        {items.map((item, index) => (
          <div className="forge-comment" key={`item-${index}`}>
            <div className="forge-comment-author">
              {item.author ?? "someone"}
              {item.likes ? ` · ${item.likes} likes` : ""}
              {replyMark(item, replyReceipts)}
            </div>
            <div className="forge-comment-body">{item.comment}</div>
            <div className="forge-comment-reply">{item.reply}</div>
          </div>
        ))}
      </div>
    );
  }

  if (kind === "buildapp") {
    return (
      <div className="forge-result">
        {result.note ? <p className="forge-result-lead">{result.note}</p> : null}
        {result.url ? (
          <p className="forge-meta-faint">
            Artifact reference: <span className="forge-mono">{result.url}</span>
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="forge-result">
      {result.summary ? <p className="forge-result-lead">{result.summary}</p> : null}
    </div>
  );
}

function money(value) {
  const amount = Number(value);
  return Number.isFinite(amount) ? `$${amount.toFixed(2)}` : "—";
}

// A tick means a receipt exists for that exact target, never that the model said
// it worked.
function receiptMark(post, receipts) {
  const match = receipts.find(
    (receipt) => String(receipt.inputSummary ?? "").includes(String(post.platform))
  );
  if (!match) return null;
  return (
    <span className="forge-receipt-mark">
      <Dot tone={match.success ? "accent" : "danger"} />
      {match.confirmation === "confirmed" ? "confirmed" : "accepted"}
    </span>
  );
}

function replyMark(item, receipts) {
  if (!item.comment_id) return null;
  const match = receipts.find(
    (receipt) => String(receipt.inputSummary ?? "").includes(String(item.comment_id))
  );
  if (!match) return null;
  return (
    <span className="forge-receipt-mark">
      <Dot tone={match.success ? "accent" : "danger"} />
      {match.confirmation === "confirmed" ? "confirmed" : "accepted by tool"}
    </span>
  );
}
