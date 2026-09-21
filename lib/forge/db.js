import "server-only";

import { cache } from "react";

import { createClient } from "@/utils/supabase/server";

// The authenticated, cookie-scoped Supabase client. Every Forge read goes
// through this client so row level security decides what the viewer can see.
// The service-role client is never used for dashboard reads.
export const getSupabase = cache(async function getSupabase() {
  return createClient();
});

// Runs a PostgREST query and degrades to an empty result instead of throwing,
// so an early-stage or partially migrated database renders an empty state
// rather than an error page.
export async function read(query, label) {
  try {
    const { data, error } = await query;

    if (error) {
      console.error(`[forge] ${label} failed: ${error.message}`);
      return { rows: [], failed: true };
    }

    return { rows: data ?? [], failed: false };
  } catch (error) {
    console.error(`[forge] ${label} failed: ${error?.message ?? error}`);
    return { rows: [], failed: true };
  }
}

// Same degradation rules for a single-row lookup: `row` is null when nothing
// matched, and never an empty array masquerading as a present record.
export async function readOne(query, label) {
  const result = await read(query, label);
  const row = Array.isArray(result.rows) ? result.rows[0] ?? null : result.rows;
  return { row, failed: result.failed };
}

export function groupBy(rows, key) {
  const grouped = new Map();

  for (const row of rows ?? []) {
    const groupKey = row?.[key];
    if (groupKey === undefined || groupKey === null) continue;
    const bucket = grouped.get(groupKey);
    if (bucket) {
      bucket.push(row);
    } else {
      grouped.set(groupKey, [row]);
    }
  }

  return grouped;
}
