import Link from "next/link";
import type { ReactNode } from "react";

/* ---------------------------------------------------------------------------
 * Surfaces
 * ------------------------------------------------------------------------- */

export function Surface({
  children,
  className = "",
  interactive = false,
  accent = false,
}: {
  children: ReactNode;
  className?: string;
  interactive?: boolean;
  accent?: boolean;
}) {
  return (
    <div
      className={[
        "rounded-card border bg-white shadow-card",
        accent ? "border-brand-border ring-1 ring-brand-soft" : "border-ink-200",
        interactive
          ? "transition duration-200 ease-swift hover:border-ink-300 hover:shadow-lift"
          : "",
        className,
      ].join(" ")}
    >
      {children}
    </div>
  );
}

export function SectionHead({
  title,
  hint,
  action,
}: {
  title: ReactNode;
  hint?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="mb-4 flex items-end justify-between gap-4">
      <div>
        <h2 className="text-h2 text-ink-900">{title}</h2>
        {hint ? <p className="mt-1 max-w-2xl text-small text-ink-500">{hint}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function Label({ children }: { children: ReactNode }) {
  return <div className="text-caption uppercase text-ink-500">{children}</div>;
}

/* ---------------------------------------------------------------------------
 * Buttons
 * ------------------------------------------------------------------------- */

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md" | "lg";

const BUTTON_BASE =
  "inline-flex items-center justify-center gap-2 font-medium transition duration-150 ease-swift " +
  "disabled:cursor-not-allowed disabled:opacity-40 active:translate-y-px select-none";

const BUTTON_VARIANT: Record<ButtonVariant, string> = {
  primary: "bg-brand text-white hover:bg-brand-hover active:bg-brand-press shadow-control",
  secondary: "bg-ink-100 text-ink-900 border border-ink-300 hover:bg-ink-200 hover:border-ink-400",
  ghost: "text-ink-600 hover:bg-ink-100 hover:text-ink-900",
  danger: "bg-danger/15 text-danger border border-danger/30 hover:bg-danger/25",
};

const BUTTON_SIZE: Record<ButtonSize, string> = {
  sm: "h-8 rounded-control px-3 text-small",
  md: "h-10 rounded-control px-4 text-body",
  lg: "h-12 rounded-control px-5 text-[1rem] w-full",
};

export function buttonClass(variant: ButtonVariant = "primary", size: ButtonSize = "md") {
  return [BUTTON_BASE, BUTTON_VARIANT[variant], BUTTON_SIZE[size]].join(" ");
}

export function LinkButton({
  href,
  children,
  variant = "primary",
  size = "md",
}: {
  href: string;
  children: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
}) {
  return (
    <Link href={href} className={buttonClass(variant, size)}>
      {children}
    </Link>
  );
}

/* ---------------------------------------------------------------------------
 * Badges
 * ------------------------------------------------------------------------- */

type BadgeTone = "neutral" | "accent" | "laden" | "empty" | "warn" | "danger";

const BADGE_TONE: Record<BadgeTone, string> = {
  neutral: "bg-ink-100 text-ink-600 border-ink-200",
  accent: "bg-brand-soft text-brand border-brand-border",
  laden: "bg-laden-soft text-laden-ink border-laden-border",
  empty: "bg-empty-soft text-empty-ink border-empty-border",
  warn: "bg-warn-soft text-warn-ink border-warn-border",
  danger: "bg-danger-soft text-danger-ink border-danger-border",
};

export function Badge({
  children,
  tone = "neutral",
  dot = false,
}: {
  children: ReactNode;
  tone?: BadgeTone;
  dot?: boolean;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-pill border px-2.5 py-1 text-[0.6875rem] font-medium ${BADGE_TONE[tone]}`}
    >
      {dot ? <span className="h-1.5 w-1.5 rounded-full bg-current animate-pulse-dot" /> : null}
      {children}
    </span>
  );
}

/* ---------------------------------------------------------------------------
 * Metrics
 * ------------------------------------------------------------------------- */

export function Metric({
  label,
  value,
  unit,
  sub,
  tone = "neutral",
  size = "md",
}: {
  label: ReactNode;
  value: ReactNode;
  unit?: ReactNode;
  sub?: ReactNode;
  tone?: "neutral" | "laden" | "empty" | "accent";
  size?: "md" | "lg";
}) {
  const toneClass = {
    neutral: "text-ink-900",
    laden: "text-laden-ink",
    empty: "text-empty-ink",
    accent: "text-brand",
  }[tone];

  return (
    <div>
      <Label>{label}</Label>
      <div className="mt-1.5 flex items-baseline gap-1.5">
        <span className={`tnum ${size === "lg" ? "text-metric-lg" : "text-metric"} ${toneClass}`}>
          {value}
        </span>
        {unit ? <span className="text-small text-ink-500">{unit}</span> : null}
      </div>
      {sub ? <div className="mt-1 text-small text-ink-500">{sub}</div> : null}
    </div>
  );
}

/**
 * The product's signature element: how much of a trip's distance carries cargo.
 *
 * A truck that delivers one load and returns empty cannot exceed half, so the
 * midpoint is marked — the bar reads as an argument, not just a ratio.
 */
export function LadenBar({
  ladenKm,
  emptyKm,
  showCeiling = true,
}: {
  ladenKm: number;
  emptyKm: number;
  showCeiling?: boolean;
}) {
  const total = ladenKm + emptyKm;
  const paid = total > 0 ? (ladenKm / total) * 100 : 0;

  return (
    <div>
      <div className="relative h-2 overflow-hidden rounded-pill bg-ink-200">
        <div
          className="absolute inset-y-0 left-0 rounded-pill bg-laden transition-all duration-700 ease-swift"
          style={{ width: `${paid}%` }}
        />
        <div
          className="absolute inset-y-0 right-0 bg-empty/70 transition-all duration-700 ease-swift"
          style={{ width: `${100 - paid}%` }}
        />
        {showCeiling ? (
          <div
            className="absolute inset-y-0 w-px bg-ink-100/60"
            style={{ left: "50%" }}
            title="Потолок схемы «туда с грузом, обратно порожняком»"
          />
        ) : null}
      </div>
      <div className="mt-1.5 flex items-center justify-between text-[0.6875rem]">
        <span className="text-laden-ink">
          с грузом <span className="tnum font-semibold">{Math.round(paid)}%</span>
        </span>
        {showCeiling ? <span className="text-ink-500">потолок 50%</span> : null}
        <span className="text-empty-ink">
          порожний <span className="tnum font-semibold">{Math.round(100 - paid)}%</span>
        </span>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * Navigation
 * ------------------------------------------------------------------------- */

export type Role = "shipper" | "driver" | "akimat";

const ROLE_TABS: { key: Role; href: string; label: string }[] = [
  { key: "shipper", href: "/shipper", label: "Отправитель" },
  { key: "driver", href: "/driver", label: "Перевозчик" },
  { key: "akimat", href: "/akimat", label: "Диспетчер" },
];

export function TopBar({ current }: { current?: Role }) {
  return (
    <header className="sticky top-0 z-[900] border-b border-ink-200 bg-white/95 backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-4 px-4">
        <Link href="/" className="flex shrink-0 items-center gap-2">
          <Logo />
          <span className="hidden text-[0.9375rem] font-semibold tracking-tight text-ink-900 sm:block">
            Mangystau<span className="text-brand">.</span>
          </span>
        </Link>

        <nav className="flex flex-1 items-center gap-1 overflow-x-auto">
          <div className="flex rounded-control bg-ink-100 p-0.5">
            {ROLE_TABS.map((tab) => (
              <Link
                key={tab.key}
                href={tab.href}
                className={[
                  "whitespace-nowrap rounded-[7px] px-3 py-1.5 text-small font-medium transition duration-150 ease-swift",
                  current === tab.key
                    ? "bg-ink-200 text-ink-900 shadow-card"
                    : "text-ink-500 hover:text-ink-700",
                ].join(" ")}
              >
                {tab.label}
              </Link>
            ))}
          </div>
        </nav>

        <div className="flex shrink-0 items-center gap-1">
          <Link
            href="/demo"
            className="rounded-control px-2.5 py-1.5 text-small font-medium text-brand transition hover:bg-brand-soft"
          >
            Демо
          </Link>
          <Link
            href="/methodology"
            className="rounded-control px-2.5 py-1.5 text-small text-ink-500 transition hover:bg-ink-100 hover:text-ink-700"
          >
            Методология
          </Link>
        </div>
      </div>
    </header>
  );
}

/** A lorry, drawn rather than borrowed from the emoji font. */
export function TruckIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden>
      <path
        d="M2 7.5h11v9H2zM13 11h4.2l2.8 3v2.5h-7z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <circle cx="6.5" cy="18" r="1.9" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="16.5" cy="18" r="1.9" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

/** A mark rather than an emoji: two lanes converging into one. */
export function Logo({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden fill="none">
      <rect width="24" height="24" rx="7" fill="#EFF5FF" />
      <path
        d="M5 7.5h6.5c2.2 0 3.5 1.4 3.5 3.2S13.7 14 11.5 14H7"
        stroke="#2563EB"
        strokeWidth="1.9"
        strokeLinecap="round"
      />
      <path d="M5 16.5h14" stroke="#0E8A6F" strokeWidth="1.9" strokeLinecap="round" />
      <circle cx="19" cy="10.8" r="1.6" fill="#2563EB" />
    </svg>
  );
}

/* ---------------------------------------------------------------------------
 * States
 * ------------------------------------------------------------------------- */

export function EmptyState({
  title,
  children,
  action,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-card border border-dashed border-ink-200 bg-ink-50 px-6 py-10 text-center">
      <p className="text-h3 text-ink-700">{title}</p>
      {children ? <p className="mx-auto mt-2 max-w-md text-small text-ink-500">{children}</p> : null}
      {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
    </div>
  );
}

export function Skeleton({ className = "h-4 w-full" }: { className?: string }) {
  return (
    <div
      className={`animate-shimmer rounded bg-[linear-gradient(90deg,#161B25_25%,#1D2430_50%,#161B25_75%)] bg-[length:200%_100%] ${className}`}
    />
  );
}

export function Alert({
  tone = "warn",
  children,
}: {
  tone?: "warn" | "danger" | "accent";
  children: ReactNode;
}) {
  const map = {
    warn: "border-warn/30 bg-warn-soft text-warn",
    danger: "border-danger/30 bg-danger-soft text-danger",
    accent: "border-brand-border/50 bg-brand-soft text-brand",
  } as const;
  return (
    <div className={`rounded-control border px-3.5 py-2.5 text-small ${map[tone]}`}>{children}</div>
  );
}

/* ---------------------------------------------------------------------------
 * Route timeline — the shape of an assembled trip
 * ------------------------------------------------------------------------- */

export interface TimelineStop {
  id: string;
  seq: number;
  name: string;
  action: "pickup" | "dropoff";
  detail?: string | null;
  done?: boolean;
}

export function RouteTimeline({
  stops,
  origin,
  compact = false,
}: {
  stops: TimelineStop[];
  /** Where the vehicle stands before the first stop, and returns to at the end. */
  origin?: string;
  compact?: boolean;
}) {
  return (
    <ol className={compact ? "space-y-1" : "space-y-2.5"}>
      {origin ? (
        <li className="flex items-center gap-3">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center">
            <span className="h-2 w-2 rounded-full bg-ink-500" />
          </span>
          <span className="text-small text-ink-500">Машина в {origin}</span>
        </li>
      ) : null}

      {stops.map((stop, index) => (
        <li key={stop.id} className="relative flex gap-3">
          {index < stops.length - 1 ? (
            <span
              className="absolute left-3 top-6 h-[calc(100%-8px)] w-px bg-ink-200"
              aria-hidden
            />
          ) : null}
          <span
            className={[
              "relative z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[0.625rem] font-bold",
              stop.done
                ? "bg-laden text-white"
                : stop.action === "pickup"
                  ? "bg-brand text-white"
                  : "border border-ink-400 bg-ink-100 text-ink-600",
            ].join(" ")}
          >
            {stop.done ? "✓" : stop.seq}
          </span>
          <span className="min-w-0 flex-1 pb-0.5">
            <span className="flex flex-wrap items-baseline gap-x-2">
              <span className="text-body font-medium text-ink-900">{stop.name}</span>
              <span className="text-[0.6875rem] uppercase tracking-wide text-ink-500">
                {stop.action === "pickup" ? "забрать" : "выгрузить"}
              </span>
            </span>
            {stop.detail ? (
              <span className="block text-small text-ink-500">{stop.detail}</span>
            ) : null}
          </span>
        </li>
      ))}

      {origin ? (
        <li className="flex items-center gap-3">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center">
            <span className="h-2 w-2 rounded-full border border-ink-400" />
          </span>
          <span className="text-small text-ink-500">Возврат в {origin}</span>
        </li>
      ) : null}
    </ol>
  );
}
