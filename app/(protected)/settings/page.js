import {
  JarvisFixtureNotice,
  JarvisHeading,
  JarvisSection,
} from "@/components/jarvis/shell";
import { requireUser } from "@/lib/auth";
import { AGENTS, FLEET, agentBySlug } from "@/lib/forge/agents";

export default async function SettingsPage() {
  const user = await requireUser();

  return (
    <>
      <JarvisHeading
        eyebrow="Settings"
        title="Settings"
        sub="Account, workspace, and what is not switched on yet. Setup stays out of the way until you need it."
        meta={user?.email ?? ""}
      />

      <div className="jv-stack" style={{ marginTop: 12 }}>
        <JarvisFixtureNotice />

        <JarvisSection title="Account">
          <div className="jv-row">
            <span className="main">
              <span className="t">{user?.email ?? "signed in"}</span>
              <span className="m">
                <span>{user?.id ?? ""}</span>
              </span>
            </span>
            <form action="/auth/signout" method="post">
              <button className="jv-btn ghost" type="submit">
                Sign out
              </button>
            </form>
          </div>
        </JarvisSection>

        <JarvisSection title="Workspace">
          <p className="jv-sub">
            This phase runs on fixtures, so no workspace, mission, agent, or
            receipt is stored yet. Supabase persistence and first-workspace setup
            arrive in a later phase, and nothing here is pretending otherwise.
          </p>
        </JarvisSection>

        <JarvisSection title="Fleet" meta={`${AGENTS.length} agents`}>
          <div className="jv-team">
            {FLEET.members.map((member) => (
              <span className="jv-worker" key={member.slug}>
                <span
                  className="jv-dot lg on"
                  style={{ background: "currentColor", color: "#62dbff" }}
                />
                {agentBySlug(member.slug)?.name ?? member.slug.toUpperCase()}
                <em>{member.role}</em>
              </span>
            ))}
          </div>
        </JarvisSection>

        <JarvisSection title="Not switched on">
          <ol className="jv-feed" style={{ maxHeight: "none" }}>
            {[
              ["Hermes runtime", "not connected — no mission is really executed"],
              ["External services", "no OAuth, no Gmail, no GitHub, no Vercel"],
              ["Approvals", "fixture only — confirming changes the card, nothing else"],
              ["Receipts", "none yet — nothing has actually run"],
              ["Desktop senses", "EYES, HOLO, WATCH, FOCUS, voice, and calls stay off"],
            ].map(([what, state]) => (
              <li key={what}>
                <b style={{ color: "#a7c4b6" }}>{what}</b>
                <span className="lbl">{state}</span>
              </li>
            ))}
          </ol>
        </JarvisSection>
      </div>
    </>
  );
}
