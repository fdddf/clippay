import { CircleCheck, CircleDot, Clock, Flag, Hourglass, Lock, PauseCircle } from "lucide-react";
import { cn } from "@/lib/utils";

const STYLES = {
  live: { label: "Live", icon: CircleDot, cls: "bg-ok-soft text-ok" },
  ending: { label: "Ending soon", icon: Hourglass, cls: "bg-warn-soft text-warn" },
  settling: { label: "Final payouts", icon: Clock, cls: "bg-info-soft text-info" },
  closed: { label: "Closed", icon: Lock, cls: "bg-muted text-muted-foreground" },
  spent: { label: "Budget spent", icon: CircleCheck, cls: "bg-muted text-muted-foreground" },
  hold: { label: "On hold", icon: PauseCircle, cls: "bg-warn-soft text-warn" },
  review: { label: "In review", icon: Flag, cls: "bg-warn-soft text-warn" },
  paid: { label: "Paid", icon: CircleCheck, cls: "bg-money-soft text-money" },
  pending: { label: "Checking views", icon: Clock, cls: "bg-info-soft text-info" },
  capped: { label: "Max earned", icon: CircleCheck, cls: "bg-money-soft text-money" },
} as const;

export type Status = keyof typeof STYLES;

export function StatusPill({ status, label, className }: { status: Status; label?: string; className?: string }) {
  const s = STYLES[status];
  const Icon = s.icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        s.cls,
        className,
      )}
    >
      <Icon className="size-3" aria-hidden="true" />
      {label ?? s.label}
    </span>
  );
}

export function TestnetBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border border-testnet/30 bg-testnet-soft px-2 py-0.5 text-[11px] font-semibold tracking-wide text-testnet uppercase",
        className,
      )}
    >
      Testnet
    </span>
  );
}
