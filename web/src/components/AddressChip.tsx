import { useState } from "react";
import { Check, Copy, ExternalLink } from "lucide-react";
import { Identicon } from "@/components/Identicon";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { explorer } from "@/lib/network";
import { shortAddress } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Who someone is: avatar + display name (or a short address), with the full
 * address on hover, copy, and a link to the block explorer.
 */
export function AddressChip({
  address,
  name,
  avatar,
  you = false,
  square = false,
  size = "default",
  actions = true,
  className,
}: {
  address: string;
  name?: string | null;
  avatar?: string | null;
  /** Shows "You" instead of the name. */
  you?: boolean;
  square?: boolean;
  size?: "sm" | "default";
  /** Copy and explorer buttons. */
  actions?: boolean;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const label = you ? "You" : name || shortAddress(address);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked: the tooltip still shows the address */
    }
  };

  return (
    <span className={cn("group/chip inline-flex min-w-0 items-center gap-2", className)}>
      <Identicon seed={address} name={name ?? undefined} src={avatar} square={square} size={size === "sm" ? "sm" : "default"} />
      <Tooltip>
        <TooltipTrigger asChild>
          <span className={cn("truncate font-medium", size === "sm" ? "text-sm" : "text-sm")} tabIndex={0}>
            {label}
          </span>
        </TooltipTrigger>
        <TooltipContent className="font-mono text-xs break-all max-w-80">{address}</TooltipContent>
      </Tooltip>
      {actions && (
        <span className="inline-flex shrink-0 items-center opacity-60 transition-opacity group-hover/chip:opacity-100 focus-within:opacity-100">
          <button
            type="button"
            onClick={copy}
            className="rounded p-1 text-muted-foreground hover:text-foreground"
            aria-label={copied ? "Address copied" : `Copy address ${address}`}
          >
            {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
          </button>
          <a
            href={explorer.account(address)}
            target="_blank"
            rel="noreferrer"
            className="rounded p-1 text-muted-foreground hover:text-foreground"
            aria-label="View on Stellar Expert"
          >
            <ExternalLink className="size-3.5" />
          </a>
        </span>
      )}
    </span>
  );
}
