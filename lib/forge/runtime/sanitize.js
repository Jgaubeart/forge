// Sanitization for anything the runtime persists or hands to the browser.
//
// Three layers, applied in order:
//   1. Sensitive key names are redacted outright.
//   2. Values are masked for recognizable credential shapes even when the key
//      name looks harmless (a token stored under `note`, for example).
//   3. Everything is truncated so a stray payload cannot bloat an event.

import { truncate } from "../format.js";
import { describeValue, isSensitiveKey } from "../summaries.js";

export const REDACTED = "[redacted]";

const SECRET_PATTERNS = [
  /\bbearer\s+[A-Za-z0-9._~+/=-]{8,}/gi,
  /\bsk-[A-Za-z0-9_-]{8,}/g,
  /\b(?:gh[pousr]|xox[baprs])[-_][A-Za-z0-9_-]{8,}/g,
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g,
  /\b[A-Za-z0-9+/]{40,}={0,2}\b/g,
];

export function maskSecretsInText(value, { replacement = REDACTED } = {}) {
  let text = String(value ?? "");
  for (const pattern of SECRET_PATTERNS) {
    text = text.replace(pattern, replacement);
  }
  return text;
}

export function safeText(value, { max = 240 } = {}) {
  if (value === null || value === undefined) return null;
  const collapsed = maskSecretsInText(value).replace(/\s+/g, " ").trim();
  return collapsed ? truncate(collapsed, max) : null;
}

// Produces a plain object that is safe to store in jsonb and to render.
export function redactRecord(
  record,
  { maxFields = 12, maxLength = 240, maxItems = 8, depth = 0 } = {}
) {
  if (record === null || record === undefined) return {};
  if (typeof record !== "object") return safeText(record, { max: maxLength }) ?? {};
  if (Array.isArray(record)) {
    return record
      .slice(0, maxItems)
      .map((item) => redactValue(item, { maxLength, maxItems, depth: depth + 1 }));
  }

  const output = {};
  const entries = Object.entries(record).filter(([, value]) => value !== undefined);

  for (const [key, value] of entries.slice(0, maxFields)) {
    output[key] = isSensitiveKey(key)
      ? REDACTED
      : redactValue(value, { maxLength, maxItems, depth: depth + 1 });
  }

  if (entries.length > maxFields) {
    output.__truncated_fields = entries.length - maxFields;
  }

  return output;
}

function redactValue(value, { maxLength, maxItems, depth }) {
  if (value === null) return null;
  if (typeof value === "string") return safeText(value, { max: maxLength });
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) {
    return value
      .slice(0, maxItems)
      .map((item) => redactValue(item, { maxLength, maxItems, depth: depth + 1 }));
  }
  if (typeof value === "object") {
    if (depth > 2) return describeValue(value, maxLength);
    return redactRecord(value, { maxLength, maxItems, depth });
  }
  return describeValue(value, maxLength);
}

// Receipts store a bounded, redacted description of input and result rather
// than the payloads themselves.
export function safeSummary(value, { max = 400 } = {}) {
  if (value === null || value === undefined) return null;

  if (typeof value === "string") {
    return safeText(value, { max });
  }

  if (typeof value === "object") {
    const redacted = Array.isArray(value) ? redactRecord(value) : redactRecord(value);
    try {
      return safeText(JSON.stringify(redacted), { max });
    } catch {
      return describeValue(value, max);
    }
  }

  return safeText(String(value), { max });
}
