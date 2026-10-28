import { closeSync, fstatSync, lstatSync, openSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { ValidationError } from "./registry.js";

export interface LabelWriter {
  assertOwned(): void;
  release(): void;
}

function missing(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

/** Cooperative ownership for a label server; read-only replay needs no lock. */
export function acquireLabelWriter(directory: string): LabelWriter {
  const path = join(directory, ".label-writer.lock");
  let fd: number;
  try {
    fd = openSync(path, "wx", 0o600);
  } catch (cause: unknown) {
    if (cause instanceof Error && "code" in cause && cause.code === "EEXIST")
      throw new ValidationError(
        "A label writer lock already exists. Stop other servers using this data directory. " +
          "If the lock is stale, verify no writer remains before removing .label-writer.lock manually.",
        { cause },
      );
    throw cause;
  }
  let identity;
  try {
    identity = fstatSync(fd, { bigint: true });
  } catch (cause: unknown) {
    closeSync(fd);
    // Without verified identity, leave the lock for manual recovery.
    throw cause;
  }
  let released = false;
  let lost = false;
  const ownsPath = (): boolean => {
    const current = lstatSync(path, { bigint: true });
    return current.isFile() && current.dev === identity.dev && current.ino === identity.ino;
  };
  return {
    assertOwned() {
      try {
        if (released || lost || !ownsPath()) throw new Error("Writer lock is no longer owned");
      } catch (cause: unknown) {
        lost = true;
        throw new ValidationError(
          "Label writer ownership was lost. Saving stopped; restart after checking the writer lock.",
          { cause },
        );
      }
    },
    release() {
      if (released) return;
      released = true;
      try {
        if (ownsPath()) unlinkSync(path);
      } catch (cause: unknown) {
        if (!missing(cause)) throw cause;
      } finally {
        closeSync(fd);
      }
    },
  };
}
