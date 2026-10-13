import assert from "node:assert/strict";
import { test } from "node:test";
import { noul, TypeSafeClient } from "@typesafe-ai/sdk";

await test("SDK sends a noul question and returns an inferred numeric answer offline", async () => {
  let calls = 0;
  const client = new TypeSafeClient({
    apiKey: "offline-test-key",
    baseURL: "https://api.example.com",
    defaultModel: "jev-latest",
    logLevel: "off",
    retry: { maxRetries: 0 },
    fetch: async (url, init) => {
      calls += 1;
      assert.equal(url, "https://api.example.com/v1/systemone");
      assert.equal(init?.method, "POST");
      const body = init?.body;
      assert.ok(typeof body === "string");
      assert.deepEqual(JSON.parse(body), {
        state: "The sky is blue.",
        questions: {
          mentionsColor: { type: "noul", instructions: "Does the text mention a color?" },
        },
        model: "jev-latest",
      });
      return new Response(
        JSON.stringify({
          model: "jev-latest",
          answers: { mentionsColor: { type: "noul", noul: 0.99 } },
          usage: { input_tokens: 10, output_tokens: 1 },
        }),
        { headers: { "content-type": "application/json" } },
      );
    },
  });

  const result = await client.systemOne({
    state: "The sky is blue.",
    questions: { mentionsColor: noul("Does the text mention a color?") },
  });
  const probability: number = result.answers.mentionsColor.noul;
  assert.equal(probability, 0.99);
  assert.equal(calls, 1);
});
