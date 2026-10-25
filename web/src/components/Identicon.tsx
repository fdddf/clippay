import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { hash32 } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * A person or brand: their image if they set one, otherwise a gradient
 * derived from their address (or name) with their initials.
 */
export function Identicon({
  seed,
  name,
  src,
  size = "default",
  square = false,
  className,
}: {
  /** Address or other stable id the colours derive from. */
  seed: string;
  name?: string | null;
  src?: string | null;
  size?: "sm" | "default" | "lg" | "xl";
  /** Brands use rounded squares, people use circles. */
  square?: boolean;
  className?: string;
}) {
  const h = hash32(seed);
  const hue = h % 360;
  const hue2 = (hue + 40 + ((h >>> 9) % 80)) % 360;
  const initials = (name ?? "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
  const sizes = { sm: "size-6 text-[10px]", default: "size-8 text-xs", lg: "size-10 text-sm", xl: "size-14 text-lg" };
  return (
    <Avatar className={cn(sizes[size], square && "rounded-[28%]", className)}>
      {src && <AvatarImage src={src} alt="" className="object-cover" />}
      <AvatarFallback
        className={cn("font-semibold text-white", square && "rounded-[28%]")}
        style={{ background: `linear-gradient(135deg, oklch(0.62 0.15 ${hue}), oklch(0.5 0.16 ${hue2}))` }}
      >
        {initials}
      </AvatarFallback>
    </Avatar>
  );
}
