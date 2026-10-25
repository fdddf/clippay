// Step 1: what creators should make, and who's asking.
import { useRef, useState } from "react";
import { ImagePlus, Loader2, Lock, Plus, Trash2 } from "lucide-react";
import { Field } from "@/components/Field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Prose } from "@/landing/Content";
import { api, mediaUrl } from "@/lib/api";
import { CATEGORIES, CATEGORY_LABEL, LIMITS, PLATFORMS, PLATFORM_LABEL } from "@/lib/brief";
import { Markdown } from "@/lib/markdown";
import { errorMessage } from "../errors";
import { DISCLOSURE_RULE, TITLE_MAX, type Draft, type Errors } from "./draft";

const LOGO_TYPES = ["image/png", "image/jpeg", "image/webp"];
const LOGO_MAX = 256 * 1024;

const BODY_TEMPLATE = `**Goal:** what the clips should achieve.

**What to make**
- The format, length and tone you're after
- What to show, and anything to avoid

**Must include**
- #ad and your clippay: tag in the description`;

function LogoPicker({ value, onChange }: { value: string | null; onChange: (hash: string | null) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function pick(file: File | undefined) {
    if (!file) return;
    setError(null);
    if (!LOGO_TYPES.includes(file.type)) return setError("Use a PNG, JPEG or WebP image");
    if (file.size > LOGO_MAX) return setError("The image must be 256 KB or smaller");
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
        Logo <span className="font-normal text-muted-foreground">(optional)</span>
      </p>
      <div className="flex items-center gap-3">
        <div className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-[28%] border bg-muted text-muted-foreground">
          {busy ? (
            <Loader2 className="size-5 animate-spin" aria-hidden="true" />
          ) : value ? (
            <img src={mediaUrl(value)!} alt="Your logo" className="size-full object-cover" />
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
          accept={LOGO_TYPES.join(",")}
          className="sr-only"
          tabIndex={-1}
          aria-label="Upload logo"
          onChange={(e) => void pick(e.target.files?.[0])}
        />
      </div>
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">Square, PNG/JPEG/WebP, up to 256 KB. Shown on your campaign card.</p>
      )}
    </div>
  );
}

export function BriefStep({
  d,
  set,
  errors,
}: {
  d: Draft;
  set: <K extends keyof Draft>(k: K, v: Draft[K]) => void;
  errors: Errors;
}) {
  const setRule = (i: number, v: string) => set("rules", d.rules.map((r, j) => (j === i ? v : r)));
  return (
    <div className="space-y-8">
      <section aria-labelledby="brief-brand" className="space-y-5">
        <h2 id="brief-brand" className="text-lg font-semibold">
          Campaign
        </h2>
        <Field id="title" label="Title" error={errors.title} counter={`${d.title.length}/${TITLE_MAX}`} hint="Creators see this first — say what and for whom.">
          <Input value={d.title} maxLength={TITLE_MAX} onChange={(e) => set("title", e.target.value)} placeholder="e.g. Kitebase — 60-second app walkthrough" />
        </Field>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Field id="brandName" label="Brand name" error={errors.brandName}>
            <Input value={d.brandName} maxLength={LIMITS.name} onChange={(e) => set("brandName", e.target.value)} placeholder="e.g. Kitebase" />
          </Field>
          <Field id="website" label="Website" optional error={errors.website}>
            <Input type="url" value={d.website} onChange={(e) => set("website", e.target.value)} placeholder="https://" />
          </Field>
        </div>
        <LogoPicker value={d.logo} onChange={(h) => set("logo", h)} />
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="platform">Platform</Label>
            <Select value={d.platform} onValueChange={(v) => set("platform", v as Draft["platform"])}>
              <SelectTrigger id="platform" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PLATFORMS.map((p) => (
                  <SelectItem key={p} value={p}>
                    {PLATFORM_LABEL[p]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="category">Category</Label>
            <Select value={d.category} onValueChange={(v) => set("category", v as Draft["category"])}>
              <SelectTrigger id="category" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {CATEGORY_LABEL[c]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </section>

      <section aria-labelledby="brief-brief" className="space-y-5">
        <h2 id="brief-brief" className="text-lg font-semibold">
          Brief
        </h2>
        <Field id="summary" label="Summary" error={errors.summary} counter={`${d.summary.length}/${LIMITS.summary}`} hint="One or two sentences, shown on the campaign page.">
          <Textarea rows={2} value={d.summary} maxLength={LIMITS.summary} onChange={(e) => set("summary", e.target.value)} placeholder="e.g. Honest 60-second walkthroughs of Kitebase, the shared packing list for group trips." />
        </Field>
        <div className="space-y-1.5">
          <div className="flex items-baseline justify-between gap-3">
            <label htmlFor="body" className="text-sm leading-none font-medium">
              Full brief
            </label>
            {!d.body.trim() && (
              <button type="button" className="text-xs font-medium text-primary hover:underline" onClick={() => set("body", BODY_TEMPLATE)}>
                Start from a template
              </button>
            )}
          </div>
          <Tabs defaultValue="write">
            <TabsList>
              <TabsTrigger value="write">Write</TabsTrigger>
              <TabsTrigger value="preview">Preview</TabsTrigger>
            </TabsList>
            <TabsContent value="write">
              <Textarea
                id="body"
                rows={10}
                value={d.body}
                maxLength={LIMITS.body}
                onChange={(e) => set("body", e.target.value)}
                aria-invalid={errors.body ? true : undefined}
                aria-describedby={errors.body ? "body-error" : "body-hint"}
                className="font-mono text-sm"
              />
            </TabsContent>
            <TabsContent value="preview">
              <div className="min-h-56 rounded-md border p-4">
                {d.body.trim() ? (
                  <Prose>
                    <Markdown source={d.body} className="space-y-3" />
                  </Prose>
                ) : (
                  <p className="text-sm text-muted-foreground">Nothing to preview yet.</p>
                )}
              </div>
            </TabsContent>
          </Tabs>
          {errors.body ? (
            <p id="body-error" className="text-xs text-destructive">
              {errors.body}
            </p>
          ) : (
            <p id="body-hint" className="text-xs text-muted-foreground">
              Markdown: **bold**, *italic*, lists with "- ", links as [text](https://…). It can't be edited once the
              campaign launches.
            </p>
          )}
        </div>

        <fieldset className="space-y-3">
          <legend className="text-sm font-medium">Rules every post must follow</legend>
          <p className="flex items-center gap-2 rounded-md border bg-muted/50 px-3 py-2 text-sm">
            <Lock className="size-3.5 text-muted-foreground" aria-hidden="true" />
            {DISCLOSURE_RULE}
            <span className="ml-auto text-xs text-muted-foreground">always on</span>
          </p>
          {d.rules.map((r, i) => (
            <div key={i} className="flex items-start gap-2">
              <Field id={`rule-${i}`} label={<span className="sr-only">Rule {i + 2}</span>} error={errors[`rules.${i}`]} className="flex-1">
                <Input value={r} maxLength={LIMITS.rule} onChange={(e) => setRule(i, e.target.value)} placeholder="e.g. Show the app's home screen in the first 5 seconds" />
              </Field>
              <Button type="button" variant="ghost" size="icon" onClick={() => set("rules", d.rules.filter((_, j) => j !== i))} aria-label={`Remove rule ${i + 2}`}>
                <Trash2 />
              </Button>
            </div>
          ))}
          {d.rules.length < LIMITS.rules - 1 && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                set("rules", [...d.rules, ""]);
                const i = d.rules.length;
                requestAnimationFrame(() => document.getElementById(`rule-${i}`)?.focus());
              }}
            >
              <Plus aria-hidden="true" />
              Add a rule
            </Button>
          )}
        </fieldset>

        <Field id="exampleUrl" label="Example or source video" optional error={errors.exampleUrl} hint="A post you like, or the footage creators should clip.">
          <Input type="url" value={d.exampleUrl} onChange={(e) => set("exampleUrl", e.target.value)} placeholder="https://youtube.com/…" />
        </Field>
      </section>
    </div>
  );
}
