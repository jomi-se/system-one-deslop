import assert from "node:assert/strict";
import { test } from "node:test";
import { labelBody } from "../src/label-http.js";

function request(chunks: Buffer[]) {
  return {
    headers: { "content-type": "application/json" },
    async *[Symbol.asyncIterator]() {
      yield* chunks;
    },
  };
}

await test("a rating body preserves Unicode even when characters span network chunks", async () => {
  const value = { label: "good", note: "José: café, 📝, 日本語", highlight: null };
  const bytes = Buffer.from(JSON.stringify(value));
  const chunks = Array.from(bytes, (byte) => Buffer.from([byte]));
  assert.deepEqual(await labelBody(request(chunks)), value);
});

await test("body limits count original bytes and malformed UTF-8 cannot become a saved replacement character", async () => {
  const allowed = Buffer.from(JSON.stringify("é".repeat(9_999)));
  assert.equal(allowed.byteLength, 20_000);
  assert.equal(await labelBody(request([allowed])), "é".repeat(9_999));
  await assert.rejects(labelBody(request([allowed, Buffer.from(" ")])), /Request too large/);
  await assert.rejects(labelBody(request([Buffer.from([34, 0xc3, 34])])), /encoded data/);
});
