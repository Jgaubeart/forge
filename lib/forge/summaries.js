// Redaction-safe summaries.
//
// Forge stores task inputs, approval payloads, and audit metadata as jsonb.
// Those records can contain tokens, message bodies, or credentials, so the
// interface never dumps them verbatim: values are summarized by shape, sensitive
// keys are always masked, and every string is truncated.

import { truncate } from "./format.js";

const SENSITIVE_KEY =
  /(password|passphrase|secret|token|api[_-]?key|authorization|credential|bearer|cookie|session|signature|private[_-]?key|client[_-]?secret|refresh[_-]?token)/i;

const TITLE_KEYS = [
  "title",
  "summary",
  "subject",
  "name",
  "prompt",
  "instruction",
  "instructions",
  "text",
  "query",
  "message",
  "description",
  "goal",
];

const REDACTED = "•••• (hidden)";

export function isSensitiveKey(key) {
  return SENSITIVE_KEY.test(String(key ?? ""));
}

export function describeValue(value, max = 140) {
  if (value === null) return "null";
  if (value === undefined) return "—";

  if (typeof value === "string") {
    const collapsed = value.replace(/\s+/g, " ").trim();
    return collapsed ? truncate(collapsed, max) : '""';
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if (Array.isArray(value)) {
    return `[${value.length} item${value.length === 1 ? "" : "s"}]`;
  }

  if (typeof value === "object") {
    const count = Object.keys(value).length;
    return `{${count} field${count === 1 ? "" : "s"}}`;
  }

  return "—";
}

// Top-level fields of a jsonb record, masked and truncated.
export function summarizeFields(record, { max = 6, maxLength = 140 } = {}) {
  if (!record || typeof record !== "object" || Array.isArray(record)) {
    return [];
  }

  const entries = Object.entries(record).filter(([, value]) => value !== undefined);

  return entries.slice(0, max).map(([key, value]) => ({
    key,
    redacted: isSensitiveKey(key),
    value: isSensitiveKey(key) ? REDACTED : describeValue(value, maxLength),
  }));
}

export function hiddenFieldCount(record, max = 6) {
  if (!record || typeof record !== "object" || Array.isArray(record)) return 0;
  const count = Object.entries(record).filter(([, value]) => value !== undefined).length;
  return Math.max(0, count - max);
}

// A single line suitable for a table cell or list row.
export function summarizeRecordLine(record, { max = 3 } = {}) {
  const fields = summarizeFields(record, { max });
  if (fields.length === 0) return null;
  return fields.map((field) => `${field.key}: ${field.value}`).join(" · ");
}

export function summarizePayloadLines(record, { max = 6 } = {}) {
  const fields = summarizeFields(record, { max });
  if (fields.length === 0) return [];

  const lines = fields.map((field) => `${field.key}: ${field.value}`);
  const remaining = hiddenFieldCount(record, max);
  if (remaining > 0) {
    lines.push(`+${remaining} more field${remaining === 1 ? "" : "s"}`);
  }
  return lines;
}

// Task inputs vary by agent, so the interface derives a readable title from the
// most title-like field and falls back to whatever scalar it can find.
export function taskTitle(input, fallback = "Untitled task") {
  if (typeof input === "string" && input.trim()) {
    return truncate(input.replace(/\s+/g, " ").trim(), 96);
  }

  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return fallback;
  }

  for (const key of TITLE_KEYS) {
    const value = input[key];
    if (typeof value === "string" && value.trim()) {
      return truncate(value.replace(/\s+/g, " ").trim(), 96);
    }
  }

  for (const value of Object.values(input)) {
    if (typeof value === "string" && value.trim()) {
      return truncate(value.replace(/\s+/g, " ").trim(), 96);
    }
  }

  return fallback;
}
