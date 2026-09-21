"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

function Icon({ name }) {
  const common = {
    width: 15,
    height: 15,
    viewBox: "0 0 16 16",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.4,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": true,
  };

  switch (name) {
    case "overview":
      return (
        <svg {...common}>
          <rect x="2.4" y="2.4" width="4.6" height="4.6" rx="1.2" />
          <rect x="9" y="2.4" width="4.6" height="4.6" rx="1.2" />
          <rect x="2.4" y="9" width="4.6" height="4.6" rx="1.2" />
          <rect x="9" y="9" width="4.6" height="4.6" rx="1.2" />
        </svg>
      );
    case "agents":
      return (
        <svg {...common}>
          <circle cx="8" cy="5.6" r="2.4" />
          <path d="M3.4 13.1c.5-2.2 2.4-3.5 4.6-3.5s4.1 1.3 4.6 3.5" />
        </svg>
      );
    case "departments":
      return (
        <svg {...common}>
          <path d="M8 2.4 13.8 5.6 8 8.8 2.2 5.6Z" />
          <path d="M2.2 9.3 8 12.5l5.8-3.2" />
        </svg>
      );
    case "tasks":
      return (
        <svg {...common}>
          <rect x="2.6" y="2.6" width="10.8" height="10.8" rx="2.6" />
          <path d="M5.7 8.2 7.4 9.9l3.1-3.6" />
        </svg>
      );
    case "runs":
      return (
        <svg {...common}>
          <path d="M2.4 8h2.5l1.7-3.5L9 11.5l1.5-3.5h2.6" />
        </svg>
      );
    case "approvals":
      return (
        <svg {...common}>
          <path d="M8 2.3 12.6 4v3.5c0 2.6-1.8 4.9-4.6 6.1-2.8-1.2-4.6-3.5-4.6-6.1V4Z" />
          <path d="M6.2 8.1 7.5 9.4l2.4-2.6" />
        </svg>
      );
    case "connections":
      return (
        <svg {...common}>
          <path d="M6.1 3.4v2.8M9.9 3.4v2.8" />
          <path d="M4.3 6.2h7.4v1.5a3.7 3.7 0 0 1-7.4 0Z" />
          <path d="M8 11.4v1.9" />
        </svg>
      );
    case "activity":
      return (
        <svg {...common}>
          <circle cx="8" cy="8" r="5.6" />
          <path d="M8 4.9V8l2.2 1.4" />
        </svg>
      );
    case "settings":
      return (
        <svg {...common}>
          <path d="M2.8 5.2h10.4M2.8 10.8h10.4" />
          <circle cx="6.1" cy="5.2" r="1.5" />
          <circle cx="9.9" cy="10.8" r="1.5" />
        </svg>
      );
    default:
      return null;
  }
}

const NAV_GROUPS = [
  {
    label: "Mission control",
    items: [
      { href: "/", label: "Mission Bay", icon: "overview" },
      { href: "/missions", label: "Missions", icon: "tasks" },
      { href: "/approvals", label: "Approvals", icon: "approvals" },
    ],
  },
  {
    label: "Workforce",
    items: [
      { href: "/agents", label: "Agents", icon: "agents" },
      { href: "/tools", label: "Tools", icon: "departments" },
    ],
  },
  {
    label: "Record",
    items: [
      { href: "/history", label: "History", icon: "runs" },
      { href: "/settings", label: "Settings", icon: "settings" },
    ],
  },
];

function isActive(pathname, href) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function ForgeNav({ badges = {} }) {
  const pathname = usePathname() ?? "/";

  return (
    <nav className="forge-sidebar" aria-label="Forge">
      {NAV_GROUPS.map((group) => (
        <div className="forge-nav-group" key={group.label}>
          <div className="forge-nav-label">{group.label}</div>
          <ul className="forge-nav-list">
            {group.items.map((item) => {
              const badge = badges[item.href] ?? 0;

              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={
                      isActive(pathname, item.href)
                        ? "forge-nav-item forge-nav-item--active"
                        : "forge-nav-item"
                    }
                    aria-current={isActive(pathname, item.href) ? "page" : undefined}
                  >
                    <Icon name={item.icon} />
                    <span>{item.label}</span>
                    {badge > 0 ? (
                      <span className="forge-nav-count">{badge}</span>
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
