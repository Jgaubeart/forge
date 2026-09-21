"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Ported from the reference sidebar rows (.nrow): a dot, a label, and a trailing
// count, in the same compact rhythm.
const NAV = [
  { href: "/", label: "Mission Bay" },
  { href: "/agents", label: "Fleet" },
  { href: "/tools", label: "Tool Armory" },
  { href: "/history", label: "History" },
  { href: "/settings", label: "Settings" },
];

export function JarvisNav({ counts = {} }) {
  const pathname = usePathname() ?? "/";

  const badgeFor = (href) => {
    if (href === "/") return counts.missions ?? 0;
    if (href === "/agents") return counts.agents ?? 0;
    if (href === "/tools") return counts.tools ?? 0;
    if (href === "/history") return counts.events ?? 0;
    return null;
  };

  return (
    <nav className="jv-nav" aria-label="Jarvis">
      <div className="jv-sec">Mission control</div>
      <div className="jv-card">
        {NAV.map((item) => {
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          const badge = badgeFor(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={active ? "jv-nrow on" : "jv-nrow"}
              aria-current={active ? "page" : undefined}
            >
              <span
                className={active ? "jv-dot lg on" : "jv-dot lg"}
                style={{ background: active ? "#34d399" : "#334155" }}
              />
              <span className="lbl">{item.label}</span>
              {badge ? <span className="deg">{badge}</span> : null}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
