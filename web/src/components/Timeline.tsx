import type { ReactNode } from "react";
import { Check, Circle, Loader2, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";

export interface TimelineItem {
  key: string;
  title: ReactNode;
  detail?: ReactNode;
  time?: ReactNode;
  state: "done" | "current" | "pending" | "warn";
}

/** A vertical lifecycle, e.g. submitted → views checked → paid. */
export function Timeline({ items, className }: { items: TimelineItem[]; className?: string }) {
  return (
    <ol className={cn("relative space-y-4", className)}>
      {items.map((it, i) => (
        <li key={it.key} className="relative flex gap-3">
          {i < items.length - 1 && (
            <span className="absolute top-6 bottom-[-1rem] left-[11px] w-px bg-border" aria-hidden="true" />
          )}
          <span
            className={cn(
              "relative z-10 grid size-6 shrink-0 place-items-center rounded-full border bg-background",
              it.state === "done" && "border-transparent bg-ok text-white dark:text-background",
              it.state === "current" && "border-primary text-primary",
              it.state === "warn" && "border-transparent bg-warn text-white dark:text-background",
              it.state === "pending" && "text-muted-foreground",
            )}
            aria-hidden="true"
          >
            {it.state === "done" ? (
              <Check className="size-3.5" />
            ) : it.state === "current" ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : it.state === "warn" ? (
              <TriangleAlert className="size-3.5" />
            ) : (
              <Circle className="size-2 fill-current" />
            )}
          </span>
          <div className="min-w-0 flex-1 pb-1">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3">
              <span className={cn("text-sm font-medium", it.state === "pending" && "text-muted-foreground")}>
                {it.title}
              </span>
              {it.time && <span className="text-xs text-muted-foreground">{it.time}</span>}
            </div>
            {it.detail && <div className="mt-0.5 text-sm text-muted-foreground">{it.detail}</div>}
          </div>
        </li>
      ))}
    </ol>
  );
}
