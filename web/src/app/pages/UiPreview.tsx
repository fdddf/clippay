// Dev-only design-system sheet (/_ui): every component in every state, for
// visual review in light/dark and at phone width.
import { useState } from "react";
import { Inbox, Wallet } from "lucide-react";
import { toast } from "sonner";
import { AddressChip } from "@/components/AddressChip";
import { Amount } from "@/components/Amount";
import { DataList } from "@/components/DataList";
import { EmptyState, ErrorState } from "@/components/EmptyState";
import { Identicon } from "@/components/Identicon";
import { Logo } from "@/components/Logo";
import { Stat } from "@/components/Stat";
import { StatusPill, TestnetBadge, type Status } from "@/components/StatusPill";
import { Timeline } from "@/components/Timeline";
import { TxProgress } from "@/components/TxProgress";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const A = "GBZGPQI5DJ5HUBNNSUY5GKRTPXFAACYPDDZVXYLAEYMQY57AUIAUT2DO";
const B = "CAQMHWWXOLW6YFDLGP5L2CNCI4EBKBD6Z6CFSECXA5MGC3RDZ7MRILOH";
const rows = [
  { who: A, name: "Mia Torres", views: 12_400n, paid: 94_000_000n, status: "paid" as Status },
  { who: B, name: null, views: 3_150n, paid: 23_940_000n, status: "hold" as Status },
];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">{title}</h2>
      {children}
    </section>
  );
}

export default function UiPreview() {
  const [open, setOpen] = useState(false);
  return (
    <main className="mx-auto max-w-5xl space-y-10 px-4 py-10">
      <div className="flex items-center justify-between">
        <Logo />
        <TestnetBadge />
      </div>

      <Section title="Buttons">
        <div className="flex flex-wrap gap-2">
          <Button>Launch a campaign</Button>
          <Button variant="secondary">Browse campaigns</Button>
          <Button variant="outline">Copy link</Button>
          <Button variant="ghost">Cancel</Button>
          <Button variant="destructive">Refund</Button>
          <Button disabled>Disabled</Button>
          <Button size="lg">Large</Button>
          <Button size="sm" onClick={() => toast.success("Paid 9.40 XLM", { description: "View receipt" })}>
            Toast
          </Button>
        </div>
      </Section>

      <Section title="Status">
        <div className="flex flex-wrap gap-2">
          {(["live", "ending", "settling", "closed", "spent", "hold", "review", "paid", "pending", "capped"] as Status[]).map(
            (s) => <StatusPill key={s} status={s} />,
          )}
        </div>
      </Section>

      <Section title="Identity and amounts">
        <div className="flex flex-wrap items-center gap-6">
          <Identicon seed={A} name="Pixel Harbor" square size="xl" />
          <Identicon seed={B} size="lg" />
          <AddressChip address={A} name="Mia Torres" />
          <AddressChip address={B} />
          <AddressChip address={B} you />
        </div>
        <div className="flex flex-wrap items-baseline gap-6 text-lg">
          <Amount units={1_234_567_890n} />
          <Amount units={94_000_000n} tone="money" sign />
          <Amount units={5n} maxFrac={7} />
        </div>
      </Section>

      <Section title="Stats">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Budget locked" value={<Amount units={6_630_000_000n} maxFrac={0} />} icon={<Wallet />} />
          <Stat label="Paid to creators" value={<Amount units={1_296_400_000n} tone="money" />} hint="+12.4 today" />
          <Stat label="Verified views" value="156,108" />
          <Stat label="Creators" value="8" />
        </div>
      </Section>

      <Section title="Transaction progress">
        <div className="grid gap-4 md:grid-cols-3">
          <Card className="p-4"><TxProgress state={{ step: "sign" }} signLabel="Confirm with Face ID" /></Card>
          <Card className="p-4"><TxProgress state={{ step: "confirm", done: true, hash: "ca49f1e3823936f10341881515aa8c43f456dd19383994cc31ea2c79612fd557" }} /></Card>
          <Card className="p-4"><TxProgress state={{ step: "submit", error: "The network took too long — please try again" }} /></Card>
        </div>
      </Section>

      <Section title="Timeline">
        <Card className="p-5">
          <Timeline
            items={[
              { key: "s", title: "Submitted", time: "Oct 25", state: "done" },
              { key: "v", title: "Views checked", detail: "12,400 views", time: "2 min ago", state: "done" },
              { key: "h", title: "On hold", detail: "Add #ad to the description", state: "warn" },
              { key: "p", title: "Next payout", state: "pending" },
            ]}
          />
        </Card>
      </Section>

      <Section title="Data list">
        <Card className="p-4">
          <DataList
            caption="Creators"
            rows={rows}
            rowKey={(r) => r.who}
            columns={[
              { key: "who", header: "Creator", mobile: "primary", cell: (r) => <AddressChip address={r.who} name={r.name} /> },
              { key: "views", header: "Views", align: "right", cell: (r) => r.views.toLocaleString("en-US") },
              { key: "paid", header: "Paid", align: "right", cell: (r) => <Amount units={r.paid} tone="money" /> },
              { key: "status", header: "Status", align: "right", cell: (r) => <StatusPill status={r.status} /> },
            ]}
          />
        </Card>
      </Section>

      <Section title="Forms, tabs, dialog">
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Budget</CardTitle>
              <CardDescription>Locked in escrow until paid out or refunded.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="b">Total budget</Label>
                <Input id="b" defaultValue="400" />
              </div>
              <Progress value={42} aria-label="Budget spent" />
            </CardContent>
          </Card>
          <Card className="p-4">
            <Tabs defaultValue="brief">
              <TabsList>
                <TabsTrigger value="brief">Brief</TabsTrigger>
                <TabsTrigger value="rules">Rules</TabsTrigger>
                <TabsTrigger value="board">Leaderboard</TabsTrigger>
              </TabsList>
              <TabsContent value="brief" className="pt-3 text-sm text-muted-foreground">Brief content…</TabsContent>
              <TabsContent value="rules" className="pt-3 text-sm text-muted-foreground">Rules…</TabsContent>
              <TabsContent value="board" className="pt-3 text-sm text-muted-foreground">Leaderboard…</TabsContent>
            </Tabs>
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" className="mt-4">Open dialog</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Sign in to ClipPay</DialogTitle>
                  <DialogDescription>Creators use Face ID. Brands connect a wallet.</DialogDescription>
                </DialogHeader>
              </DialogContent>
            </Dialog>
          </Card>
        </div>
      </Section>

      <Section title="Loading, empty, error">
        <div className="grid gap-4 md:grid-cols-3">
          <Card className="space-y-3 p-4">
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-8 w-1/2" />
            <Skeleton className="h-2 w-full" />
          </Card>
          <EmptyState icon={<Inbox />} title="No campaigns match" description="Try clearing a filter." action={<Button size="sm" variant="outline">Clear filters</Button>} />
          <ErrorState message="Couldn't load campaigns." onRetry={() => {}} />
        </div>
      </Section>
    </main>
  );
}
