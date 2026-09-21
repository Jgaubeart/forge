import { ArmoryTile } from "@/components/jarvis/armory-tile";
import { JarvisHeading, JarvisSection } from "@/components/jarvis/shell";
import { declaredTools } from "@/lib/forge/tools/declared.js";

// Tool Armory on an authenticated route.
//
// The shelf lists what Forge intends to expose — names, providers, action levels,
// and review policy — but every tile is reported as not connected, because in
// this phase nothing is: there are no provider adapters, no OAuth, and no
// connections. The richer multi-state shelf (connected, waiting, needs setup)
// lives only on the development preview route, so a real workspace never sees
// fixture state dressed up as live state.
export default function ToolArmoryPage() {
  const declared = declaredTools().map((tool) => ({
    ...tool,
    status: "unavailable",
    connection: null,
  }));

  return (
    <>
      <JarvisHeading
        eyebrow="Tool Armory"
        title="Tools"
        sub="What Forge intends to offer, with the capability each tool needs and whether your word is required first."
        meta={`${declared.length} declared · 0 connected`}
      />

      <div className="jv-stack" style={{ marginTop: 12 }}>
        <div className="jv-notice wait">
          <span className="jv-mono">not connected</span>
          No integration is connected in this phase. Nothing on this shelf can act,
          and no tile claims otherwise.
        </div>

        <JarvisSection title="Declared tools" meta={declared.length}>
          <div className="jv-armory">
            {declared.map((tool) => (
              <ArmoryTile key={tool.id} tool={tool} />
            ))}
          </div>
        </JarvisSection>

        <JarvisSection title="Not in this build">
          <div className="jv-team">
            {["EYES (camera)", "HOLO", "WATCH", "FOCUS", "Voice", "Calls", "Local notes"].map(
              (name) => (
                <span className="jv-worker" key={name}>
                  <span className="jv-dot" style={{ background: "#334155" }} />
                  {name}
                  <em>unavailable</em>
                </span>
              )
            )}
          </div>
          <p className="jv-sub" style={{ marginTop: 8 }}>
            The reference build drives these from the local machine. They stay
            visibly unavailable here rather than hiding the controls.
          </p>
        </JarvisSection>

        <JarvisSection title="Connections" meta="none">
          <p className="jv-sub">
            Workspace connections arrive with the tool gateway in a later phase.
            Until then this page reports intent, not capability.
          </p>
        </JarvisSection>
      </div>
    </>
  );
}
