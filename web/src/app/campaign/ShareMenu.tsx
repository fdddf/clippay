// Share a campaign: copy the link, post it, or download its share image.
import { Check, Download, Link2, Send, Share2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Campaign } from "@/lib/api-types";
import { config } from "@/lib/network";

export function ShareMenu({ c, variant = "outline" }: { c: Campaign; variant?: "default" | "outline" }) {
  const [copied, setCopied] = useState(false);
  const url = `${location.origin}/c/${c.id}`;
  const text = `${c.title} — get paid per verified view on ClipPay`;
  const enc = encodeURIComponent;
  const image = `${config.verifierUrl}/og/c/${c.id}.png`;

  const copy = async () => {
    await navigator.clipboard.writeText(url).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant={variant}>
          <Share2 aria-hidden="true" />
          Share campaign
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuItem onSelect={(e) => (e.preventDefault(), void copy())}>
          {copied ? <Check /> : <Link2 />}
          {copied ? "Link copied" : "Copy link"}
        </DropdownMenuItem>
        {typeof navigator.share === "function" && (
          <DropdownMenuItem onSelect={() => void navigator.share({ title: c.title, text, url }).catch(() => {})}>
            <Share2 />
            Share…
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <a href={`https://x.com/intent/post?text=${enc(text)}&url=${enc(url)}`} target="_blank" rel="noreferrer">
            <Send />
            Post on X
          </a>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <a href={`https://t.me/share/url?url=${enc(url)}&text=${enc(text)}`} target="_blank" rel="noreferrer">
            <Send />
            Telegram
          </a>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <a href={`https://wa.me/?text=${enc(`${text} ${url}`)}`} target="_blank" rel="noreferrer">
            <Send />
            WhatsApp
          </a>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <a href={image} download={`clippay-campaign-${c.id}.png`}>
            <Download />
            Download share image
          </a>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
