// Structured result contracts.
//
// One contract per mission result type, ported from the reference build's
// renderResult/renderReaper/renderWarroom/renderAnnounce/renderHaters helpers and
// the JSON shapes its prompts demand.
//
// Validation is explicit and small rather than a framework. Anything malformed
// fails validation, and the UI renders a safe fallback instead of crashing.

export const RESULT_TYPES = Object.freeze([
  "fleet",
  "build",
  "reaper",
  "warroom",
  "announce",
  "haters",
]);

export const MALFORMED_RESULT = Object.freeze({
  kind: "malformed",
  note: "This result could not be read safely, so nothing is shown from it.",
});

const isString = (value) => typeof value === "string" && value.trim().length > 0;
const isNumber = (value) => typeof value === "number" && Number.isFinite(value);
const asArray = (value) => (Array.isArray(value) ? value : null);
const asString = (value, max = 4000) => (isString(value) ? value.slice(0, max) : null);
const asNumber = (value) => {
  if (isNumber(value)) return value;
  if (typeof value === "string" && value.trim() !== "" && !Number.isNaN(Number(value))) {
    return Number(value);
  }
  return null;
};

function fail(errors) {
  return { ok: false, value: null, errors };
}

// ---------------------------------------------------------------- fleet ------

export function validateFleetResult(raw) {
  if (!raw || typeof raw !== "object") return fail(["fleet result must be an object"]);

  const sections = raw.sections ?? {};
  const normalized = {};
  const errors = [];

  for (const key of ["scout", "forge", "sage"]) {
    const section = asString(sections[key]);
    if (section) normalized[key] = section;
  }

  const missing = asArray(raw.missing)?.map(String) ?? [];
  const failed = asArray(raw.failed) ?? [];

  if (Object.keys(normalized).length === 0 && failed.length === 0 && missing.length === 0) {
    errors.push("fleet result has no worker contributions, failures, or missing list");
  }

  if (errors.length > 0) return fail(errors);

  return {
    ok: true,
    errors: [],
    value: {
      kind: "fleet",
      summary: asString(raw.summary, 400),
      sections: normalized,
      missing,
      failed: failed.map((entry) => ({
        worker: String(entry?.worker ?? entry?.slug ?? "worker"),
        reason: asString(entry?.reason, 200) ?? "no output",
      })),
      assembled: raw.assembled
        ? { summary: asString(raw.assembled.summary, 800) ?? null }
        : null,
    },
  };
}

// ----------------------------------------------------------------- build -----

export function validateBuildResult(raw) {
  if (!raw || typeof raw !== "object") return fail(["build result must be an object"]);

  const summary = asString(raw.summary) ?? asString(raw.note);
  if (!summary) return fail(["build result needs a summary"]);

  return {
    ok: true,
    errors: [],
    value: {
      kind: "build",
      summary: summary.slice(0, 400),
      note: asString(raw.note, 400),
      artifact: raw.artifact
        ? {
            type: asString(raw.artifact.type, 40) ?? "deliverable",
            title: asString(raw.artifact.title, 200) ?? null,
            content: asString(raw.artifact.content, 20000),
          }
        : null,
      files: asArray(raw.files)?.map((file) => String(file).slice(0, 200)) ?? [],
    },
  };
}

// ---------------------------------------------------------------- reaper -----

export function validateReaperResult(raw) {
  if (!raw || typeof raw !== "object") return fail(["reaper result must be an object"]);

  const subs = asArray(raw.subs);
  if (!subs) return fail(["reaper result needs a subscriptions array"]);

  const normalized = [];
  for (const sub of subs) {
    const name = asString(sub?.name, 60);
    const amount = asNumber(sub?.amount_monthly);
    if (!name || amount === null) {
      return fail(["every subscription needs a name and a monthly amount"]);
    }
    normalized.push({
      name,
      amount_monthly: amount,
      cadence: sub.cadence === "annual" ? "annual" : "monthly",
      last_seen: asString(sub.last_seen, 12) ?? null,
      note: asString(sub.note, 200) ?? null,
    });
  }

  const total =
    asNumber(raw.total_monthly) ??
    Number(normalized.reduce((sum, sub) => sum + sub.amount_monthly, 0).toFixed(2));

  return {
    ok: true,
    errors: [],
    value: {
      kind: "reaper",
      subs: normalized,
      total_monthly: total,
      summary: asString(raw.summary, 400) ?? null,
    },
  };
}

