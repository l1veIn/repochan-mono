import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import net from "node:net";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeStarterPreviews, listStarterPreviews, previewStarter, resolveNpmInvocation } from "./starter-preview.js";

describe("starter preview npm invocation", () => {
  it("routes npm through ComSpec on Windows", () => {
    expect(resolveNpmInvocation(["run", "build"], "win32", "C:\\Windows\\System32\\cmd.exe")).toEqual({
      command: "C:\\Windows\\System32\\cmd.exe",
      args: ["/d", "/s", "/c", "npm", "run", "build"],
    });
  });

  it("falls back to cmd.exe when ComSpec is empty", () => {
    expect(resolveNpmInvocation(["install"], "win32", "")).toEqual({
      command: "cmd.exe",
      args: ["/d", "/s", "/c", "npm", "install"],
    });
  });

  it("executes npm directly outside Windows", () => {
    expect(resolveNpmInvocation(["run", "build"], "linux")).toEqual({
      command: "npm",
      args: ["run", "build"],
    });
  });
});

describe("isolated starter previews", () => {
  let root: string;
  beforeEach(async () => { root = await fs.mkdtemp(path.join(os.tmpdir(), "repochan-preview-test-")); });
  afterEach(async () => {
    await closeStarterPreviews();
    await fs.rm(root, { recursive: true, force: true });
  });

  async function fixture(name: string, body = "first", ending = "", noisy = true) {
    const dir = path.join(root, name);
    const trace = path.join(root, `${name}-builds.jsonl`);
    await fs.mkdir(path.join(dir, "repochan"), { recursive: true });
    await fs.writeFile(path.join(dir, "repochan", "starter.json"), JSON.stringify({ id: "tiny" }));
    await fs.writeFile(path.join(dir, "package.json"), JSON.stringify({
      name: "tiny-preview-fixture", private: true, scripts: { build: "node build.cjs" },
    }));
    await fs.writeFile(path.join(dir, "content.txt"), body);
    await fs.writeFile(path.join(dir, "build.cjs"), `
const fs = require('node:fs');
fs.appendFileSync(${JSON.stringify(trace)}, JSON.stringify({cwd: process.cwd(), pid: process.pid}) + '\\n');
// Exercise piped stdout draining, not just stderr collection.
${noisy ? "process.stdout.write('build output '.repeat(10000));" : ""}
${ending}
fs.mkdirSync('dist', {recursive: true});
fs.writeFileSync('dist/index.html', fs.readFileSync('content.txt'));
`);
    return { dir, trace };
  }

  async function builds(trace: string): Promise<Array<{ cwd: string; pid: number }>> {
    const text = await fs.readFile(trace, "utf8").catch(() => "");
    return text.trim() ? text.trim().split("\n").map((line) => JSON.parse(line)) : [];
  }

  async function snapshot(dir: string): Promise<Record<string, string>> {
    const result: Record<string, string> = {};
    async function visit(current: string) {
      for (const name of (await fs.readdir(current)).sort()) {
        const file = path.join(current, name);
        if ((await fs.stat(file)).isDirectory()) { result[path.relative(dir, file)] = "directory"; await visit(file); }
        else result[path.relative(dir, file)] = (await fs.readFile(file)).toString("base64");
      }
    }
    await visit(dir);
    return result;
  }

  it("ignores source dist, shares concurrent work, and leaves source bytes untouched", async () => {
    const { dir, trace } = await fixture("source");
    await fs.mkdir(path.join(dir, "dist"));
    await fs.writeFile(path.join(dir, "dist", "index.html"), "stale source dist");
    const before = await snapshot(dir);
    const [first, concurrent] = await Promise.all([
      previewStarter({ id: "tiny", dir }), previewStarter({ id: "tiny", dir }),
    ]);
    expect(first.port).toBe(concurrent.port);
    expect([first.reused, concurrent.reused].sort()).toEqual([false, true]);
    expect(await (await fetch(first.url)).text()).toBe("first");
    expect(await builds(trace)).toHaveLength(1);
    expect(await snapshot(dir)).toEqual(before);
    const cached = await previewStarter({ id: "tiny", dir });
    expect(cached).toMatchObject({ reused: true, port: first.port });
    expect(await builds(trace)).toHaveLength(1);
    const [{ cwd }] = await builds(trace);
    expect(cwd).not.toBe(dir);
    await closeStarterPreviews();
    expect(listStarterPreviews()).toEqual([]);
    await expect(fs.stat(cwd)).rejects.toMatchObject({ code: "ENOENT" });
    await expect(fetch(first.url)).rejects.toThrow();
  }, 15000);

  it("rebuilds changed content and keeps equal ids from different sources separate", async () => {
    const a = await fixture("a", "A");
    const b = await fixture("b", "B");
    const first = await previewStarter({ id: "tiny", dir: a.dir });
    const [{ cwd: oldWorkspace }] = await builds(a.trace);
    const other = await previewStarter({ id: "tiny", dir: b.dir });
    expect(other.port).not.toBe(first.port);
    expect(await (await fetch(other.url)).text()).toBe("B");
    await fs.writeFile(path.join(a.dir, "content.txt"), "changed A");
    const changed = await previewStarter({ id: "tiny", dir: a.dir });
    expect(changed.reused).toBe(false);
    expect(await (await fetch(changed.url)).text()).toBe("changed A");
    expect(await builds(a.trace)).toHaveLength(2);
    await expect(fs.stat(oldWorkspace)).rejects.toMatchObject({ code: "ENOENT" });
    expect(await (await fetch(other.url)).text()).toBe("B");
    const rebuilt = await previewStarter({ id: "tiny", dir: a.dir, rebuild: true });
    expect(rebuilt.reused).toBe(false);
    expect(await builds(a.trace)).toHaveLength(3);
  }, 15000);

  it("removes failed build workspaces and exposes child-process errors", async () => {
    const { dir, trace } = await fixture("failure", "unused", "console.error('fixture failure'); process.exit(3);");
    const before = await snapshot(dir);
    await expect(previewStarter({ id: "tiny", dir })).rejects.toThrow(/npm run build.*failed \(exit 3\)/);
    const [{ cwd }] = await builds(trace);
    await expect(fs.stat(cwd)).rejects.toMatchObject({ code: "ENOENT" });
    expect(await snapshot(dir)).toEqual(before);
    expect(listStarterPreviews()).toEqual([]);
  }, 15000);

  it("cancels an in-flight build and cleans its workspace on close", async () => {
    const { dir, trace } = await fixture("slow", "unused", "setInterval(() => {}, 1000); process.on('SIGTERM', () => process.exit(0));");
    const pending = previewStarter({ id: "tiny", dir }).then(
      () => ({ error: "unexpected success" }), (error: Error) => ({ error: error.message }),
    );
    await expect.poll(async () => (await builds(trace)).length, { timeout: 10000 }).toBe(1);
    const [{ cwd }] = await builds(trace);
    await closeStarterPreviews();
    expect((await pending).error).toMatch(/cancelled/);
    await expect(fs.stat(cwd)).rejects.toMatchObject({ code: "ENOENT" });
    expect(listStarterPreviews()).toEqual([]);
  }, 15000);

  it.skipIf(process.platform === "win32")("stops a descendant that ignores SIGTERM after npm exits with inherited stdio", async () => {
    const pidFile = path.join(root, "descendant.pid");
    const heartbeat = path.join(root, "heartbeat.txt");
    const descendant = `const fs=require('node:fs'); process.on('SIGTERM',()=>{}); setInterval(()=>fs.writeFileSync(${JSON.stringify(heartbeat)},String(Date.now())),20);`;
    const { dir, trace } = await fixture("tree", "unused", `
const {spawn} = require('node:child_process');
const descendant = spawn(process.execPath, ['-e', ${JSON.stringify(descendant)}], {stdio:'inherit'});
fs.writeFileSync(${JSON.stringify(pidFile)}, String(descendant.pid));
process.on('SIGTERM',()=>process.exit(0));
setInterval(()=>{},1000);
`, false);
    const pending = previewStarter({ id: "tiny", dir, stdio: "inherit" }).then(
      () => "unexpected success", (error: Error) => error.message,
    );
    await expect.poll(() => fs.readFile(heartbeat, "utf8").then(() => true).catch(() => false), { timeout: 10000 }).toBe(true);
    const pid = Number(await fs.readFile(pidFile, "utf8"));
    try {
      const closing = closeStarterPreviews();
      await closeStarterPreviews();
      const [{ cwd }] = await builds(trace);
      await expect(fs.stat(cwd)).rejects.toMatchObject({ code: "ENOENT" });
      await closing;
      expect(await pending).toMatch(/cancelled/);
      await expect.poll(() => {
        try { process.kill(pid, 0); return true; } catch { return false; }
      }, { timeout: 3000 }).toBe(false);
    } finally {
      try { process.kill(pid, "SIGKILL"); } catch { /* already exited */ }
    }
  }, 15000);

  it.skipIf(process.platform === "win32")("reaps a successful build's inherited-pipe descendant before waiting for pipe EOF", async () => {
    const pidFile = path.join(root, "successful-descendant.pid");
    const descendant = "process.on('SIGTERM',()=>{}); setInterval(()=>{},1000);";
    const { dir } = await fixture("successful-tree", "built", `
const {spawn} = require('node:child_process');
const descendant = spawn(process.execPath, ['-e', ${JSON.stringify(descendant)}], {stdio:'inherit'});
fs.writeFileSync(${JSON.stringify(pidFile)}, String(descendant.pid));
setTimeout(()=>process.exit(0),200);
`, false);
    const pending = previewStarter({ id: "tiny", dir });
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      const result = await Promise.race([
        pending,
        new Promise<never>((_resolve, reject) => { timeout = setTimeout(() => reject(new Error("preview pipe EOF timeout")), 5000); }),
      ]);
      expect(await (await fetch(result.url)).text()).toBe("built");
      const pid = Number(await fs.readFile(pidFile, "utf8"));
      await expect.poll(() => {
        try { process.kill(pid, 0); return true; } catch { return false; }
      }, { timeout: 3000 }).toBe(false);
    } finally {
      clearTimeout(timeout);
      await closeStarterPreviews();
      await pending.catch(() => undefined);
      const pid = Number(await fs.readFile(pidFile, "utf8").catch(() => "0"));
      if (pid) { try { process.kill(pid, "SIGKILL"); } catch { /* already exited */ } }
    }
  }, 15000);

  it("closes sockets with incomplete HTTP headers before deleting the workspace", async () => {
    const { dir, trace } = await fixture("partial-request");
    const result = await previewStarter({ id: "tiny", dir });
    const socket = net.connect(result.port, "127.0.0.1");
    await new Promise<void>((resolve, reject) => { socket.once("connect", resolve); socket.once("error", reject); });
    socket.write("GET / HTTP/1.1\r\nHost: localhost\r\n");
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        closeStarterPreviews(),
        new Promise<never>((_resolve, reject) => { timeout = setTimeout(() => reject(new Error("preview socket close timeout")), 2000); }),
      ]);
      const [{ cwd }] = await builds(trace);
      await expect(fs.stat(cwd)).rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      clearTimeout(timeout);
      socket.destroy();
    }
  }, 15000);
});
