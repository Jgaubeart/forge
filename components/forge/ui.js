import Link from "next/link";

export function PageHeader({ eyebrow, title, subtitle, meta, actions }) {
  return (
    <header className="forge-page-header">
      <div>
        {eyebrow ? <div className="forge-eyebrow">{eyebrow}</div> : null}
        <h1 className="forge-page-title">{title}</h1>
        {subtitle ? <p className="forge-page-subtitle">{subtitle}</p> : null}
        {meta ? <div className="forge-meta-faint">{meta}</div> : null}
      </div>
      {actions ? <div className="forge-page-actions">{actions}</div> : null}
    </header>
  );
}

export function Section({ title, meta, action, children }) {
  return (
    <section className="forge-section">
      <div className="forge-section-head">
        <div className="forge-section-title">{title}</div>
        <div className="forge-section-meta">
          {action}
          {action && meta ? " · " : null}
          {meta}
        </div>
      </div>
      <div className="forge-section-body">{children}</div>
    </section>
  );
}

export function Dot({ tone = "muted", live = false }) {
  return (
    <span
      className={live ? "forge-dot forge-dot--live" : "forge-dot"}
      data-tone={tone}
    />
  );
}

export function Pill({ label, tone = "muted", live = false }) {
  return (
    <span className="forge-pill" data-tone={tone}>
      <Dot tone={tone} live={live} />
      {label}
    </span>
  );
}

export function ActionLevel({ level }) {
  if (!level) return <span className="forge-meta-faint">—</span>;
  const value = String(level).toLowerCase();
  return (
    <span className="forge-level" data-level={value}>
      {value}
    </span>
  );
}

export function EmptyState({ title, text, glyph = "check" }) {
  return (
    <div className="forge-empty">
      <div className="forge-empty-glyph" aria-hidden="true">
        <Glyph name={glyph} />
      </div>
      <div className="forge-empty-title">{title}</div>
      {text ? <p className="forge-empty-text">{text}</p> : null}
    </div>
  );
}

function Glyph({ name }) {
  const common = {
    width: 15,
    height: 15,
    viewBox: "0 0 16 16",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.5,
    strokeLinecap: "round",
    strokeLinejoin: "round",
  };

  if (name === "plug") {
    return (
      <svg {...common}>
        <path d="M6.1 3.4v2.8M9.9 3.4v2.8" />
        <path d="M4.3 6.2h7.4v1.5a3.7 3.7 0 0 1-7.4 0Z" />
        <path d="M8 11.4v1.9" />
      </svg>
    );
  }

  if (name === "spark") {
    return (
      <svg {...common}>
        <path d="M8 2.8 9.4 6.6 13.2 8 9.4 9.4 8 13.2 6.6 9.4 2.8 8 6.6 6.6Z" />
      </svg>
    );
  }

  return (
    <svg {...common}>
      <path d="M3.4 8.3 6.4 11.3 12.6 4.7" />
    </svg>
  );
}

export function Notice({ children, tone = "neutral" }) {
  return (
    <div className="forge-notice" data-tone={tone}>
      {children}
    </div>
  );
}

export function MetricRow({ items }) {
  return (
    <div className="forge-metrics">
      {items.map((item) => (
        <div className="forge-metric" key={item.label}>
          <div className="forge-metric-value">{item.value}</div>
          <div className="forge-metric-label">{item.label}</div>
          {item.hint ? <div className="forge-metric-hint">{item.hint}</div> : null}
        </div>
      ))}
    </div>
  );
}

export function KeyValue({ items }) {
  return (
    <dl className="forge-kv">
      {items.map((item) => (
        <div className="forge-kv-row" key={item.label}>
          <dt>{item.label}</dt>
          <dd>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function ChipList({ items, max = 3, empty = "—" }) {
  if (!items || items.length === 0) {
    return <span className="forge-meta-faint">{empty}</span>;
  }

  const shown = items.slice(0, max);
  const remaining = items.length - shown.length;

  return (
    <span className="forge-inline-list">
      {shown.map((item) => (
        <span className="forge-chip" key={item}>
          {item}
        </span>
      ))}
      {remaining > 0 ? (
        <span className="forge-meta-faint">+{remaining}</span>
      ) : null}
    </span>
  );
}

export function FilterChips({ options }) {
  return (
    <div className="forge-inline-list">
      {options.map((option) => (
        <Link
          key={option.label}
          href={option.href}
          className="forge-chip"
          data-active={option.active ? "true" : "false"}
        >
          {option.label}
          {typeof option.count === "number" ? ` · ${option.count}` : ""}
        </Link>
      ))}
    </div>
  );
}

export function Hint({ children }) {
  return <p className="forge-meta-faint" style={{ marginTop: 10 }}>{children}</p>;
}