// --------------------------------------------------------------- warroom -----

export function validateWarroomResult(raw) {
  if (!raw || typeof raw !== "object") return fail(["warroom result must be an object"]);

  const headline = asString(raw.headline, 160);
  if (!headline) return fail(["warroom result needs a headline"]);

  const stats = raw.stats && typeof raw.stats === "object" ? raw.stats : {};

  return {
    ok: true,
    errors: [],
    value: {
      kind: "warroom",
      headline,
      stats: {
        views_24h: asNumber(stats.views_24h) ?? null,
        median_delta: asString(stats.median_delta, 40) ?? null,
        subs: asNumber(stats.subs) ?? null,
        watch_hours: asNumber(stats.watch_hours) ?? null,
      },
      videos: (asArray(raw.videos) ?? []).map((video) => ({
        title: asString(video?.title, 200) ?? "untitled",
        views: asNumber(video?.views) ?? null,
        published: asString(video?.published, 40) ?? null,
      })),
      comments: (asArray(raw.comments) ?? []).map((comment) => ({
        author: asString(comment?.author, 60) ?? "someone",
        text: asString(comment?.text, 600) ?? "",
        likes: asNumber(comment?.likes) ?? null,
      })),
      read: asString(raw.read, 400) ?? null,
    },
  };
}

// --------------------------------------------------------------- announce ----

// A post may only claim more than "draft" when a provider receipt exists.
export function validateAnnounceResult(raw) {
  if (!raw || typeof raw !== "object") return fail(["announce result must be an object"]);

  const posts = asArray(raw.posts);
  if (!posts) return fail(["announce result needs a posts array"]);

  const normalized = [];
  for (const post of posts) {
    const platform = asString(post?.platform, 40);
    const text = asString(post?.text, 2200);
    if (!platform || !text) return fail(["every post needs a platform and text"]);

    const receiptId = asString(post?.receiptId, 120);
    const claimed = asString(post?.state, 20) ?? "draft";
    const state = receiptId ? claimed : "draft";

    normalized.push({ platform, text, state, receiptId });
  }

  return {
    ok: true,
    errors: [],
    value: {
      kind: "announce",
      posts: normalized,
      summary: asString(raw.summary, 400) ?? null,
    },
  };
}

// ----------------------------------------------------------------- haters ----

export function validateHatersResult(raw) {
  if (!raw || typeof raw !== "object") return fail(["haters result must be an object"]);

  const items = asArray(raw.items);
  if (!items) return fail(["haters result needs an items array"]);

  const normalized = [];
  for (const item of items) {
    const comment = asString(item?.comment, 600);
    const reply = asString(item?.reply, 600);
    if (!comment || !reply) return fail(["every comment needs text and a drafted reply"]);

    const receiptId = asString(item?.receiptId, 120);
    const claimed = asString(item?.replyState, 20) ?? "draft";

    normalized.push({
      author: asString(item?.author, 60) ?? "someone",
      comment,
      comment_id: asString(item?.comment_id, 200) ?? null,
      video_id: asString(item?.video_id, 200) ?? null,
      likes: asNumber(item?.likes) ?? null,
      reply,
      replyState: receiptId ? claimed : "draft",
      receiptId,
    });
  }

  return {
    ok: true,
    errors: [],
    value: {
      kind: "haters",
      items: normalized,
      read: asString(raw.read, 400) ?? null,
    },
  };
}

const VALIDATORS = Object.freeze({
  fleet: validateFleetResult,
  build: validateBuildResult,
  reaper: validateReaperResult,
  warroom: validateWarroomResult,
  announce: validateAnnounceResult,
  haters: validateHatersResult,
});

export function validateResult(type, raw) {
  const validator = VALIDATORS[String(type ?? "")];
  if (!validator) return fail([`unknown result type: ${type}`]);
  return validator(raw);
}

// The only entry point the UI uses: it either gets a validated contract or the
// safe fallback, and never a partially-shaped object.
export function normalizeResult(type, raw) {
  const result = validateResult(type, raw);
  return result.ok ? result.value : MALFORMED_RESULT;
}

export function isResultType(type) {
  return RESULT_TYPES.includes(String(type ?? ""));
}
