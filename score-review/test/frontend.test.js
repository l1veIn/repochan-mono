import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../public/app.js", import.meta.url), "utf8").split("// ── boot")[0];

function frontend({ realRender = false } = {}) {
  const elements = new Map();
  const element = (key) => {
    if (!elements.has(key)) elements.set(key, { value: "", textContent: "", innerHTML: "", dataset: {},
      classList: { add() {}, remove() {}, toggle() {} }, querySelectorAll: () => [], addEventListener() {},
    });
    return elements.get(key);
  };
  const requests = [];
  let active = { dataset: { score: "8" } };
  const context = vm.createContext({
    document: { querySelector: (selector) => selector === ".score-buttons button.active" ? active : element(selector), querySelectorAll: () => [] },
    console: { error() {} }, setTimeout: () => 1, clearTimeout() {},
    fetch: (url, options) => new Promise((resolve) => { requests.push({ url, body: options.body ? JSON.parse(options.body) : undefined, resolve }); }),
  });
  vm.runInContext(source, context);
  vm.runInContext(`state.archive = "test-owned"; state.items = [{id:"project/one",project:"project",orderId:"one"}, {id:"project/two",project:"project",orderId:"two"}];
    state.scores = {"project/one":{score:8,comment:"old"}};`, context);
  if (!realRender) vm.runInContext("renderQueue = () => {}; updateScoreMeta = () => {};", context);
  element("#comment").value = "old";
  const run = (code) => vm.runInContext(code, context);
  const tick = async () => { await new Promise((resolve) => setImmediate(resolve)); };
  const succeed = (request, scores = { "project/one": { score: 8, comment: request.body.entry?.comment || "old" } }) =>
    request.resolve({ ok: true, json: async () => ({ scores, currentIndex: request.body.currentIndex }) });
  const fail = (request) => request.resolve({ ok: false, status: 500, text: async () => "owned disk failure" });
  return { element, requests, run, tick, succeed, fail, setActive: (value) => { active = value; } };
}

test("untrusted saved score and order labels are escaped in queue HTML", () => {
  const f = frontend({ realRender: true });
  f.run('state.scores["project/one"].score = "<img src=x onerror=alert(1)>"; state.items[0].project = "<script>owned</script>"; renderQueue();');
  const html = f.element("#queue-list").innerHTML;
  assert.ok(!html.includes("<img src=x"));
  assert.ok(!html.includes("<script>"));
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
});

test("a slow save cannot acknowledge edits made after its snapshot", async () => {
  const f = frontend();
  f.element("#comment").value = "first edit";
  f.run("scheduleSave()");
  const first = f.run("saveCurrent()");
  await f.tick();
  assert.equal(f.run('state.scores["project/one"].comment'), "old");
  f.element("#comment").value = "newer edit";
  f.run("scheduleSave()");
  f.succeed(f.requests[0]);
  assert.equal(await first, true);
  assert.equal(f.run("state.dirty"), true);
  assert.equal(f.element("#comment").value, "newer edit");
  assert.equal(f.element("#save-status").textContent, "有未保存修改");
  const second = f.run("flushSave()");
  await f.tick();
  assert.equal(f.requests[1].body.entry.comment, "newer edit");
  f.succeed(f.requests[1]);
  assert.equal(await second, true);
  assert.equal(f.run("state.dirty"), false);
  assert.equal(f.run('state.scores["project/one"].comment'), "newer edit");
});

test("concurrent save calls are serialized and only the latest response clears dirty", async () => {
  const f = frontend();
  f.element("#comment").value = "first";
  f.run("scheduleSave()");
  const first = f.run("saveCurrent()");
  await f.tick();
  f.element("#comment").value = "second";
  f.run("scheduleSave()");
  const second = f.run("saveCurrent()");
  await f.tick();
  assert.equal(f.requests.length, 1);
  f.succeed(f.requests[0]);
  await first;
  await f.tick();
  assert.equal(f.requests.length, 2);
  assert.equal(f.run("state.dirty"), true);
  assert.equal(f.requests[1].body.entry.comment, "second");
  f.succeed(f.requests[1]);
  await second;
  assert.equal(f.run("state.dirty"), false);
  assert.equal(f.run("state.saving"), false);
});

