import assert from "node:assert/strict";
import { test } from "node:test";
import { poissonInterval } from "../src/interval.js";

await test("90% score bounds invert the Poisson score statistic for integer and fractional counts", () => {
  const critical = 2.705543454095404;
  const zero = poissonInterval(0);
  assert.equal(zero.lower, 0);
  assert.ok(Math.abs(zero.upper - critical) < 1e-12);
  let previous = zero;
  for (const count of [0.01, 0.5, 1, 10, 100, 10_000]) {
    const bounds = poissonInterval(count);
    assert.ok(bounds.lower > previous.lower && bounds.upper > previous.upper);
    assert.ok(bounds.lower < count && count < bounds.upper);
    for (const endpoint of [bounds.lower, bounds.upper])
      assert.ok(Math.abs((count - endpoint) ** 2 / endpoint - critical) < 1e-10);
    previous = bounds;
  }
  const one = poissonInterval(1);
  assert.ok(Math.abs(one.lower - 0.22309222073811874) < 1e-12);
  assert.ok(Math.abs(one.upper - 4.482451233357294) < 1e-12);
});
await test("near-zero counts retain a positive lower bound without cancellation; invalid counts fail", () => {
  const bounds = poissonInterval(1e-12);
  assert.ok(bounds.lower > 0);
  assert.ok(Math.abs(bounds.lower / 1e-24 - 1 / 2.705543454095404) < 1e-10);
  const large = poissonInterval(Number.MAX_VALUE);
  assert.ok(Number.isFinite(large.lower) && Number.isFinite(large.upper));
  for (const count of [-1, NaN, Infinity])
    assert.throws(() => poissonInterval(count), /Invalid Poisson count/);
});
