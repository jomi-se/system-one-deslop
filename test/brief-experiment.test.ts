import assert from "node:assert/strict";
import { test } from "node:test";
import { parsePost, briefComparisonPrompt } from "../scripts/brief-experiment.js";

await test("raw post extraction rejects failed Claude wrappers and empty provider output", () => {
  assert.equal(
    parsePost(
      "opus",
      JSON.stringify({
        type: "result",
        subtype: "success",
        is_error: false,
        result: "# A post\n\nText.",
      }),
    ),
    "# A post\n\nText.\n",
  );
  assert.equal(parsePost("sol", "# A post\n\nText."), "# A post\n\nText.\n");
  assert.throws(
    () => parsePost("opus", JSON.stringify({ type: "result", is_error: true, result: "Failure" })),
    /failed/,
  );
  assert.throws(
    () =>
      parsePost(
        "opus",
        JSON.stringify({ type: "result", subtype: "error_max_turns", result: "partial" }),
      ),
    /failed/,
  );
  assert.throws(
    () =>
      parsePost(
        "opus",
        JSON.stringify({ type: "result", structured_output: { post: "wrong contract" } }),
      ),
    /unexpected/,
  );
  assert.throws(() => parsePost("sol", " \n"), /empty/);
});
await test("blind mappings follow both A/B orders without imposing edit preservation", () => {
  for (const first of [false, true]) {
    const pair = briefComparisonPrompt(
      "slices",
      "First independent post.",
      "Second independent post.",
      first,
    );
    assert.equal(pair.briefed_version, first ? "A" : "B");
    assert.equal(pair.generic_version, first ? "B" : "A");
    assert.match(
      pair.prompt,
      first ? /VERSION A\nSecond independent post\./ : /VERSION A\nFirst independent post\./,
    );
    assert.doesNotMatch(pair.prompt, /same facts/i);
    assert.doesNotMatch(pair.prompt, /briefed|generic|opus|sol/);
  }
});
