import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  appendToInterview,
  createOrUpdateInterview,
  createOrUpdatePersona,
  createPersonaCandidate,
  promotePersonaCandidate,
} from "../src/entities/index.js";
import { updateAnalysisArtifact } from "../src/analysis/write-artifact.js";
import { initProtocol, withProtocolRollback } from "../src/protocol/index.js";
import { seedAnalysis } from "../test-support/fixtures.js";

async function snapshotTree(root: string): Promise<Record<string, string>> {
  const snapshot: Record<string, string> = {};
  async function walk(current: string) {
    const entries = await fs.readdir(current, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      const absolute = path.join(current, entry.name);
      const relative = path.relative(root, absolute).split(path.sep).join("/");
      if (entry.isDirectory()) {
        snapshot[`${relative}/`] = "directory";
        await walk(absolute);
      } else {
        snapshot[relative] = (await fs.readFile(absolute)).toString("base64");
      }
    }
  }
  await walk(root);
  return snapshot;
}

function failRenameTo(destinationToFail: string, message: string) {
  const originalRename = fs.rename.bind(fs);
  vi.spyOn(fs, "rename").mockImplementation(async (source, destination) => {
    if (path.resolve(String(destination)) === path.resolve(destinationToFail)) throw new Error(message);
    return originalRename(source, destination);
  });
}

function persona(name: string) {
  return { name, rolePrompt: `${name} visual tags`, artStyle: "cel-shaded anime" };
}

const interview = {
  summary: "A concise product interview.",
  keyConstraints: [],
  preferences: [],
  avoidList: [],
  questions: [],
  responses: [],
};

