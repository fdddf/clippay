// Profile (name, picture, bio — saved after the wallet proves it's you) and
// what to know about the wallet itself.
import { useEffect, useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { KeyRound, Loader2, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { Field } from "@/components/Field";
import { ImagePicker } from "@/components/ImagePicker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import { errorMessage } from "../errors";
import { keys } from "../queries";
import { useSession } from "../session";
import { useTitle } from "../useTitle";
import { PageHeader, useDashboard } from "./Layout";

const NAME_MAX = 40;
const BIO_MAX = 160;

export default function Settings() {
  useTitle("Settings");
  const { wallet, account } = useDashboard();
  const { session, token } = useSession();
  const queryClient = useQueryClient();
  const p = account.profile;
  const [name, setName] = useState(p?.name ?? "");
  const [bio, setBio] = useState(p?.bio ?? "");
  const [avatar, setAvatar] = useState<string | null>(p?.avatar?.split("/").pop() ?? null);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    setName(p?.name ?? "");
    setBio(p?.bio ?? "");
    setAvatar(p?.avatar?.split("/").pop() ?? null);
  }, [p?.name, p?.bio, p?.avatar]);
  const dirty = name !== (p?.name ?? "") || bio !== (p?.bio ?? "") || avatar !== (p?.avatar?.split("/").pop() ?? null);

  async function save(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const t = await token();
      await api.updateProfile(t, { name: name.trim() || null, avatar, bio: bio.trim() || null });
      await queryClient.invalidateQueries({ queryKey: keys.account(wallet.address) });
      void queryClient.invalidateQueries({ queryKey: keys.campaigns });
      toast.success("Profile saved");
    } catch (err) {
      toast.error("Couldn't save your profile", { description: await errorMessage(err) });
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PageHeader title="Settings" />
      <form onSubmit={save} className="rounded-xl border bg-card p-5 shadow-sm sm:p-6">
        <h2 className="font-semibold">Profile</h2>
        <p className="mt-1 text-sm text-muted-foreground">Shown next to your posts and campaigns instead of your wallet address.</p>
        <div className="mt-6 max-w-lg space-y-5">
          <Field id="profile-name" label="Display name" counter={`${name.length}/${NAME_MAX}`}>
            <Input value={name} maxLength={NAME_MAX} onChange={(e) => setName(e.target.value)} placeholder="e.g. Mia Torres" />
          </Field>
          <ImagePicker label="Picture" hint="Square works best. PNG, JPEG or WebP up to 256 KB." value={avatar} onChange={setAvatar} round />
          <Field id="profile-bio" label="Bio" optional counter={`${bio.length}/${BIO_MAX}`}>
            <Textarea rows={3} value={bio} maxLength={BIO_MAX} onChange={(e) => setBio(e.target.value)} placeholder="What you make, where you post" />
          </Field>
        </div>
        <div className="mt-6 flex flex-wrap items-center gap-3 border-t pt-5">
          <Button type="submit" disabled={!dirty || saving}>
            {saving && <Loader2 className="animate-spin" aria-hidden="true" />}
            Save profile
          </Button>
          <p className="text-xs text-muted-foreground">
            {session ? "Signed in — saving needs no signature." : "Saving asks your wallet to sign once, to prove it's you. It costs nothing."}
          </p>
        </div>
      </form>

      <section aria-labelledby="security-title" className="mt-8 rounded-xl border bg-card p-5 shadow-sm sm:p-6">
        <h2 id="security-title" className="font-semibold">
          Wallet security
        </h2>
        <ul className="mt-4 space-y-4 text-sm">
          <li className="flex gap-3">
            <KeyRound className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span>
              {wallet.kind === "passkey"
                ? "Your wallet is controlled by a passkey stored on this device (and synced by your password manager, if it syncs passkeys). ClipPay can't move your funds."
                : "Your wallet is controlled by Freighter. ClipPay can't move your funds."}
            </span>
          </li>
          {wallet.kind === "passkey" && (
            <li className="flex gap-3">
              <ShieldAlert className="mt-0.5 size-4 shrink-0 text-warn" aria-hidden="true" />
              <span>
                Recovery isn't available yet: if you lose the passkey, the wallet can't be restored. Cash out or move funds you
                want to keep.
              </span>
            </li>
          )}
        </ul>
      </section>
    </>
  );
}
