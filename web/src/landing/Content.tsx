// Building blocks of the long-form pages (/how-it-works, /security, /terms,
// /privacy): an intro band, an optional table of contents and prose sections.
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Container } from "./Shell";

export function PageIntro({ eyebrow, title, lede, children }: { eyebrow: string; title: string; lede: ReactNode; children?: ReactNode }) {
  return (
    <section className="relative overflow-hidden border-b bg-muted/40">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(50rem_20rem_at_80%_-20%,color-mix(in_oklch,var(--primary)_14%,transparent),transparent_70%)]"
      />
      <Container className="relative py-14 sm:py-20">
        <p className="text-sm font-semibold tracking-wide text-primary uppercase">{eyebrow}</p>
        <h1 className="mt-2 max-w-3xl text-4xl font-semibold tracking-tight text-balance sm:text-5xl">{title}</h1>
        <div className="mt-5 max-w-2xl text-lg text-pretty text-muted-foreground">{lede}</div>
        {children}
      </Container>
    </section>
  );
}

/** Sticky contents list beside the sections on wide screens. */
export function WithToc({ toc, children }: { toc: { id: string; label: string }[]; children: ReactNode }) {
  return (
    <Container className="grid grid-cols-1 gap-12 py-14 lg:grid-cols-[13rem_minmax(0,1fr)] lg:py-20">
      <nav aria-label="On this page" className="hidden lg:block">
        <div className="sticky top-24">
          <p className="text-sm font-semibold">On this page</p>
          <ul className="mt-3 space-y-2 border-l text-sm">
            {toc.map((t) => (
              <li key={t.id}>
                <a
                  href={`#${t.id}`}
                  className="-ml-px block border-l border-transparent pl-3 text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground"
                >
                  {t.label}
                </a>
              </li>
            ))}
          </ul>
        </div>
      </nav>
      <div className="min-w-0 space-y-16">{children}</div>
    </Container>
  );
}

export function Section({ id, title, children, className }: { id: string; title: string; children: ReactNode; className?: string }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className={cn("scroll-mt-24", className)}>
      <h2 id={`${id}-title`} className="text-2xl font-semibold tracking-tight sm:text-3xl">
        {title}
      </h2>
      <div className="mt-5">{children}</div>
    </section>
  );
}

/** Body text: readable measure, spacing and link styles for plain elements. */
export function Prose({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "max-w-3xl space-y-4 leading-7 text-muted-foreground",
        "[&_a]:font-medium [&_a]:text-primary [&_a]:underline-offset-4 hover:[&_a]:underline",
        "[&_strong]:font-semibold [&_strong]:text-foreground",
        "[&_h3]:pt-4 [&_h3]:text-lg [&_h3]:font-semibold [&_h3]:text-foreground",
        "[&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:space-y-2 [&_ol]:pl-5",
        "[&_li]:pl-1 [&_li::marker]:text-muted-foreground/60",
        "[&_code]:rounded [&_code]:bg-muted [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.85em] [&_code]:text-foreground",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** A bordered table that scrolls sideways on phones instead of squashing. */
export function DataTable({ head, rows, caption }: { head: string[]; rows: ReactNode[][]; caption: string }) {
  return (
    // Focusable so keyboard users can scroll it on narrow screens.
    <div
      role="region"
      aria-label={caption}
      tabIndex={0}
      className="max-w-full overflow-x-auto rounded-xl border bg-card shadow-sm focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
    >
      <table className="w-full min-w-[36rem] text-left text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead className="bg-muted/60 text-muted-foreground">
          <tr>
            {head.map((h) => (
              <th key={h} scope="col" className="px-4 py-3 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((r, i) => (
            <tr key={i} className="align-top">
              {r.map((c, j) =>
                j === 0 ? (
                  <th key={j} scope="row" className="px-4 py-3 font-medium text-foreground">
                    {c}
                  </th>
                ) : (
                  <td key={j} className="px-4 py-3 text-muted-foreground">
                    {c}
                  </td>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** A tinted note: testnet caveats, draft status. */
export function Callout({ tone = "info", title, children }: { tone?: "info" | "warn"; title: string; children: ReactNode }) {
  return (
    <div
      className={cn(
        "max-w-3xl rounded-xl border p-4 text-sm",
        tone === "warn" ? "border-warn/30 bg-warn-soft" : "border-info/30 bg-info-soft",
      )}
    >
      <p className={cn("font-semibold", tone === "warn" ? "text-warn" : "text-info")}>{title}</p>
      <div className="mt-1 text-foreground/80">{children}</div>
    </div>
  );
}
