// Upload an image to /api/media and hand back its hash: a logo or an avatar.
import { useRef, useState } from "react";
import { ImagePlus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { errorMessage } from "@/app/errors";
import { api, mediaUrl } from "@/lib/api";
import { cn } from "@/lib/utils";

const TYPES = ["image/png", "image/jpeg", "image/webp"];
const MAX = 256 * 1024;

export function ImagePicker({
  label,
  hint,
  value,
  onChange,
  round = false,
}: {
  label: string;
  hint: string;
  /** Media hash, or null. */
  value: string | null;
  onChange: (hash: string | null) => void;
  /** Circle (people) instead of a rounded square (brands). */
  round?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function pick(file: File | undefined) {
    if (!file) return;
    setError(null);
    if (!TYPES.includes(file.type)) return setError("Use a PNG, JPEG or WebP image");
    if (file.size > MAX) return setError("The image must be 256 KB or smaller");
    setBusy(true);
    try {
      onChange((await api.uploadImage(file)).hash);
    } catch (e) {
      setError(await errorMessage(e));
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }
  return (
    <div className="space-y-1.5">
      <p className="text-sm leading-none font-medium">
        {label} <span className="font-normal text-muted-foreground">(optional)</span>
      </p>
      <div className="flex items-center gap-3">
        <div className={cn("grid size-14 shrink-0 place-items-center overflow-hidden border bg-muted text-muted-foreground", round ? "rounded-full" : "rounded-[28%]")}>
          {busy ? (
            <Loader2 className="size-5 animate-spin" aria-hidden="true" />
          ) : value ? (
            <img src={mediaUrl(value)!} alt={`Your ${label.toLowerCase()}`} className="size-full object-cover" />
          ) : (
            <ImagePlus className="size-5" aria-hidden="true" />
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => input.current?.click()} disabled={busy}>
            {value ? "Replace" : "Upload"}
          </Button>
          {value && (
            <Button type="button" variant="ghost" size="sm" onClick={() => onChange(null)} disabled={busy}>
              Remove
            </Button>
          )}
        </div>
        <input
          ref={input}
          type="file"
          accept={TYPES.join(",")}
          className="sr-only"
          tabIndex={-1}
          aria-label={`Upload ${label.toLowerCase()}`}
          onChange={(e) => void pick(e.target.files?.[0])}
        />
      </div>
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">{hint}</p>
      )}
    </div>
  );
}
