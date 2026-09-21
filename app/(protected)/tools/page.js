import { ArmoryTile } from "@/components/jarvis/armory-tile";
import { JarvisHeading, JarvisSection } from "@/components/jarvis/shell";
import { fixtureConnectedCount, fixtureTools } from "@/lib/jarvis-fixtures";

// Tool Armory, ported from the reference shelf: tiles with a status pill, logo
// chip, action classification, and an honest "not implemented" state for tools
// that have no adapter.
export default function ToolArmoryPage() {
  const tools = fixtureTools();
  const connected = fixtureConnectedCount();
  const pending = tools.filter((tool) => ["waiting", "setup"].includes(tool.status));
  const unavailable = tools.filter((tool) => tool.status === "unavailable");
  const ready = tools.filter((tool) => tool.status === "available");

  return (
    <>
      <JarvisHeading
        eyebrow="Tool Armory"
        title="Tools"
        sub="The shelf. Everything Forge can do is declared here, with the level it runs at and whether your word is required first."
        meta={`${connected} connected · ${ready.length} ready · ${pending.length} need setup · ${unavailable.length} not implemented`}
      />

      <div className="jv-stack" style={{ marginTop: 12 }}>
        <JarvisSection title="Connected" meta={connected}>
          <div className="jv-armory">
            {tools
              .filter((tool) => tool.status === "connected")
              .map((tool) => (
                <ArmoryTile key={tool.id} tool={tool} />
              ))}
          </div>
        </JarvisSection>

        <JarvisSection title="Ready to use" meta={ready.length}>
          <div className="jv-armory">
            {ready.map((tool) => (
              <ArmoryTile key={tool.id} tool={tool} />
            ))}
          </div>
        </JarvisSection>

        <JarvisSection title="Needs setup" meta={pending.length}>
          <div className="jv-armory">
            {pending.map((tool) => (
              <ArmoryTile key={tool.id} tool={tool} />
            ))}
          </div>
        </JarvisSection>

        <JarvisSection title="Declared, not implemented" meta={unavailable.length}>
          <div className="jv-armory">
            {unavailable.map((tool) => (
              <ArmoryTile key={tool.id} tool={tool} />
            ))}
          </div>
          <p className="jv-sub" style={{ marginTop: 8 }}>
            Declared tools have no adapter yet. Jarvis will refuse them rather
            than pretend they worked, and nothing on this shelf is implied to
            work until it says ready or connected.
          </p>
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
      </div>
    </>
  );
}
