import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/** A KPI tile: label, big value, optional context line and icon. */
export function Stat({
  label,
  value,
  hint,
  icon,
  className,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn("gap-1 p-4 shadow-none", className)}>
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>{label}</span>
        {icon && <span className="text-muted-foreground/70 [&_svg]:size-4">{icon}</span>}
      </div>
      {/* On narrow two-column grids a long amount drops its unit to the next line rather than overflow. */}
      <div className="tabular text-xl font-semibold tracking-tight sm:text-2xl [&_.whitespace-nowrap]:whitespace-normal">{value}</div>
      {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
    </Card>
  );
}
