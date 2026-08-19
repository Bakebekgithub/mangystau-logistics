import Link from "next/link";
import type { ReactNode } from "react";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-sand-200 bg-white p-4 shadow-sm ${className}`}>
      {children}
    </div>
  );
}

export function SectionTitle({ children, hint }: { children: ReactNode; hint?: string }) {
  return (
    <div className="mb-3">
      <h2 className="text-lg font-semibold text-sand-900">{children}</h2>
      {hint ? <p className="mt-0.5 text-sm text-sand-600">{hint}</p> : null}
    </div>
  );
}

/**
 * A single figure with its label. `tone` marks the two things this product is
 * about: empty running is a loss, loaded running is value.
 */
export function Stat({
  label,
  value,
  sub,
  tone = "neutral",
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: "neutral" | "loss" | "value";
}) {
  const toneClass =
    tone === "loss" ? "text-empty" : tone === "value" ? "text-laden" : "text-sand-900";
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-sand-500">{label}</div>
      <div className={`mt-0.5 text-2xl font-semibold tabular-nums ${toneClass}`}>{value}</div>
      {sub ? <div className="mt-0.5 text-xs text-sand-600">{sub}</div> : null}
    </div>
  );
}

export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "loss" | "value" | "info";
}) {
  const map = {
    neutral: "bg-sand-100 text-sand-700",
    loss: "bg-orange-100 text-empty",
    value: "bg-green-100 text-laden",
    info: "bg-caspian-100 text-caspian-800",
  } as const;
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${map[tone]}`}>
      {children}
    </span>
  );
}

/**
 * A horizontal bar splitting a trip into paid and empty kilometres. The point of
 * the product in one glance.
 */
export function PaidBar({ ladenKm, emptyKm }: { ladenKm: number; emptyKm: number }) {
  const total = ladenKm + emptyKm;
  const paidPercent = total > 0 ? (ladenKm / total) * 100 : 0;
  return (
    <div>
      <div className="flex h-2.5 overflow-hidden rounded-full bg-sand-200">
        <div className="bg-laden" style={{ width: `${paidPercent}%` }} />
        <div className="bg-empty" style={{ width: `${100 - paidPercent}%` }} />
      </div>
      <div className="mt-1 flex justify-between text-xs text-sand-600">
        <span className="text-laden">с грузом {Math.round(paidPercent)}%</span>
        <span className="text-empty">порожний {Math.round(100 - paidPercent)}%</span>
      </div>
    </div>
  );
}

export function RoleNav({ current }: { current: "shipper" | "driver" | "akimat" }) {
  const items = [
    { key: "shipper", href: "/shipper", label: "Отправитель" },
    { key: "driver", href: "/driver", label: "Перевозчик" },
    { key: "akimat", href: "/akimat", label: "Акимат" },
  ] as const;

  return (
    <header className="sticky top-0 z-[900] border-b border-sand-200 bg-sand-50/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center gap-1 px-3 py-2">
        <Link href="/" className="mr-2 shrink-0 text-sm font-semibold text-caspian-700">
          Mangystau<span className="text-sand-400"> Logistics</span>
        </Link>
        <nav className="flex flex-1 gap-1 overflow-x-auto">
          {items.map((item) => (
            <Link
              key={item.key}
              href={item.href}
              className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm transition ${
                current === item.key
                  ? "bg-caspian-600 font-medium text-white"
                  : "text-sand-700 hover:bg-sand-100"
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <Link
          href="/methodology"
          className="shrink-0 rounded-lg px-2 py-1.5 text-xs text-sand-600 hover:bg-sand-100"
        >
          Методология
        </Link>
      </div>
    </header>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-sand-300 p-6 text-center text-sm text-sand-600">
      {children}
    </div>
  );
}
