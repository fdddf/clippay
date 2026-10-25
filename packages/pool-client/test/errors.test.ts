// The contract's error codes are part of its interface: this keeps the web
// app's messages and the generated bindings in step with lib.rs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Error as BindingErrors } from "@clippay/campaign-pool-bindings";
import { POOL_ERRORS, describeError, toUnits, fromUnits, afterFee } from "../src/index.ts";

const librs = readFileSync(new URL("../../../contracts/campaign-pool/src/lib.rs", import.meta.url), "utf8");
const enumBody = librs.match(/pub enum Error \{([\s\S]*?)\n\}/)?.[1] ?? "";
const contractErrors = Object.fromEntries(
  [...enumBody.matchAll(/^\s*(\w+) = (\d+),/gm)].map(([, name, code]) => [Number(code), name]),
);

test("lib.rs Error enum was found", () => {
  assert.ok(Object.keys(contractErrors).length >= 14);
});

test("every contract error has a message", () => {
  for (const [code, name] of Object.entries(contractErrors)) {
    assert.ok(POOL_ERRORS[Number(code)], `no message for ${name} (#${code})`);
  }
});

test("bindings match lib.rs (run scripts/bindings.sh after changing the contract)", () => {
  const generated = Object.fromEntries(
    Object.entries(BindingErrors).map(([code, v]) => [Number(code), v.message]),
  );
  assert.deepEqual(generated, contractErrors);
});

test("describeError maps codes and variant names", () => {
  assert.equal(describeError(new Error("HostError: Error(Contract, #5)")), POOL_ERRORS[5]);
  assert.equal(describeError({ message: "CampaignEnded" }), POOL_ERRORS[4]);
  assert.equal(describeError({ message: "EnforcedPause" }), POOL_ERRORS[1000]);
  assert.match(describeError(new Error("NotAllowedError: The operation either timed out or was not allowed")), /cancelled/);
});

test("amounts round-trip at any decimals", () => {
  assert.equal(toUnits("1.5"), 15_000_000n);
  assert.equal(toUnits("1.5", 2), 150n);
  assert.equal(fromUnits(15_000_000n), "1.5");
  assert.equal(fromUnits(150n, 2, 2), "1.5");
  assert.equal(afterFee({ fee_bps: 500 }, 1000n), 950n);
});