describe("multi-file protocol transaction rollback", () => {
  let projectRoot: string;

  beforeEach(async () => {
    projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), "repochan-protocol-transaction-test-"));
    await initProtocol(projectRoot);
    await seedAnalysis(projectRoot);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await fs.rm(projectRoot, { recursive: true, force: true });
  });

  it("restores current, versions, and candidate when persona promotion fails", async () => {
    await createOrUpdatePersona(projectRoot, { persona: persona("Current") }, "create");
    await createPersonaCandidate(projectRoot, { slug: "next", persona: persona("Candidate") });
    const personaRoot = path.join(projectRoot, ".repochan", "persona");
    const current = path.join(personaRoot, "current.json");
    const before = await snapshotTree(personaRoot);
    failRenameTo(current, "simulated persona current publication failure");

    await expect(promotePersonaCandidate(projectRoot, "next")).rejects.toThrow(/simulated persona current publication failure/);
    expect(await snapshotTree(personaRoot)).toEqual(before);
  });

  it("restores interview current and versions when append publication fails", async () => {
    await createOrUpdateInterview(projectRoot, { interview });
    const interviewRoot = path.join(projectRoot, ".repochan", "interview");
    const current = path.join(interviewRoot, "current.json");
    const before = await snapshotTree(interviewRoot);
    failRenameTo(current, "simulated interview current publication failure");

    await expect(appendToInterview(projectRoot, { summary: "Changed" })).rejects.toThrow(/simulated interview current publication failure/);
    expect(await snapshotTree(interviewRoot)).toEqual(before);
  });

  it("restores analysis current and versions when update publication fails", async () => {
    const analysisRoot = path.join(projectRoot, ".repochan", "analysis");
    const current = path.join(analysisRoot, "current.json");
    const before = await snapshotTree(analysisRoot);
    failRenameTo(current, "simulated analysis current publication failure");

    await expect(updateAnalysisArtifact(projectRoot, {
      overwrite: true,
      patch: { context: { identity: { namingSeeds: { secondary: ["transaction"] } } } },
    })).rejects.toThrow(/simulated analysis current publication failure/);
    expect(await snapshotTree(analysisRoot)).toEqual(before);
  });

  it("tolerates read-only fsync rejection like Windows (EPERM on 'r' handles)", async () => {
    // Windows cannot fsync a handle opened read-only; FlushFileBuffers fails
    // and libuv surfaces it as EPERM. syncPath must treat the barrier as
    // best-effort instead of failing the whole protocol mutation.
    const originalOpen = fs.open.bind(fs);
    vi.spyOn(fs, "open").mockImplementation(async (target, flag, mode) => {
      const handle = await originalOpen(target, flag, mode);
      if (flag === "r") {
        handle.sync = async () => {
          const error = new Error("EPERM: operation not permitted, fsync") as NodeJS.ErrnoException;
          error.code = "EPERM";
          throw error;
        };
      }
      return handle;
    });

    await expect(updateAnalysisArtifact(projectRoot, {
      overwrite: true,
      patch: { context: { identity: { namingSeeds: { secondary: ["readonly-fsync"] } } } },
    })).resolves.toBeTruthy();

    const current = await fs.readFile(path.join(projectRoot, ".repochan", "analysis", "current.json"), "utf8");
    expect(current).toContain("readonly-fsync");
  });

  it("rejects a concurrent mutation before it can be erased by rollback", async () => {
    const analysisRoot = path.join(projectRoot, ".repochan", "analysis");
    let signalStarted!: () => void;
    let releaseFailure!: () => void;
    const started = new Promise<void>((resolve) => { signalStarted = resolve; });
    const fail = new Promise<void>((resolve) => { releaseFailure = resolve; });
    const first = withProtocolRollback([analysisRoot], async () => {
      signalStarted();
      await fail;
      throw new Error("first mutation failed");
    });
    await started;

    await expect(withProtocolRollback([analysisRoot], async () => undefined)).rejects.toThrow(/already active/);
    releaseFailure();
    await expect(first).rejects.toThrow(/first mutation failed/);
  });

  it("recovers a prepared durable transaction on the next protocol init", async () => {
    const protocolRoot = path.join(projectRoot, ".repochan");
    const analysisRoot = path.join(protocolRoot, "analysis");
    const transactionId = "txn-00000000-0000-4000-8000-000000000001";
    const transactionRoot = path.join(protocolRoot, ".transactions", transactionId);
    const backup = path.join(transactionRoot, "backups", "0");
    const owner = {
      pid: 999_999_999,
      hostname: os.hostname(),
      nonce: "dead-process-nonce",
      startedAt: "2026-07-15T00:00:00.000Z",
    };
    await fs.mkdir(path.dirname(backup), { recursive: true });
    await fs.cp(analysisRoot, backup, { recursive: true });
    await fs.writeFile(path.join(transactionRoot, "intent.json"), JSON.stringify({
      schemaVersion: "repochan.protocol-transaction.v1",
      transactionId,
      owner,
      targets: ["analysis"],
    }));
    await fs.writeFile(path.join(transactionRoot, "manifest.json"), JSON.stringify({
      schemaVersion: "repochan.protocol-transaction.v1",
      transactionId,
      owner,
      targets: ["analysis"],
      state: "prepared",
      snapshots: [{ target: "analysis", existed: true, backup: "backups/0" }],
    }));
    const lockDir = path.join(protocolRoot, ".locks", "analysis.lock");
    await fs.mkdir(lockDir, { recursive: true });
    await fs.writeFile(path.join(lockDir, "owner.json"), JSON.stringify(owner));
    await fs.writeFile(path.join(analysisRoot, "concurrent.json"), "should be rolled back");
    const expected = await snapshotTree(backup);

    await initProtocol(projectRoot);

    expect(await fs.stat(transactionRoot).then(() => true).catch(() => false)).toBe(false);
    expect(await fs.stat(path.join(analysisRoot, "concurrent.json")).then(() => true).catch(() => false)).toBe(false);
    expect(await snapshotTree(analysisRoot)).toEqual(expected);
  });

  it("cleans a pre-intent crash without blocking protocol initialization", async () => {
    const transactionRoot = path.join(
      projectRoot,
      ".repochan",
      ".transactions",
      "txn-00000000-0000-4000-8000-000000000002",
    );
    await fs.mkdir(path.join(transactionRoot, "backups"), { recursive: true });

    await expect(initProtocol(projectRoot)).resolves.toBeUndefined();
    await expect(fs.stat(transactionRoot)).rejects.toThrow();
    await expect(fs.stat(path.join(projectRoot, ".repochan", "analysis", "versions"))).resolves.toBeTruthy();
  });
});
