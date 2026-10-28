import type { IncomingMessage } from "node:http";
import { invariant } from "./registry.js";

export async function labelBody(
  request: Pick<IncomingMessage, "headers"> & AsyncIterable<unknown>,
): Promise<unknown> {
  invariant(request.headers["content-type"]?.startsWith("application/json"), "JSON required");
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of request) {
    invariant(Buffer.isBuffer(chunk), "Invalid request body");
    bytes += chunk.byteLength;
    invariant(bytes <= 20_000, "Request too large");
    chunks.push(chunk);
  }
  const text = new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks, bytes));
  return JSON.parse(text) as unknown;
}
