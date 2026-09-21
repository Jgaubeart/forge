import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { test } from "node:test";

const read = (relative) =>
  readFileSync(new URL(`../${relative}`, import.meta.url), "utf8");

test("the stylesheet keeps the reference palette", () => {
  const css = read("app/globals.css");

  for (const token of [
    "#06080c", // graph/HUD background (viewer/index.html :root body)
    "rgba(10, 13, 18, 0.82)", // --panel
    "#1f2937", // --line
    "#cbd5e1", // --txt
    "#64748b", // --dim
    "#34d399", // --accent
    "#62dbff", // SCOUT / WARROOM
    "#f4a93a", // FORGE / REAPER / HERALD
    "#b58cff", // SAGE
    "#ff7d6b", // HATERS
    "#16171c", // Tool Armory card
    "#e8b64c", // Tool Armory gold
    "#f0a05a", // Tool Armory amber
  ]) {
    assert.ok(css.includes(token), `stylesheet is missing reference token ${token}`);
  }
});

test("mission surfaces use the reference mono treatment and density", () => {
  const css = read("app/globals.css");

  const mission = css.slice(css.indexOf(".jv-mission {"), css.indexOf(".jv-mission-head"));
  assert.match(mission, /font-family: var\(--jv-mono\)/);
  assert.match(mission, /border-radius: 12px/);
  assert.match(mission, /rgba\(10, 16, 20, 0.94\)/); // .jm-card background

  const feed = css.slice(css.indexOf(".jv-feed {"), css.indexOf(".jv-mission-foot"));
  assert.match(feed, /font-size: 9.5px/); // .jm-feed
  assert.match(feed, /scrollbar-color: #1c3a2e transparent/);
});

test("the ported surfaces and components exist", () => {
  for (const file of [
    "components/jarvis/shell.js",
    "components/jarvis/sidebar.js",
    "components/jarvis/top-strip.js",
    "components/jarvis/mission-card.js",
    "components/jarvis/hud.js",
    "components/jarvis/results.js",
    "components/jarvis/armory-tile.js",
    "components/jarvis/agent-sigil.js",
    "lib/jarvis-fixtures/index.js",
    "app/(protected)/page.js",
    "app/(protected)/agents/page.js",
    "app/(protected)/tools/page.js",
    "app/(protected)/history/page.js",
    "app/(protected)/settings/page.js",
  ]) {
    assert.ok(existsSync(new URL(`../${file}`, import.meta.url)), `${file} is missing`);
  }
});

test("no Phase 2 code reaches for Supabase, Hermes, or the network", () => {
  const sources = [
    read("app/(protected)/page.js"),
    read("app/(protected)/agents/page.js"),
    read("app/(protected)/tools/page.js"),
    read("app/(protected)/history/page.js"),
    read("components/jarvis/mission-card.js"),
    read("components/jarvis/hud.js"),
    read("lib/jarvis-fixtures/missions.js"),
  ].join("\n");

  for (const forbidden of [
    "lib/hermes",
    "utils/supabase",
    "fetch(",
    "createClient",
  ]) {
    assert.equal(
      sources.includes(forbidden),
      false,
      `Phase 2 UI must not reference ${forbidden}`
    );
  }
});

test("the auth foundation is untouched", () => {
  assert.ok(existsSync(new URL("../middleware.js", import.meta.url)));
  assert.ok(existsSync(new URL("../lib/auth.js", import.meta.url)));
  assert.ok(existsSync(new URL("../utils/supabase/server.js", import.meta.url)));
  assert.match(read("app/(protected)/layout.js"), /requireUser/);
});
