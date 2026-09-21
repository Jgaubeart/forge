import { ForgeNav } from "./nav";
import { ForgeTopbar } from "./topbar";

export function ForgeAppShell({ context, badges, children }) {
  return (
    <div className="forge-shell">
      <ForgeTopbar context={context} />
      <div className="forge-body">
        <ForgeNav badges={badges} />
        <main className="forge-content">
          <div className="forge-content-inner">{children}</div>
        </main>
      </div>
    </div>
  );
}
