import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function EmptyState({
  icon,
  title,
  description,
  action,
  heading: Heading = "h3",
  className,
}: {
  icon?: ReactNode;
  title: string;
  /** The title's element; "h1" when the empty state is the whole page. */
  heading?: "h1" | "h2" | "h3";
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center gap-3 rounded-xl border border-dashed px-6 py-12 text-center", className)}>
      {icon && (
        <div className="grid size-12 place-items-center rounded-full bg-muted text-muted-foreground [&_svg]:size-5">
          {icon}
        </div>
      )}
      <div className="space-y-1">
        <Heading className="font-semibold">{title}</Heading>
        {description && <p className="mx-auto max-w-sm text-sm text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  );
}

/** Something failed to load: says so plainly and offers a retry. */
export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center gap-x-3 gap-y-1 self-start rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm"
    >
      <span className="text-destructive">{message}</span>
      {onRetry && (
        <button type="button" onClick={onRetry} className="font-medium text-foreground underline underline-offset-2">
          Try again
        </button>
      )}
    </div>
  );
}