test("failed save keeps the current form and blocks next-item navigation", async () => {
  const f = frontend();
  f.element("#comment").value = "unsaved owned comment";
  f.run("scheduleSave()");
  const navigation = f.run("showItem(1)");
  await f.tick();
  f.fail(f.requests[0]);
  assert.equal(await navigation, false);
  assert.equal(f.run("state.currentIndex"), 0);
  assert.equal(f.run("state.dirty"), true);
  assert.equal(f.run('state.scores["project/one"].comment'), "old");
  assert.equal(f.element("#comment").value, "unsaved owned comment");
  assert.match(f.element("#save-status").textContent, /保存失败/);
});

test("failed save blocks return home, and a retry can confirm the same edit", async () => {
  const f = frontend();
  f.element("#comment").value = "retry owned comment";
  f.run("scheduleSave()");
  const home = f.run("backHome()");
  await f.tick();
  f.fail(f.requests[0]);
  await home;
  assert.equal(f.run("state.archive"), "test-owned");
  assert.equal(f.run("state.items.length"), 2);
  const retry = f.run("flushSave()");
  await f.tick();
  f.succeed(f.requests[1]);
  assert.equal(await retry, true);
  assert.equal(f.run("state.dirty"), false);
  assert.equal(f.run('state.scores["project/one"].comment'), "retry owned comment");
});

test("index-only persistence failures remain visible and prevent losing resume state", async () => {
  const f = frontend();
  const save = f.run("saveCurrent({indexOnly:true})");
  await f.tick();
  f.fail(f.requests[0]);
  assert.equal(await save, false);
  assert.equal(f.run("state.dirty"), true);
  assert.match(f.element("#save-status").textContent, /保存失败/);
});

test("an older archive response cannot replace the newer archive's unsaved form", async () => {
  const f = frontend();
  f.run("buildScoreButtons = () => {}; showItem = async () => true;");
  const older = f.run('openArchive("test-a")');
  const newer = f.run('openArchive("test-b")');
  f.requests[1].resolve({ ok: true, json: async () => ({ items: [{ id: "b/one" }], scores: { scores: { "b/one": { comment: "b old" } } } }) });
  await newer;
  f.element("#comment").value = "newer archive edit";
  f.run("scheduleSave()");
  f.requests[0].resolve({ ok: true, json: async () => ({ items: [{ id: "a/one" }], scores: { scores: { "a/one": { comment: "a old" } } } }) });
  assert.equal(await older, false);
  assert.equal(f.run("state.archive"), "test-b");
  assert.equal(f.run("state.dirty"), true);
  assert.equal(f.element("#comment").value, "newer archive edit");
});

test("an older archive failure cannot overwrite the newer archive's status", async () => {
  const f = frontend();
  f.run("buildScoreButtons = () => {}; showItem = async () => true;");
  const older = f.run('openArchive("test-a")');
  const newer = f.run('openArchive("test-b")');
  f.requests[1].resolve({ ok: true, json: async () => ({ items: [{ id: "b/one" }], scores: { scores: {} } }) });
  await newer;
  const status = f.element("#save-status").textContent;
  f.fail(f.requests[0]);
  assert.equal(await older, false);
  assert.equal(f.run("state.archive"), "test-b");
  assert.equal(f.element("#save-status").textContent, status);
});

test("a stale project response cannot render context for the current image", async () => {
  const f = frontend();
  f.run('state.items[1].project = "second"; globalThis.rendered = []; renderPersona = (data) => rendered.push(data.project); renderProject = () => {};');
  const older = f.run('loadProjectContext("project")');
  f.run("state.currentIndex = 1");
  const newer = f.run('loadProjectContext("second")');
  f.requests[1].resolve({ ok: true, json: async () => ({ project: "second" }) });
  await newer;
  f.requests[0].resolve({ ok: true, json: async () => ({ project: "project" }) });
  await older;
  assert.equal(f.run("JSON.stringify(rendered)"), '["second"]');
  assert.equal(f.run("state.projectCache.project.project"), "project");
});

test("a response from a previous archive cannot populate the new archive cache", async () => {
  const f = frontend();
  f.run('globalThis.rendered = []; renderPersona = (data) => rendered.push(data.project); renderProject = () => {};');
  const older = f.run('loadProjectContext("project")');
  f.run('state.archive = "test-new"; state.projectCache = {};');
  f.requests[0].resolve({ ok: true, json: async () => ({ project: "project" }) });
  await older;
  assert.equal(f.run("Object.keys(state.projectCache).length"), 0);
  assert.equal(f.run("rendered.length"), 0);
});
