// /terms and /privacy. Drafts for the testnet preview; to be reviewed before
// any mainnet launch.
import type { ReactNode } from "react";
import { config } from "@/lib/network";
import { Callout, PageIntro, Prose, Section, WithToc } from "../Content";

const UPDATED = "October 25, 2026";
const feePct = `${config.feeBps / 100}%`;
const issues = `${config.repoUrl}/issues`;

function Draft({ children }: { children: ReactNode }) {
  return (
    <div className="mt-6 max-w-3xl">
      <Callout tone="warn" title="Draft for the testnet preview">
        {children}
      </Callout>
    </div>
  );
}

export function Terms() {
  const toc = [
    { id: "preview", label: "The preview" },
    { id: "wallets", label: "Your wallet" },
    { id: "brands", label: "Brands" },
    { id: "creators", label: "Creators" },
    { id: "conduct", label: "Not allowed" },
    { id: "fees", label: "Fees" },
    { id: "liability", label: "No warranty" },
    { id: "changes", label: "Changes and contact" },
  ];
  return (
    <>
      <PageIntro eyebrow="Legal" title="Terms of use" lede={<>Last updated {UPDATED}.</>}>
        <Draft>
          These terms cover the testnet preview of ClipPay, where nothing of real value changes hands. They will be
          rewritten and reviewed before ClipPay handles real money.
        </Draft>
      </PageIntro>
      <WithToc toc={toc}>
        <Section id="preview" title="The preview">
          <Prose>
            <p>
              ClipPay runs on Stellar's test network. Testnet tokens have no monetary value, the network may be reset,
              and features can change or disappear without notice. By using ClipPay you accept that it's an early
              preview, offered as is.
            </p>
          </Prose>
        </Section>
        <Section id="wallets" title="Your wallet">
          <Prose>
            <p>
              Your wallet is yours. A passkey wallet is controlled by the passkey on your device, and a Freighter wallet
              by its keys; ClipPay never holds them and can't recover a wallet if you lose access. Keep your device and
              passkey safe.
            </p>
          </Prose>
        </Section>
        <Section id="brands" title="Brands">
          <Prose>
            <ul>
              <li>You're responsible for your brief and for making sure what you ask creators to make is lawful.</li>
              <li>
                A campaign's budget is locked in the contract until the campaign settles. Its rate, cap and deadline
                can't be changed once it's created.
              </li>
              <li>Payouts to creators are final; unspent budget can be refunded after settlement.</li>
            </ul>
          </Prose>
        </Section>
        <Section id="creators" title="Creators">
          <Prose>
            <ul>
              <li>Only submit posts you made and have the right to publish.</li>
              <li>Follow the brief, the platform's rules and the law, including disclosing sponsorship with #ad.</li>
              <li>
                Posts can be held for review if they look unusual. ClipPay may decline to pay for posts that break
                these terms.
              </li>
              <li>You're responsible for any taxes on what you earn.</li>
            </ul>
          </Prose>
        </Section>
        <Section id="conduct" title="Not allowed">
          <Prose>
            <ul>
              <li>Buying, faking or inflating views, or using bots or view farms.</li>
              <li>Submitting someone else's post or impersonating another person or brand.</li>
              <li>Content that is illegal, hateful, or infringes someone else's rights.</li>
              <li>Attacking or overloading the service, the contract or other users.</li>
            </ul>
          </Prose>
        </Section>
        <Section id="fees" title="Fees">
          <Prose>
            <p>
              ClipPay takes {feePct} of each payout to a creator. There is no fee on deposits, top-ups or refunds. A
              campaign's fee is fixed when it's created.
            </p>
          </Prose>
        </Section>
        <Section id="liability" title="No warranty">
          <Prose>
            <p>
              The preview is provided without warranties of any kind. To the extent the law allows, ClipPay isn't liable
              for losses arising from its use, including bugs in the contract, the verifier or third-party services
              such as wallets, view platforms and anchors.
            </p>
          </Prose>
        </Section>
        <Section id="changes" title="Changes and contact">
          <Prose>
            <p>
              We'll update this page when the terms change. Questions? Open an issue on{" "}
              <a href={issues} target="_blank" rel="noreferrer">
                GitHub
              </a>
              .
            </p>
          </Prose>
        </Section>
      </WithToc>
    </>
  );
}

export function Privacy() {
  const toc = [
    { id: "public", label: "Public on the blockchain" },
    { id: "stored", label: "What ClipPay stores" },
    { id: "device", label: "On your device" },
    { id: "others", label: "Other services" },
    { id: "choices", label: "Your choices" },
    { id: "contact", label: "Contact" },
  ];
  return (
    <>
      <PageIntro
        eyebrow="Legal"
        title="Privacy policy"
        lede={<>Last updated {UPDATED}. ClipPay collects as little as it can: no email, no cookies, no ad trackers.</>}
      >
        <Draft>
          This policy describes the testnet preview. It will be reviewed before ClipPay handles real money or
          personal data beyond what's listed here.
        </Draft>
      </PageIntro>
      <WithToc toc={toc}>
        <Section id="public" title="Public on the blockchain">
          <Prose>
            <p>
              Anything you do through the contract is recorded on Stellar, which is public and permanent. That
              includes your wallet address, the campaigns you create or join, the links you submit, the view counts
              you're paid for and every payment. ClipPay can't delete it.
            </p>
          </Prose>
        </Section>
        <Section id="stored" title="What ClipPay stores">
          <Prose>
            <ul>
              <li>
                <strong>Your profile</strong>, if you set one: a display name, picture and short bio, linked to your
                wallet address.
              </li>
              <li>
                <strong>Briefs and images</strong> that brands publish. They're public and addressed by their hash.
              </li>
              <li>
                <strong>Post checks</strong>: the public view, like and channel figures the verifier reads for each
                submitted post.
              </li>
              <li>
                <strong>Sign-in requests</strong>, deleted as soon as they're used or expire.
              </li>
            </ul>
            <p>
              ClipPay is hosted on Cloudflare, which processes IP addresses to deliver and protect the site and keeps
              request logs for a short time. ClipPay uses IP addresses only to rate-limit requests, in memory.
            </p>
          </Prose>
        </Section>
        <Section id="device" title="On your device">
          <Prose>
            <p>
              Your browser keeps your sign-in session and which wallet you last used in local storage. Passkeys stay in
              your device's secure storage; only their public key goes on-chain, as part of your wallet. There are no
              cookies and no analytics scripts.
            </p>
          </Prose>
        </Section>
        <Section id="others" title="Other services">
          <Prose>
            <ul>
              <li>
                <strong>View platforms</strong> such as YouTube are queried for the public stats of posts you submit.
              </li>
              <li>
                <strong>Stellar RPC and explorers</strong> serve chain data; links to Stellar Expert open their site.
              </li>
              <li>
                <strong>Anchors</strong>: when you cash out, you deal with the anchor directly, under its own privacy
                policy and identity checks.
              </li>
            </ul>
          </Prose>
        </Section>
        <Section id="choices" title="Your choices">
          <Prose>
            <p>
              You can edit or clear your profile at any time from your dashboard settings. On-chain records can't be
              changed or removed by anyone, including ClipPay.
            </p>
          </Prose>
        </Section>
        <Section id="contact" title="Contact">
          <Prose>
            <p>
              Questions about privacy? Open an issue on{" "}
              <a href={issues} target="_blank" rel="noreferrer">
                GitHub
              </a>
              .
            </p>
          </Prose>
        </Section>
      </WithToc>
    </>
  );
}
