import { test } from "node:test";
import assert from "node:assert/strict";
import { checkWithdrawAmount } from "../src/index.ts";

const testanchor = { enabled: true, min: 1, max: 10 };

test("amounts inside the anchor's limits and the balance pass", () => {
  assert.equal(checkWithdrawAmount(testanchor, 1, 50, "XLM"), null);
  assert.equal(checkWithdrawAmount(testanchor, 10, 50, "XLM"), null);
  assert.equal(checkWithdrawAmount({ enabled: true }, 500, null, "XLM"), null);
});

test("below min, above max, over balance, empty and disabled are rejected", () => {
  assert.match(checkWithdrawAmount(testanchor, 0.5, 50, "XLM")!, /minimum is 1 XLM/);
  assert.match(checkWithdrawAmount(testanchor, 10.01, 50, "XLM")!, /maximum is 10 XLM/);
  assert.match(checkWithdrawAmount(testanchor, 5, 2.4, "XLM")!, /holds 2.4 XLM/);
  assert.match(checkWithdrawAmount(testanchor, NaN, 50, "XLM")!, /Enter an amount/);
  assert.match(checkWithdrawAmount({ enabled: false }, 5, 50, "USDC")!, /doesn't pay out USDC/);
});
