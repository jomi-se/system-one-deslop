import { createServer } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createDataset, LabelStore, isDataset } from "../src/labels.js";
import type { Dataset } from "../src/labels.js";
import { invariant, object, ValidationError } from "../src/registry.js";
import { labelBody } from "../src/label-http.js";

function privatePeer(address: string | undefined): boolean {
  const ip = address?.replace(/^::ffff:/, "");
  if (ip === "127.0.0.1" || ip === "::1") return true;
  const octets = ip?.split(".").map(Number);
  return (
    octets?.length === 4 && octets[0] === 100 && (octets[1] ?? 0) >= 64 && (octets[1] ?? 999) <= 127
  );
}
try {
  const args = process.argv.slice(2);
  let directory: string | undefined;
  let runs: string | undefined;
  let count = 200;
  let seed = "reader-batch-1";
  let host = "127.0.0.1";
  let port = 8842;
  const extras: string[] = [];
  for (let index = 0; index < args.length; index++) {
    const flag = args[index];
    const value = args[++index];
    invariant(value && !value.startsWith("--"), "Label options require values");
    if (flag === "--data") directory = resolve(value);
    else if (flag === "--runs") runs = resolve(value);
    else if (flag === "--count") count = Number(value);
    else if (flag === "--seed") seed = value;
    else if (flag === "--host") host = value;
    else if (flag === "--port") port = Number(value);
    else if (flag === "--include") extras.push(resolve(value));
    else throw new ValidationError("Unknown label option");
  }
  invariant(
    directory,
    "Usage: npm run label -- --data OUTSIDE_GIT_DIR [--runs RUNS_DIR] [--count 200] [--include FILE.md] [--host IP] [--port N]",
  );
  invariant(Number.isSafeInteger(port) && port > 1023 && port < 65536, "Invalid port");
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const datasetFile = join(directory, "dataset.json");
  let dataset: Dataset;
  try {
    const value: unknown = JSON.parse(await readFile(datasetFile, "utf8"));
    invariant(isDataset(value), "Invalid dataset snapshot");
    dataset = value;
  } catch (error: unknown) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
    dataset = await createDataset(process.cwd(), runs, count, seed, extras);
    await writeFile(datasetFile, JSON.stringify(dataset, null, 2) + "\n", {
      flag: "wx",
      mode: 0o600,
    });
  }
  const store = new LabelStore(join(directory, "ratings.jsonl"), dataset);
  const html = await readFile("web/labels.html");
  const client = await readFile("dist/src/label-client.js");
  const types = await readFile("dist/src/label-types.js");
  const server = createServer((request, response) => {
    void (async () => {
      response.setHeader("Cache-Control", "no-store");
      response.setHeader("X-Content-Type-Options", "nosniff");
      response.setHeader(
        "Content-Security-Policy",
        "default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'",
      );
      invariant(privatePeer(request.socket.remoteAddress), "Local or Tailscale access required");
      const address = request.socket.localAddress?.replace(/^::ffff:/, "");
      const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
      invariant(
        ["localhost", "127.0.0.1", address, host].includes(url.hostname),
        "Unrecognized host",
      );
      if (request.method === "POST")
        invariant(
          !request.headers.origin || request.headers.origin === url.origin,
          "Same-origin requests required",
        );
      const json = (value: unknown) => {
        response.setHeader("Content-Type", "application/json; charset=utf-8");
        response.end(JSON.stringify(value));
      };
      if (request.method === "GET" && url.pathname === "/") {
        response.setHeader("Content-Type", "text/html; charset=utf-8");
        response.end(html);
      } else if (request.method === "GET" && url.pathname === "/client.js") {
        response.setHeader("Content-Type", "text/javascript; charset=utf-8");
        response.end(client);
      } else if (request.method === "GET" && url.pathname === "/label-types.js") {
        response.setHeader("Content-Type", "text/javascript; charset=utf-8");
        response.end(types);
      } else if (request.method === "GET" && url.pathname === "/api/state")
        json({ cards: store.publicCards(), ...store.state() });
      else if (request.method === "POST" && url.pathname === "/api/rate") {
        const value = object(await labelBody(request), "Rating request");
        invariant(typeof value.id === "string", "Missing sentence id");
        json(store.rate(value.id, value));
      } else if (request.method === "POST" && url.pathname === "/api/undo") json(store.undo());
      else if (request.method === "GET" && url.pathname === "/api/export") {
        const rows = store.export();
        response.setHeader("Content-Disposition", 'attachment; filename="sentence-ratings.json"');
        json({
          version: 1,
          dataset: {
            seed: dataset.seed,
            documents: dataset.documents,
            total_unique: dataset.total_unique,
          },
          rows,
        });
      } else {
        response.statusCode = 404;
        json({ error: "Not found" });
      }
    })().catch((error: unknown) => {
      response.statusCode = 400;
      response.setHeader("Content-Type", "application/json");
      response.end(
        JSON.stringify({
          error:
            error instanceof ValidationError
              ? error.message
              : "Request failed; no successful save was confirmed.",
        }),
      );
    });
  });
  server.on("error", () => {
    console.error("Label server could not listen; check the address and port.");
    process.exitCode = 1;
  });
  server.listen(port, host, () =>
    console.log(
      `Sentence review: http://${host}:${port}/ · ${dataset.cards.length} cards from ${dataset.documents} documents. Ratings: ${directory}`,
    ),
  );
  for (const signal of ["SIGINT", "SIGTERM"] as const) process.once(signal, () => server.close());
} catch (error: unknown) {
  console.error(
    error instanceof ValidationError
      ? error.message
      : "Label server failed; check dataset, journal and permissions. Existing data was preserved.",
  );
  process.exitCode = 1;
}
