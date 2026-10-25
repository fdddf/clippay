import { formatUnits } from "@/lib/format";
import { config } from "@/lib/network";
import { cn } from "@/lib/utils";

/** A token amount: tabular digits, consistent decimals, unit in a lighter weight. */
export function Amount({
  units,
  decimals = config.tokenDecimals,
  symbol = config.tokenSymbol,
  maxFrac = 2,
  minFrac,
  tone,
  sign = false,
  className,
}: {
  units: bigint;
  decimals?: number;
  symbol?: string | null;
  maxFrac?: number;
  /** Defaults to 2 (or `maxFrac` if smaller). */
  minFrac?: number;
  /** "money" colours earnings. */
  tone?: "money" | "muted";
  /** Prefix positive amounts with "+". */
  sign?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "tabular whitespace-nowrap",
        tone === "money" && "text-money",
        tone === "muted" && "text-muted-foreground",
        className,
      )}
    >
      {sign && units > 0n ? "+" : ""}
      {formatUnits(units, decimals, maxFrac, minFrac)}
      {symbol && <span className="ml-1 text-[0.8em] font-normal text-muted-foreground">{symbol}</span>}
    </span>
  );
}
