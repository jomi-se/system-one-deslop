import assert from "node:assert/strict";
import { test } from "node:test";
import { setImmediate } from "node:timers/promises";
import { createJevClient, MODEL, runGroups, stateHash } from "../src/jev.js";
import type { RequestGroup, RequestRecord } from "../src/jev.js";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function groups(count: number): RequestGroup[] {
  return Array.from({ length: count }, (_, index) => {
    const state = `Synthetic sentence ${index}.`;
    return {
      state,
      state_hash: stateHash(state),
      cases: [],
      variant: "original",
      questions: {
        test: {
          type: "noul",
          instructions: "Synthetic question",
          criteria: { true: "Yes", false: "No" },
        },
      },
    };
  });
}

function response() {
  return new Response(
    JSON.stringify({
      model: MODEL,
      answers: { test: { type: "noul", noul: 0.5 } },
      usage: { input_tokens: 2, output_tokens: 1 },
    }),
    { headers: { "content-type": "application/json" } },
  );
}

for (const sinkError of [new Error("Synthetic disk-full failure"), undefined]) {
  await test(`sink failure drains in-flight requests without scheduling or callbacks (${sinkError === undefined ? "undefined" : "Error"})`, async (context) => {
    const gates = Array.from({ length: 3 }, () => deferred<Response>());
    const sinkCalled = deferred<void>();
    let started = 0;
    let callbacks = 0;
    let settled = false;
    const client = createJevClient({
      apiKey: "offline-test-key",
      fetch: () => {
        const gate = gates[started++];
        assert.ok(gate, "Queued request started after sink failure");
        return gate.promise;
      },
    });
    const outcome = runGroups(groups(7), client, {
      concurrency: 3,
      onRecord: () => {
        callbacks++;
        sinkCalled.resolve();
        throw sinkError;
      },
    }).then(
      (records) => {
        settled = true;
        return { records };
      },
      (error: unknown) => {
        settled = true;
        return { error };
      },
    );
    context.after(async () => {
      for (const gate of gates) gate.resolve(response());
      await outcome;
    });
    await setImmediate();
    assert.equal(started, 3);
    gates[0]?.resolve(response());
    await sinkCalled.promise;
    await setImmediate();
    assert.equal(settled, false, "Caller could close the sink while sibling requests remain");
    assert.equal(started, 3);
    gates[1]?.resolve(response());
    await setImmediate();
    assert.equal(settled, false);
    assert.equal(callbacks, 1);
    gates[2]?.resolve(response());
    const result = await outcome;
    assert.ok("error" in result);
    assert.equal(result.error, sinkError);
    assert.equal(started, 3);
    assert.equal(callbacks, 1);
  });
}

await test("unexpected worker failure also stops scheduling and drains a sibling", async (context) => {
  const gate = deferred<Response>();
  let started = 0;
  let callbacks = 0;
  let settled = false;
  const client = createJevClient({
    apiKey: "offline-test-key",
    fetch: () => {
      started++;
      return gate.promise;
    },
  });
  const input = groups(5);
  const workerError = new Error("Unexpected request-group access failure");
  Object.defineProperty(input, 1, {
    get: () => {
      throw workerError;
    },
  });
  const outcome = runGroups(input, client, {
    concurrency: 3,
    onRecord: () => {
      callbacks++;
    },
  }).then(
    () => {
      settled = true;
      return null;
    },
    (error: unknown) => {
      settled = true;
      return error;
    },
  );
  context.after(async () => {
    gate.resolve(response());
    await outcome;
  });
  await setImmediate();
  assert.equal(started, 1);
  assert.equal(settled, false);
  gate.resolve(response());
  const error = await outcome;
  assert.equal(error, workerError);
  assert.equal(started, 1);
  assert.equal(callbacks, 0);
});

await test("raw string states survive successful requests, hashes, and sink records", async () => {
  const input = groups(4);
  const states: unknown[] = [];
  const sink: RequestRecord[] = [];
  const client = createJevClient({
    apiKey: "offline-test-key",
    fetch: (_url, init) => {
      assert.ok(typeof init?.body === "string");
      const value: unknown = JSON.parse(init.body);
      assert.ok(value !== null && typeof value === "object" && "state" in value);
      states.push(value.state);
      return Promise.resolve(response());
    },
  });
  const records = await runGroups(input, client, {
    concurrency: 2,
    onRecord: (record) => {
      sink.push(record);
    },
  });
  assert.deepEqual(
    states,
    input.map((group) => group.state),
  );
  assert.deepEqual(
    records.map((record) => record.index),
    [0, 1, 2, 3],
  );
  assert.equal(sink.length, 4);
  for (const record of records) {
    assert.equal(record.error, null);
    assert.equal(record.state_hash, stateHash(record.request.state));
    assert.deepEqual(record.usage, { input_tokens: 2, output_tokens: 1 });
  }
});
