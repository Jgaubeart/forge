// Formatting helpers for the Forge interface.
//
// Timestamps render in UTC because these are server components: rendering a
// viewer-local time would need a client component and a hydration round trip.
// The absolute UTC value is attached as a `title` wherever a relative label is
// shown instead.

const dateTimeFormat = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "UTC",
});

const dateFormat = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

export function toDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDateTime(value) {
  const date = toDate(value);
  return date ? dateTimeFormat.format(date) : "—";
}

export function formatDateTimeUtc(value) {
  const date = toDate(value);
  return date ? `${dateTimeFormat.format(date)} UTC` : "";
}

export function formatDate(value) {
  const date = toDate(value);
  return date ? dateFormat.format(date) : "—";
}

export function formatRelative(value, reference = Date.now()) {
  const date = toDate(value);
  if (!date) return null;

  const seconds = Math.round((reference - date.getTime()) / 1000);
  const future = seconds < 0;
  const magnitude = Math.abs(seconds);

  if (magnitude < 45) return future ? "in a moment" : "just now";

  const units = [
    { limit: 3600, step: 60, label: "m" },
    { limit: 86400, step: 3600, label: "h" },
    { limit: 604800, step: 86400, label: "d" },
    { limit: 2629800, step: 604800, label: "w" },
  ];

  for (const unit of units) {
    if (magnitude < unit.limit) {
      const amount = Math.round(magnitude / unit.step);
      return future ? `in ${amount}${unit.label}` : `${amount}${unit.label} ago`;
    }
  }

  return null;
}

// Relative while it is still useful, absolute once it is not.
export function formatWhen(value, reference = Date.now()) {
  return formatRelative(value, reference) ?? formatDateTime(value);
}

export function formatDuration(startValue, endValue) {
  const start = toDate(startValue);
  const end = toDate(endValue);
  if (!start || !end) return null;

  const totalSeconds = Math.max(0, Math.round((end.getTime() - start.getTime()) / 1000));
  if (totalSeconds < 60) return `${totalSeconds}s`;

  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes < 60) return seconds ? `${minutes}m ${seconds}s` : `${minutes}m`;

  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours}h ${remainder}m` : `${hours}h`;
}

// "task.approval_requested" -> "Task approval requested"
export function humanize(value) {
  if (!value) return "Unknown";
  const words = String(value)
    .replace(/[._-]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .trim()
    .toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function truncate(value, max = 120) {
  const text = String(value ?? "");
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

export function shortId(value, length = 8) {
  if (!value) return "—";
  const text = String(value);
  return text.length > length ? `${text.slice(0, length)}…` : text;
}

export function initials(value) {
  const text = String(value ?? "").trim();
  if (!text) return "·";

  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 1) {
    return words[0].slice(0, 2).toUpperCase();
  }

  return `${words[0][0]}${words[words.length - 1][0]}`.toUpperCase();
}

// RLS only lets a viewer read their own profile row, so other people are shown
// as a neutral label instead of a guessed name or a raw user id.
export function actorLabel(actorId, viewerId) {
  if (!actorId) return "System";
  return actorId === viewerId ? "You" : "Workspace member";
}
