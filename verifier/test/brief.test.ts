import { test } from "node:test";
import assert from "node:assert/strict";
import { briefHash, canonicalJson, hashFromBriefUrl, validateBrief } from "../../web/src/lib/brief.ts";

const good = {
  brand: { name: "Kitebase", logo: null, website: "https://kitebase.example" },
  platform: "youtube",
  category: "apps",
  summary: "Honest walkthroughs.",
  body: "## What to make\nA 60-second walkthrough.",
  rules: ["Include #ad"],
  exampleUrl: null,
};

test("a valid brief is normalised", () => {
  const b = validateBrief({ ...good, summary: "  Honest walkthroughs.  ", extra: "dropped" });
  assert.equal(b.summary, "Honest walkthroughs.");
  assert.equal(b.v, 1);
  assert.ok(!("extra" in b));
  assert.equal(b.brand.website, "https://kitebase.example/");
});

test("bad input is rejected with a readable reason", () => {
  assert.throws(() => validateBrief({ ...good, brand: { name: "" } }), /brand name is required/);
  assert.throws(() => validateBrief({ ...good, platform: "myspace" }), /platform/);
  assert.throws(() => validateBrief({ ...good, brand: { ...good.brand, logo: "../etc" } }), /media hash/);
  assert.throws(() => validateBrief({ ...good, exampleUrl: "javascript:alert(1)" }), /web link/);
  assert.throws(() => validateBrief({ ...good, rules: Array(11).fill("x") }), /at most 10/);
});

test("hashing ignores key order", async () => {
  const a = validateBrief(good);
  const reordered = JSON.parse(canonicalJson(a));
  const b = validateBrief(Object.fromEntries(Object.entries(reordered).reverse()));
  assert.equal(await briefHash(a), await briefHash(b));
  assert.match(await briefHash(a), /^[0-9a-f]{64}$/);
});

test("brief links pin a hash", () => {
  const h = "a".repeat(64);
  assert.equal(hashFromBriefUrl(`https://clippay.example/b/${h}`), h);
  assert.equal(hashFromBriefUrl(`https://clippay.example/b/${h}?ref=x`), h);
  assert.equal(hashFromBriefUrl("https://github.com/x/briefs/kitebase.md"), null);
});
