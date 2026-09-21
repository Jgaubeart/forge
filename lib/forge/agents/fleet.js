// The Fleet definition.
//
// The reference build's Fleet is a coordinated three-agent team — SCOUT, FORGE,
// SAGE — with JARVIS coordinating and assembling the result. This is a plain
// definition so the Hermes runtime adapter can consume it later.

export const FLEET_SLUG = "the-fleet";

export const FLEET_BEHAVIOR_CONTRACT = Object.freeze({
  summary:
    "JARVIS takes the mission, optionally deploys the workers, and assembles their output into one result.",
  steps: [
    "JARVIS receives the operator's mission and decides what it actually needs.",
    "JARVIS decomposes the work and chooses the workers (the canonical set is SCOUT, FORGE, and SAGE; a subset is allowed).",
    "SCOUT produces reconnaissance: landscape, facts and numbers, constraints, risks.",
    "FORGE produces the deliverable: draft, plan, or artifact.",
    "SAGE critiques it: objections, what people get wrong, risks, and five next actions.",
    "JARVIS assembles the final result and reports it in plain language.",
  ],
  rules: [
    "Not every mission must run every worker. JARVIS may pick a subset and must say which workers it used.",
    "The canonical order is SCOUT → FORGE → SAGE, with JARVIS before and after.",
    "Workers stay idle until work is actually delegated; the UI never shows a worker as running on the strength of an assignment alone.",
    "No worker receives credentials, and nothing a worker produces is treated as proof that an external action happened.",
    "If a worker fails or comes back empty, JARVIS reports that plainly instead of filling the gap.",
  ],
});

export const FLEET = Object.freeze({
  slug: FLEET_SLUG,
  name: "THE FLEET",
  description:
    "A coordinated three-agent team for open-ended work: reconnaissance, making, and critique, assembled by JARVIS.",
  lead: "jarvis",
  members: Object.freeze([
    Object.freeze({
      slug: "scout",
      role: "recon",
      order: 1,
      produces: "Recon memo: landscape, facts and numbers, constraints, risks.",
    }),
    Object.freeze({
      slug: "forge",
      role: "maker",
      order: 2,
      produces: "The deliverable the brief asked for, ready to use.",
    }),
    Object.freeze({
      slug: "sage",
      role: "critic",
      order: 3,
      produces: "Objections, risks, and five highest-leverage next actions.",
    }),
  ]),
  behavior: FLEET_BEHAVIOR_CONTRACT,
  capabilityState: "defined",
  capabilityNote:
    "The team is defined and its composition is fixed; delegation is not connected to a runtime yet.",
});

export function fleetMemberSlugs() {
  return FLEET.members.map((member) => member.slug);
}
