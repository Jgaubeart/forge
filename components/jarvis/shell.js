import Link from "next/link";

import { JarvisNav } from "./sidebar";
import { JarvisTopStrip } from "./top-strip";
import { FIXTURE_NOTICE } from "@/lib/jarvis-fixtures";

// Ported shell from the reference viewer: a floating glass panel on the left
// (#side), the legend-style strip across the top of the work area (#legend), and
// the work surface in between.
export function JarvisShell({ user, context, counts = {}, children }) {
  return (
    <div className="jv-shell">
      <aside className="jv-side">
        <div className="jv-brand">
          <span className="jv-brand-mark" aria-hidden="true">
            J
          </span>
          <div>
            <h1>JARVIS</h1>
            <div className="sub">{counts.label ?? FIXTURE_NOTICE}</div>
          </div>
        </div>

        <JarvisNav counts={counts} />

        <div className="jv-side-foot">
          Mission Bay · Fleet · Tool Armory · History · Settings
          <br />
          Jarvis is the reference. Hermes will run the work.
        </div>
      </aside>

      <div className="jv-body">
        <JarvisTopStrip user={user} context={context} />
        <main className="jv-main">{children}</main>
      </div>
    </div>
  );
}

export function JarvisHeading({ eyebrow, title, sub, meta, actions }) {
  return (
    <header className="jv-head">
      <div>
        {eyebrow ? <div className="jv-eyebrow">{eyebrow}</div> : null}
        <h1 className="jv-title">{title}</h1>
        {sub ? <p className="jv-sub">{sub}</p> : null}
        {meta ? <div className="jv-meta">{meta}</div> : null}
      </div>
      {actions ? <div>{actions}</div> : null}
    </header>
  );
}

export function JarvisSection({ title, meta, action, children }) {
  return (
    <section>
      <div className="jv-sechead">
        <div className="jv-sectitle">{title}</div>
        <div className="jv-secmeta">
          {action}
          {action && meta ? " · " : null}
          {meta}
        </div>
      </div>
      <div style={{ paddingTop: 8 }}>{children}</div>
    </section>
  );
}

export function JarvisEmpty({ title, text }) {
  return (
    <div className="jv-empty">
      <div className="t">{title}</div>
      {text ? <div className="x">{text}</div> : null}
    </div>
  );
}

export function JarvisFixtureNotice() {
  return (
    <div className="jv-notice">
      <span className="jv-mono">fixture</span>
      {FIXTURE_NOTICE} Hermes is not connected, and no approval here reaches a
      service.
    </div>
  );
}

export function JarvisLink({ href, children }) {
  return (
    <Link className="jv-link" href={href}>
      {children}
    </Link>
  );
}
