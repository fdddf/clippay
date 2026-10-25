import { cn } from "@/lib/utils";

/** The ClipPay mark: a play button and the coin it earns. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true" className={cn("size-7 shrink-0", className)}>
      <defs>
        <linearGradient id="clippay-mark" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#6366f1" />
          <stop offset="1" stopColor="#4338ca" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill="url(#clippay-mark)" />
      <path
        d="M19 19.5c0-2.3 2.5-3.7 4.5-2.5l17.2 10.2c2 1.2 2 4.1 0 5.3L23.5 42.7c-2 1.2-4.5-.2-4.5-2.5z"
        fill="#fff"
      />
      <circle cx="47.5" cy="46.5" r="6.5" fill="#34d399" />
    </svg>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2 text-[17px] font-semibold tracking-tight", className)}>
      <LogoMark />
      ClipPay
    </span>
  );
}
