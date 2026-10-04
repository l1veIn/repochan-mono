import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
import { createScoreReviewApp } from "../server.js";

const toolRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const imageBytes = Buffer.from("owned image bytes");

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value));
}

async function fixture(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "repochan-score-review-test-")));
  const archive = path.join(root, "test-results/test-owned");
  const order = path.join(archive, "project/.repochan/orders/ord-foundation-001");
  const version = path.join(order, "versions/v-owned");
  writeJson(path.join(order, "order.json"), { currentVersion: "v-owned", status: "accepted" });
  writeJson(path.join(version, "meta.json"), { versionId: "v-owned", files: ["image.png"] });
  fs.writeFileSync(path.join(version, "image.png"), imageBytes);
  writeJson(path.join(archive, "project/.repochan/persona/current.json"), { name: "Owned Persona" });
  const server = createScoreReviewApp({ root }).listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  t.after(async () => {
    server.closeAllConnections();
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    fs.rmSync(root, { recursive: true, force: true });
  });
  const request = (url, { method = "GET", body, headers = {} } = {}) => new Promise((resolve, reject) => {
    const req = http.request({ hostname: "127.0.0.1", port: address.port, path: url, method,
      headers: { "Content-Type": "application/json", ...headers } }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        const bytes = Buffer.concat(chunks);
        let json;
        try { json = JSON.parse(bytes.toString()); } catch { /* image or text response */ }
        resolve({ status: res.statusCode, headers: res.headers, bytes, json });
      });
    });
    req.on("error", reject);
    req.end(body === undefined ? undefined : JSON.stringify(body));
  });
  return { root, archive, version, request, port: address.port };
}

test("canonical archive, project and image endpoints preserve the review path", async (t) => {
  const f = await fixture(t);
  const listing = await f.request("/api/archives");
  assert.equal(listing.status, 200);
  assert.equal(listing.json.archives[0].itemCount, 1);
  const detail = await f.request("/api/archives/test-owned");
  assert.equal(detail.status, 200);
  assert.equal(detail.json.items[0].id, "project/ord-foundation-001");
  const project = await f.request("/api/archives/test-owned/project/project");
  assert.equal(project.json.persona.name, "Owned Persona");
  const image = await f.request(`/api/file/${detail.json.items[0].primaryImage}`);
  assert.equal(image.status, 200);
  assert.deepEqual(image.bytes, imageBytes);
});

test("valid scores and resume index are saved and can be reopened", async (t) => {
  const f = await fixture(t);
  const saved = await f.request("/api/archives/test-owned/scores", { method: "PUT", body: {
    itemId: "project/ord-foundation-001", entry: { score: 8, comment: "owned review", rater: "test" }, currentIndex: 3,
  } });
  assert.equal(saved.status, 200);
  assert.equal(saved.json.scores["project/ord-foundation-001"].score, 8);
  const reopened = await f.request("/api/archives/test-owned/scores");
  assert.equal(reopened.json.currentIndex, 3);
  assert.equal(reopened.json.scores["project/ord-foundation-001"].comment, "owned review");
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(f.archive, "scores.json"))), reopened.json);
  assert.equal((await f.request("/api/archives/test-missing/scores")).status, 404);
});

test("the executable listens only on IPv4 loopback", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "repochan-score-review-cli-"));
  const tool = path.join(root, "score-review");
  fs.mkdirSync(tool);
  fs.copyFileSync(path.join(toolRoot, "server.js"), path.join(tool, "server.js"));
  writeJson(path.join(tool, "package.json"), { type: "module" });
  fs.symlinkSync(path.join(toolRoot, "node_modules"), path.join(tool, "node_modules"), "dir");
  // Observe the actual main-module listen call without choosing a fixed port.
  fs.writeFileSync(path.join(tool, "probe.mjs"), `import express from "express";
const original = express.application.listen;
express.application.listen = function (_port, host) {
  const server = original.call(this, 0, host, () => {
    console.log(JSON.stringify(server.address())); server.close();
  }); return server;
}; process.argv[1] = new URL("./server.js", import.meta.url).pathname;
await import("./server.js");`);
  const child = spawn(process.execPath, [path.join(tool, "probe.mjs")], { stdio: ["ignore", "pipe", "pipe"] });
  t.after(() => { child.kill(); fs.rmSync(root, { recursive: true, force: true }); });
  let output = "";
  child.stdout.on("data", (chunk) => { output += chunk; });
  const [code] = await once(child, "close");
  assert.equal(code, 0);
  assert.equal(JSON.parse(output.trim()).address, "127.0.0.1");
});

test("Host and Origin checks reject foreign browser writes", async (t) => {
  const f = await fixture(t);
  const endpoint = "/api/archives/test-owned/scores";
  assert.equal((await f.request(endpoint, { headers: { Host: "attacker.example" } })).status, 403);
  assert.equal((await f.request(endpoint, { method: "PUT", headers: { Origin: "https://attacker.example" }, body: { currentIndex: 0 } })).status, 403);
  assert.equal((await f.request(endpoint, { method: "PUT", headers: { Origin: `http://127.0.0.1:${f.port}` }, body: { currentIndex: 0 } })).status, 200);
  assert.equal((await f.request(endpoint, { method: "PUT", body: { currentIndex: 1 } })).status, 200);
});

