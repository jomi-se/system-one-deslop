import { invariant } from "./registry.js";

export interface Interval {
  lower: number;
  upper: number;
}
// Central 90% Poisson score interval, with z = Phi^-1(0.95).
// Fractional expected counts use the same approximation without rounding.
export function poissonInterval(count: number): Interval {
  invariant(Number.isFinite(count) && count >= 0, "Invalid Poisson count");
  const z = 1.6448536269514722;
  const center = count + (z * z) / 2;
  const upper = center + z * Math.sqrt(count + (z * z) / 4);
  // Product of the two quadratic roots is count^2. This form avoids
  // cancellation in the lower root when the expected count is near zero.
  const lower = count === 0 ? 0 : count * (count / upper);
  return { lower, upper };
}
