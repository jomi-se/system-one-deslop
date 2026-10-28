import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { once } from "node:events";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { request } from "node:http";
import { connect, createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { test } from "node:test";
import type { TestContext } from "node:test";
import { fileURLToPath } from "node:url";
import { acquireLabelWriter } from "../src/label-writer.js";
import { LabelStore } from "../src/labels.js";
import type { Dataset } from "../src/labels.js";

const dataset: Dataset = {
  version: 1,
  seed: "test",
  documents: 1,
  total_unique: 1,
  cards: [
    {
      id: "one",
      text: "A synthetic sentence.",
      origins: [
        {
          file: "fixture.md",
          group: "control",
          offsets: [0, 21],
          paragraph: "A synthetic sentence.",
          raw_text: "A synthetic sentence.",
          before: "",
          after: "",
        },
      ],
    },
  ],
};
const rating = { id: "one", label: "good", note: "fixture", highlight: null };

function fixture(context: TestContext) {
  const root = mkdtempSync(join(tmpdir(), "deslop-writer-"));
  const directory = join(root, "data");
  mkdirSync(directory);
  const lock = join(directory, ".label-writer.lock");
  const journal = join(directory, "ratings.jsonl");
  writeFileSync(join(directory, "dataset.json"), JSON.stringify(dataset));
  mkdirSync(join(root, "web"));
  writeFileSync(join(root, "web", "labels.html"), "<!doctype html>");
  mkdirSync(join(root, "dist", "src"), { recursive: true });
  for (const file of ["label-client.js", "label-types.js"])
    writeFileSync(join(root, "dist", "src", file), "");
  const children: { child: ChildProcessWithoutNullStreams; exited: Promise<number | null> }[] = [];
  context.after(async () => {
    for (const { child, exited } of children) {
      if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
      await exited;
    }
    rmSync(root, { recursive: true, force: true });
  });
  return {
    root,
    directory,
    lock,
    journal,
    start(port: number) {
      const child = spawn(
        process.execPath,
        [
          fileURLToPath(new URL("../scripts/label.js", import.meta.url)),
          "--data",
          directory,
          "--port",
          String(port),
        ],
        { cwd: root, stdio: "pipe" },
      );
      let output = "";
      child.stdout.on("data", (chunk: Buffer) => {
        output += chunk.toString();
      });
      child.stderr.on("data", (chunk: Buffer) => {
        output += chunk.toString();
      });
      const exited = new Promise<number | null>((resolve, reject) => {
        child.once("exit", resolve);
        child.once("error", reject);
      });
      children.push({ child, exited });
      return {
        child,
        exited,
        output: () => output,
        async ready() {
          while (!output.includes("Sentence review:")) {
            assert.equal(child.exitCode, null, output);
            assert.equal(child.signalCode, null, output);
            await delay(10);
          }
        },
      };
    },
  };
}

async function reservePort() {
  const server = createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  return {
    port: address.port,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}

async function freePort(): Promise<number> {
  const reserved = await reservePort();
  await reserved.close();
  return reserved.port;
}

async function pendingRating(port: number, context: TestContext) {
  const body = JSON.stringify(rating);
  const req = request({
    hostname: "127.0.0.1",
    port,
    path: "/api/rate",
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(body),
      Expect: "100-continue",
    },
  });
  context.after(() => req.destroy());
  const response = new Promise<{ status: number | undefined; text: string }>((resolve, reject) => {
    req.once("error", reject);
    req.once("response", (incoming) => {
      let text = "";
      incoming.setEncoding("utf8");
      incoming.on("data", (chunk: string) => {
        text += chunk;
      });
      incoming.once("error", reject);
      incoming.once("end", () => resolve({ status: incoming.statusCode, text }));
    });
  });
  // Failed assertions still destroy the request during fixture cleanup.
  void response.catch(() => {});
  req.flushHeaders();
  await once(req, "continue");
  req.write(body.slice(0, 1));
  return { finish: () => req.end(body.slice(1)), response };
}

await test("writer ownership excludes another writer while replay and independent directories remain available", (context) => {
  const a = fixture(context);
  const b = fixture(context);
  new LabelStore(a.journal, dataset).rate("one", rating);
  const writer = acquireLabelWriter(a.directory);
  const other = acquireLabelWriter(b.directory);
  try {
    assert.equal(lstatSync(a.lock).mode & 0o777, 0o600);
    assert.throws(() => acquireLabelWriter(a.directory), /writer lock already exists/);
    assert.equal(new LabelStore(a.journal, dataset).state().ratings.one?.note, "fixture");
    assert.equal(new LabelStore(a.journal, dataset).export().length, 1);
    writer.assertOwned();
    other.assertOwned();
  } finally {
    writer.release();
    other.release();
  }
  const replacement = acquireLabelWriter(a.directory);
  try {
    writer.release();
    replacement.assertOwned();
  } finally {
    replacement.release();
  }
});

await test("stale locks are never reaped and ownership loss remains closed even if the original file returns", (context) => {
  const f = fixture(context);
  writeFileSync(f.lock, "stale lock");
  assert.throws(() => acquireLabelWriter(f.directory), /manually/);
  assert.equal(readFileSync(f.lock, "utf8"), "stale lock");
  unlinkSync(f.lock);
  const owner = acquireLabelWriter(f.directory);
  const moved = f.lock + ".saved";
  renameSync(f.lock, moved);
  const replacement = acquireLabelWriter(f.directory);
  try {
    assert.throws(() => owner.assertOwned(), /ownership was lost/);
    replacement.release();
    renameSync(moved, f.lock);
    assert.throws(() => owner.assertOwned(), /ownership was lost/);
  } finally {
    replacement.release();
    owner.release();
  }
  assert.equal(existsSync(f.lock), false);
});

await test("release preserves replacement files and symlinks, and tolerates a missing lock", (context) => {
  for (const replacement of ["file", "symlink", "missing"] as const) {
    const f = fixture(context);
    const owner = acquireLabelWriter(f.directory);
    unlinkSync(f.lock);
    if (replacement === "file") writeFileSync(f.lock, "replacement");
    if (replacement === "symlink") symlinkSync(join(f.directory, "dataset.json"), f.lock);
    assert.throws(() => owner.assertOwned(), /ownership was lost/);
    owner.release();
    owner.release();
    if (replacement === "file") assert.equal(readFileSync(f.lock, "utf8"), "replacement");
    if (replacement === "symlink") assert.equal(lstatSync(f.lock).isSymbolicLink(), true);
    if (replacement === "missing") assert.equal(existsSync(f.lock), false);
  }
});

await test(
  "startup exceptions release ownership without changing the snapshot or journal",
  { timeout: 15_000 },
  async (context) => {
    for (const broken of ["snapshot", "journal", "assets"] as const) {
      const f = fixture(context);
      if (broken === "snapshot") writeFileSync(join(f.directory, "dataset.json"), "invalid");
      if (broken === "journal") writeFileSync(f.journal, '{"seq":1');
      if (broken === "assets") unlinkSync(join(f.root, "web", "labels.html"));
      const snapshot = readFileSync(join(f.directory, "dataset.json"), "utf8");
      const server = f.start(await freePort());
      assert.equal(await server.exited, 1, server.output());
      assert.equal(existsSync(f.lock), false);
      assert.equal(readFileSync(join(f.directory, "dataset.json"), "utf8"), snapshot);
      if (broken === "journal") assert.equal(readFileSync(f.journal, "utf8"), '{"seq":1');
    }
  },
);

await test(
  "an asynchronous bind failure releases ownership",
  { timeout: 10_000 },
  async (context) => {
    const f = fixture(context);
    const reserved = await reservePort();
    try {
      const server = f.start(reserved.port);
      assert.equal(await server.exited, 1, server.output());
      assert.match(server.output(), /could not listen/);
      assert.equal(existsSync(f.lock), false);
    } finally {
      await reserved.close();
    }
  },
);

await test(
  "different ports cannot start two writers for the same directory",
  { timeout: 10_000 },
  async (context) => {
    const f = fixture(context);
    const first = f.start(await freePort());
    await first.ready();
    const second = f.start(await freePort());
    assert.equal(await second.exited, 1, second.output());
    assert.match(second.output(), /writer lock already exists/);
    assert.equal(existsSync(f.lock), true);
    first.child.kill("SIGTERM");
    assert.equal(await first.exited, 0, first.output());
    assert.equal(existsSync(f.lock), false);
  },
);

await test(
  "shutdown keeps ownership until an accepted rating request drains",
  { timeout: 15_000 },
  async (context) => {
    const f = fixture(context);
    const port = await freePort();
    const server = f.start(port);
    await server.ready();
    const pending = await pendingRating(port, context);
    server.child.kill("SIGTERM");
    // Observe listener closure while the request body is still incomplete.
    for (;;) {
      const refused = await new Promise<boolean>((resolve, reject) => {
        const socket = connect(port, "127.0.0.1");
        socket.once("connect", () => {
          socket.destroy();
          resolve(false);
        });
        socket.once("error", (error: NodeJS.ErrnoException) => {
          if (error.code === "ECONNREFUSED") resolve(true);
          else reject(error);
        });
      });
      if (refused) break;
      await delay(10);
    }
    assert.equal(server.child.exitCode, null);
    assert.throws(() => acquireLabelWriter(f.directory), /writer lock already exists/);
    pending.finish();
    assert.equal((await pending.response).status, 200);
    assert.equal(await server.exited, 0, server.output());
    assert.equal(existsSync(f.lock), false);
    assert.equal(new LabelStore(f.journal, dataset).state().ratings.one?.note, "fixture");
  },
);

await test(
  "ownership is rechecked after a delayed body and before undo; shutdown preserves another owner's lock",
  { timeout: 15_000 },
  async (context) => {
    const f = fixture(context);
    new LabelStore(f.journal, dataset).rate("one", rating);
    const before = readFileSync(f.journal, "utf8");
    const port = await freePort();
    const server = f.start(port);
    await server.ready();
    const pending = await pendingRating(port, context);
    unlinkSync(f.lock);
    const replacement = acquireLabelWriter(f.directory);
    try {
      pending.finish();
      const response = await pending.response;
      assert.equal(response.status, 400);
      assert.match(response.text, /ownership was lost/);
      const undo = await fetch(`http://127.0.0.1:${port}/api/undo`, { method: "POST" });
      assert.equal(undo.status, 400);
      assert.match(await undo.text(), /ownership was lost/);
      assert.equal(readFileSync(f.journal, "utf8"), before);
      server.child.kill("SIGTERM");
      assert.equal(await server.exited, 0, server.output());
      replacement.assertOwned();
    } finally {
      replacement.release();
    }
  },
);