test("intermediate archive symlinks cannot expose outside files or protocols", async (t) => {
  const f = await fixture(t);
  const outside = path.join(f.root, "owned-outside");
  fs.mkdirSync(outside);
  fs.writeFileSync(path.join(outside, "secret.png"), "owned external secret");
  fs.symlinkSync(outside, path.join(f.archive, "directory-link"), "dir");
  assert.equal((await f.request("/api/file/test-results/test-owned/directory-link/secret.png")).status, 404);
  fs.mkdirSync(path.join(f.archive, "linked-project"));
  fs.symlinkSync(path.join(f.archive, "project/.repochan"), path.join(f.archive, "linked-project/.repochan"), "dir");
  assert.equal((await f.request("/api/archives/test-owned/project/linked-project")).status, 404);
});

test("score symlinks never overwrite an outside file", async (t) => {
  const f = await fixture(t);
  const outside = path.join(f.root, "owned-outside.json");
  fs.writeFileSync(outside, "owned outside original");
  fs.symlinkSync(outside, path.join(f.archive, "scores.json"));
  const response = await f.request("/api/archives/test-owned/scores", { method: "PUT", body: { currentIndex: 0 } });
  assert.equal(response.status, 403);
  assert.equal(fs.readFileSync(outside, "utf8"), "owned outside original");
  assert.ok(fs.lstatSync(path.join(f.archive, "scores.json")).isSymbolicLink());
});

test("invalid stored review data is reported and never replaced with blank scores", async (t) => {
  const f = await fixture(t);
  const file = path.join(f.archive, "scores.json");
  for (const bytes of ["{broken JSON", JSON.stringify({ scores: {}, currentIndex: "<img src=x>" }),
    JSON.stringify({ scores: { owned: { score: "<img src=x onerror=alert(1)>" } } })]) {
    fs.writeFileSync(file, bytes);
    assert.equal((await f.request("/api/archives/test-owned/scores")).status, 422);
    assert.equal((await f.request("/api/archives/test-owned/scores", { method: "PUT", body: { currentIndex: 0 } })).status, 422);
    assert.equal(fs.readFileSync(file, "utf8"), bytes);
  }
});

test("invalid scores, comments and indexes cannot corrupt the saved review", async (t) => {
  const f = await fixture(t);
  const endpoint = "/api/archives/test-owned/scores";
  await f.request(endpoint, { method: "PUT", body: { itemId: "owned", entry: { score: 8 }, currentIndex: 0 } });
  const file = path.join(f.archive, "scores.json");
  const prior = fs.readFileSync(file, "utf8");
  const invalid = [
    ...[0, 11, 1.5, "<img src=x onerror=alert(1)>"].map((score) => ({ itemId: "owned", entry: { score } })),
    { itemId: "owned", entry: { comment: {} } }, { itemId: "__proto__", entry: { score: 8 } },
    { currentIndex: -1 }, { currentIndex: "1" }, { currentIndex: 0.5 }, { scores: [] }, [],
  ];
  for (const body of invalid) {
    assert.equal((await f.request(endpoint, { method: "PUT", body })).status, 400);
    assert.equal(fs.readFileSync(file, "utf8"), prior);
  }
});

test("image routes reject traversal and active archive HTML, and sandbox SVG", async (t) => {
  const f = await fixture(t);
  fs.writeFileSync(path.join(f.archive, "owned.html"), "<script>alert(1)</script>");
  fs.writeFileSync(path.join(f.archive, "owned.svg"), '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
  for (const url of ["/api/file/test-results/test-owned/owned.html", "/api/file/test-results/test-owned/%2e%2e/secret.png", "/api/file/test-results/test-owned/%5csecret.png"]) {
    assert.equal((await f.request(url)).status, 400);
  }
  const svg = await f.request("/api/file/test-results/test-owned/owned.svg");
  assert.equal(svg.status, 200);
  assert.match(svg.headers["content-security-policy"], /sandbox/);
  assert.equal(svg.headers["x-content-type-options"], "nosniff");
});

test("malformed order metadata is skipped without breaking the archive", async (t) => {
  const f = await fixture(t);
  writeJson(path.join(f.version, "meta.json"), { versionId: "v-owned", files: ["image.png", 42] });
  const response = await f.request("/api/archives/test-owned");
  assert.equal(response.status, 200);
  assert.equal(response.json.itemCount, 0);
});

test("failed atomic publication preserves prior score bytes and cleans its temporary file", async (t) => {
  const f = await fixture(t);
  const endpoint = "/api/archives/test-owned/scores";
  await f.request(endpoint, { method: "PUT", body: { currentIndex: 0 } });
  const file = path.join(f.archive, "scores.json");
  const prior = fs.readFileSync(file, "utf8");
  const original = fs.renameSync;
  fs.renameSync = (source, target) => {
    if (path.dirname(source) === f.archive && path.basename(source).startsWith(".scores-")) throw new Error("owned publication failure");
    return original(source, target);
  };
  try {
    assert.equal((await f.request(endpoint, { method: "PUT", body: { currentIndex: 1 } })).status, 500);
  } finally { fs.renameSync = original; }
  assert.equal(fs.readFileSync(file, "utf8"), prior);
  assert.deepEqual(fs.readdirSync(f.archive).filter((name) => name.startsWith(".scores-")), []);
});
