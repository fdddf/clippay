import { test } from "node:test";
import assert from "node:assert/strict";
import type { Submission } from "@clippay/pool-client";
import { check, claimPost, showsTag, type Rules } from "../src/checks.ts";
import { rateLimiter } from "../src/limits.ts";
import { ownershipTag, postKey } from "../src/views.ts";

const creator = "CBU3P4BR2CDGT63Q54D3NYM4J4IXLFJR4IIDTF3C4VU7PKVBCNNZAUGR";
const sub: Submission = { creator, url: "https://youtu.be/x", submitted_at: 0n, views: 0n, paid: 0n, fee: 0n };
const rules: Rules = {
  requireOwnershipTag: true,
  requireAdDisclosure: true,
  maxViewsPerHour: 100_000,
  minLikeRatio: 0.002,
  minViewsForEngagement: 5_000,
  minChannelAgeDays: 7,
  requireNewPost: true,
};
const NOW = 1_800_000_000;
const good = {
  views: 10_000n,
  likes: 500n,
  title: "Launch day #ad",
  description: `Made for the brand. ${ownershipTag(creator)}`,
  publishedAt: NOW - 86400,
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

test("the ownership tag is 16 address characters; the old 6-character tag no longer passes", () => {
  assert.equal(ownershipTag(creator), "clippay:CBU3P4BR2CDGT63Q");
  const hold = check(sub, { ...good, description: "clippay:CBU3P4 #ad" }, undefined, rules, NOW);
  assert.equal(hold.fixable.length, 1);
  assert.match(hold.fixable[0], /clippay:CBU3P4BR2CDGT63Q/);
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

test("mock views rise quickly, then level off below the post's ceiling", async () => {
  const { mockProvider } = await import("../src/views.ts");
  const p = mockProvider(10);
  const at = (secondsAgo: number) =>
    p.stats({ ...sub, url: "https://youtu.be/demo", submitted_at: BigInt(Math.floor(Date.now() / 1000 - secondsAgo)) });
  const [m1, h1, d7] = await Promise.all([at(60), at(3600), at(7 * 86400)]);
  assert.ok(m1.views > 500n && m1.views <= 615n, `first minute: ${m1.views}`);
  assert.ok(h1.views > m1.views && d7.views >= h1.views);
  assert.ok(d7.views >= 8_000n && d7.views < 80_000n, `ceiling: ${d7.views}`);
});

const started = { at: NOW - 2 * 86400, exact: true };

test("a post published after the campaign started passes", () => {
  assert.deepEqual(check(sub, good, undefined, rules, NOW, started).review, []);
});

test("a post published before the campaign started goes to review", () => {
  const hold = check(sub, { ...good, publishedAt: NOW - 30 * 86400 }, undefined, rules, NOW, started);
  assert.equal(hold.review.length, 1);
  assert.match(hold.review[0], /before the campaign started/);
});

test("with only the first entry's time known, an older post is flagged as possibly old", () => {
  const hold = check(sub, { ...good, publishedAt: NOW - 30 * 86400 }, undefined, rules, NOW, { ...started, exact: false });
  assert.match(hold.review[0], /may predate the campaign/);
});

test("the new-post rule is skipped without a publish date or start, and can be switched off", () => {
  const old = { ...good, publishedAt: NOW - 30 * 86400 };
  assert.deepEqual(check(sub, { ...good, publishedAt: undefined }, undefined, rules, NOW, started).review, []);
  assert.deepEqual(check(sub, old, undefined, rules, NOW).review, []);
  assert.deepEqual(check(sub, old, undefined, { ...rules, requireNewPost: false }, NOW, started).review, []);
});

test("links to the same post share a key", () => {
  const id = "youtube:dQw4w9WgXcQ";
  for (const u of [
    "https://youtu.be/dQw4w9WgXcQ",
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42",
    "https://m.youtube.com/shorts/dQw4w9WgXcQ",
    "https://youtube.com/embed/dQw4w9WgXcQ?si=abc",
  ]) {
    assert.equal(postKey(u), id, u);
  }
  assert.equal(postKey("https://www.tiktok.com/@a/video/123/?lang=en#x"), postKey("https://tiktok.com/@a/video/123"));
  assert.notEqual(postKey("https://youtu.be/aaaaaaaaaaa"), postKey("https://youtu.be/bbbbbbbbbbb"));
});

test("one post pays one creator: the first whose tag is on it", () => {
  const owners = new Map<string, string>();
  // An earlier entrant without the tag doesn't take the post…
  assert.equal(claimPost(owners, "0:youtube:x", "THIEF", false), undefined);
  // …the tagged creator does, and keeps it on later passes.
  assert.equal(claimPost(owners, "0:youtube:x", "OWNER", true), undefined);
  assert.equal(claimPost(owners, "0:youtube:x", "OWNER", true), undefined);
  // Everyone else entering the same post is held.
  assert.match(claimPost(owners, "0:youtube:x", "THIEF", false) ?? "", /already entered/);
  assert.match(claimPost(owners, "0:youtube:x", "OTHER", true) ?? "", /already entered/);
  // The same post in another campaign is a separate entry.
  assert.equal(claimPost(owners, "1:youtube:x", "OTHER", true), undefined);
});

test("showsTag follows the tag rule", () => {
  assert.ok(showsTag(sub, good, rules));
  assert.ok(!showsTag(sub, { ...good, description: "nothing" }, rules));
  assert.ok(showsTag(sub, { ...good, description: "nothing" }, { ...rules, requireOwnershipTag: false }));
  assert.ok(showsTag(sub, {}, rules), "no metadata (mock): nothing to check");
});
