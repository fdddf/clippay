import { test } from "node:test";
import assert from "node:assert/strict";
import type { Submission } from "@clippay/pool-client";
import { check, type Rules } from "../src/checks.ts";
import { rateLimiter } from "../src/limits.ts";

const creator = "CBU3P4BR2CDGT63Q54D3NYM4J4IXLFJR4IIDTF3C4VU7PKVBCNNZAUGR";
const sub: Submission = { creator, url: "https://youtu.be/x", submitted_at: 0n, views: 0n, paid: 0n, fee: 0n };
const rules: Rules = {
  requireOwnershipTag: true,
  requireAdDisclosure: true,
  maxViewsPerHour: 100_000,
  minLikeRatio: 0.002,
  minViewsForEngagement: 5_000,
  minChannelAgeDays: 7,
};
const NOW = 1_800_000_000;
const good = {
  views: 10_000n,
  likes: 500n,
  title: "Launch day #ad",
  description: `Made for the brand. clippay:${creator.slice(0, 6)}`,
  channelCreatedAt: NOW - 400 * 86400,
};

test("a clean post passes", () => {
  assert.deepEqual(check(sub, good, undefined, rules, NOW), { fixable: [], review: [] });
});

test("missing ownership tag and #ad are fixable holds", () => {
  const hold = check(sub, { ...good, title: "Launch day", description: "no tags" }, undefined, rules, NOW);
  assert.equal(hold.fixable.length, 2);
  assert.match(hold.fixable[0], /clippay:CBU3P4/);
  assert.match(hold.fixable[1], /#ad/);
  assert.deepEqual(hold.review, []);
});

test("#sponsored in the description counts as disclosure", () => {
  const hold = check(sub, { ...good, title: "x", description: `${good.description} #Sponsored` }, undefined, rules, NOW);
  assert.deepEqual(hold.fixable, []);
});

test("the tag rule can be switched off", () => {
  const hold = check(sub, { ...good, description: "#ad" }, undefined, { ...rules, requireOwnershipTag: false }, NOW);
  assert.deepEqual(hold.fixable, []);
});

test("posts without metadata (mock provider) skip text rules", () => {
  assert.deepEqual(check(sub, { views: 10n }, undefined, rules, NOW), { fixable: [], review: [] });
});

test("view spikes, low engagement and new channels go to review", () => {
  const hold = check(
    sub,
    { ...good, views: 300_000n, likes: 10n, channelCreatedAt: NOW - 2 * 86400 },
    { views: 10_000n, at: NOW - 3600 },
    rules,
    NOW,
  );
  assert.equal(hold.review.length, 3);
  assert.match(hold.review[0], /jumped/);
  assert.match(hold.review[1], /engagement/);
  assert.match(hold.review[2], /2 day/);
});

test("steady growth is fine", () => {
  const hold = check(sub, { ...good, views: 60_000n }, { views: 10_000n, at: NOW - 3600 }, rules, NOW);
  assert.deepEqual(hold.review, []);
});

test("rate limiter allows N per minute per key", () => {
  const limit = rateLimiter(2);
  assert.ok(limit.take("a", 0));
  assert.ok(limit.take("a", 1));
  assert.ok(!limit.take("a", 2));
  assert.ok(limit.take("b", 2));
  assert.ok(limit.take("a", 60_001));
});
