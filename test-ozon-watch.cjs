// Тест apps-script/OzonWatch.gs с заглушками Apps Script. Реальных сетевых вызовов нет.
const fs = require("fs"), vm = require("vm"), assert = require("assert");
const SRC = fs.readFileSync(__dirname + "/apps-script/OzonWatch.gs", "utf8");
const OZON = "https://api-seller.ozon.ru/v4/posting/fbs/list", HOOK = "https://hook.example.test/sig";

function env(o) {
  o = o || {};
  const props = Object.assign({ OZON_CLIENT_ID: "cid", OZON_API_KEY: "akey",
    MAXBOT_WEBHOOK_URL: HOOK, MAXBOT_WEBHOOK_KEY: "wkey" }, o.props || {});
  const calls = [], triggers = (o.triggers || []).slice();
  let pages = o.pages || [[]]; let hookCodes = (o.hookCodes || [200]).slice(); let locked = false;
  const ctx = {
    console: { log() {}, warn() {}, error() {} }, JSON, Date, Math, String, parseInt, Error,
    PropertiesService: { getScriptProperties: () => ({
      getProperty: k => (k in props ? props[k] : null),
      setProperty: (k, v) => { props[k] = String(v); },
      setProperties: (m) => { Object.assign(props, m); },
      deleteProperty: k => { delete props[k]; } }) },
    LockService: { getScriptLock: () => ({ tryLock: () => (o.busy ? false : (locked = true)),
      waitLock: () => { locked = true; }, releaseLock: () => { locked = false; } }) },
    ScriptApp: {
      getProjectTriggers: () => triggers.slice(),
      deleteTrigger: t => triggers.splice(triggers.indexOf(t), 1),
      newTrigger: fn => ({ timeBased: () => ({ everyMinutes: m => ({ create: () => {
        const t = { fn, m, getHandlerFunction: () => fn }; triggers.push(t); return t; } }) }) }) },
    UrlFetchApp: { fetch(url, opt) {
      assert(opt.muteHttpExceptions === true);
      calls.push({ url, opt, body: JSON.parse(opt.payload) });
      if (url === OZON) {
        const b = JSON.parse(opt.payload);
        assert(b.filter.since && b.filter.to && b.limit === 100);
        assert.deepStrictEqual(b.filter.statuses, ["awaiting_registration","acceptance_in_progress","awaiting_approve","awaiting_packaging","awaiting_deliver","not_accepted"]);
        assert(!b.with, "не запрашиваем financial_data");
        if (o.ozonCode) return { getResponseCode: () => o.ozonCode, getContentText: () => "{}" };
        const idx = b.cursor ? Number(b.cursor.slice(1)) : 0;
        const pg = pages[idx] || [];
        const next = idx + 1 < pages.length;
        return { getResponseCode: () => 200, getContentText: () => JSON.stringify({
          postings: pg.map(n => ({ posting_number: n, financial_data: { products: [{ price: "999" }] } })),
          has_next: next, cursor: next ? "c" + (idx + 1) : "" }) };
      }
      if (url === HOOK) { const c = hookCodes.length > 1 ? hookCodes.shift() : hookCodes[0];
        if (c === "throw") throw new Error("dns"); return { getResponseCode: () => c, getContentText: () => "" }; }
      throw new Error("unexpected URL " + url);
    } },
  };
  vm.createContext(ctx); vm.runInContext(SRC, ctx);
  return { ctx, props, calls, triggers, setPages: p => { pages = p; }, setHook: c => { hookCodes = c.slice(); },
    hooks: () => calls.filter(c => c.url === HOOK), ozon: () => calls.filter(c => c.url === OZON) };
}
let n = 0; const t = (name, f) => { f(); n++; console.log("ok -", name); };

t("install: seeds across pages without sending, creates one 5-min trigger, removes duplicates", () => {
  const other = { getHandlerFunction: () => "remind" };
  const old = { getHandlerFunction: () => "ozonWatchTick" };
  const e = env({ pages: [["A-1", "A-2"], ["A-3"]], triggers: [old, old, other] });
  const r = e.ctx.ozonWatchInstall();
  assert.strictEqual(r.seeded, 3); assert.strictEqual(e.hooks().length, 0);
  assert.strictEqual(e.ozon().length, 2); assert.strictEqual(e.ozon()[1].body.cursor, "c1");
  assert.strictEqual(e.ozon()[0].opt.headers["Client-Id"], "cid");
  assert.strictEqual(e.ozon()[0].opt.headers["Api-Key"], "akey");
  assert.strictEqual(e.triggers.filter(x => x.getHandlerFunction() === "ozonWatchTick").length, 1);
  assert(e.triggers.includes(other)); assert.strictEqual(e.triggers.find(x => x.fn).m, 5);
  assert.strictEqual(e.props.OW_SEEDED, "1");
  assert.deepStrictEqual(Object.keys(JSON.parse(e.props.OW_SEEN_0)).sort(), ["A-1","A-2","A-3"]);
});

t("tick: only new postings sent in one POST, default headers, no financial data", () => {
  const e = env({ pages: [["A-1"]] }); e.ctx.ozonWatchInstall();
  e.setPages([["A-1", "B-1"], ["B-2"]]);
  const r = e.ctx.ozonWatchTick();
  assert.strictEqual(r.sent, 2); const h = e.hooks()[0];
  assert.deepStrictEqual(h.body, { posting_numbers: ["B-1", "B-2"], posting_number: "B-1" });
  assert.strictEqual(h.opt.headers.Authorization, "Bearer wkey");
  assert.strictEqual(h.opt.headers["X-Webhook-Key"], "wkey");
  assert.strictEqual(h.opt.contentType, "application/json");
  assert(!/price|999|financial/.test(h.opt.payload));
  assert.strictEqual(e.ctx.ozonWatchTick().sent, 0); assert.strictEqual(e.hooks().length, 1);
});

t("tick: webhook failure (500 / network) -> not marked seen, retried next tick", () => {
  const e = env({ pages: [[]] }); e.ctx.ozonWatchInstall();
  e.setPages([["N-1"]]); e.setHook([500]);
  assert.strictEqual(e.ctx.ozonWatchTick().ok, false);
  e.setHook(["throw"]); assert.strictEqual(e.ctx.ozonWatchTick().code, 0);
  e.setHook([204]); assert.strictEqual(e.ctx.ozonWatchTick().sent, 1);
  assert.strictEqual(e.hooks().length, 3);
  assert.strictEqual(e.ctx.ozonWatchTick().sent, 0);
});

t("tick: Ozon error -> nothing sent, nothing changed", () => {
  const e = env({ pages: [["A-1"]] }); e.ctx.ozonWatchInstall();
  const before = JSON.stringify(e.props);
  const e2 = env({ ozonCode: 403, props: JSON.parse(before) });
  assert.strictEqual(e2.ctx.ozonWatchTick().ok, false); assert.strictEqual(e2.hooks().length, 0);
});

t("tick without install seeds silently (no flood)", () => {
  const e = env({ pages: [["A-1", "A-2"]] });
  assert.strictEqual(e.ctx.ozonWatchTick().seeded, 2); assert.strictEqual(e.hooks().length, 0);
});

t("custom key header mode sends only that header with raw key; empty key sends none", () => {
  const e = env({ props: { MAXBOT_WEBHOOK_KEY_HEADER: "X-Api-Key" } });
  e.ctx.ozonWatchTest(); const h = e.hooks()[0].opt.headers;
  assert.deepStrictEqual(Object.assign({}, h), { "X-Api-Key": "wkey" });
  const e2 = env({ props: { MAXBOT_WEBHOOK_KEY: "" } }); e2.ctx.ozonWatchTest();
  assert.deepStrictEqual(Object.assign({}, e2.hooks()[0].opt.headers), {});
});

t("ozonWatchTest posts {test:true} and returns code, no Ozon call", () => {
  const e = env({ hookCodes: [401] });
  assert.strictEqual(e.ctx.ozonWatchTest(), 401);
  assert.deepStrictEqual(e.hooks()[0].body, { test: true }); assert.strictEqual(e.ozon().length, 0);
});

t("busy lock -> tick skipped, no calls", () => {
  const e = env({ busy: true }); e.ctx.ozonWatchTick(); assert.strictEqual(e.calls.length, 0);
});

t("uninstall removes only our triggers", () => {
  const other = { getHandlerFunction: () => "remind" };
  const e = env({ triggers: [other] }); e.ctx.ozonWatchInstall();
  assert.strictEqual(e.ctx.ozonWatchUninstall().removed, 1); assert.deepStrictEqual(e.triggers, [other]);
});

t("seen store: prunes >30 days, chunks under 9KB, shrinks chunk count", () => {
  const e = env(); const now = Date.now(), today = Math.floor(now / 86400000);
  const big = {}; for (let i = 0; i < 1500; i++) big["9" + String(i).padStart(7, "0") + "-0001-1"] = today;
  big["OLD-1"] = today - 31; big["EDGE-1"] = today - 30;
  e.ctx.OW_saveSeen_(big, now);
  const N = Number(e.props.OW_SEEN_N); assert(N > 1);
  for (let i = 0; i < N; i++) assert(e.props["OW_SEEN_" + i].length <= 8000);
  const back = e.ctx.OW_loadSeen_(); assert(!("OLD-1" in back)); assert("EDGE-1" in back);
  assert.strictEqual(Object.keys(back).length, 1501);
  e.ctx.OW_saveSeen_({ X: today }, now);
  assert.strictEqual(e.props.OW_SEEN_N, "1"); assert(!("OW_SEEN_1" in e.props));
});

t("missing config -> clear errors, no network", () => {
  const e = env({ props: { OZON_API_KEY: "", MAXBOT_WEBHOOK_URL: "" } });
  assert.throws(() => e.ctx.ozonWatchInstall(), /OZON_CLIENT_ID/);
  assert.throws(() => e.ctx.ozonWatchTest(), /MAXBOT_WEBHOOK_URL/);
  assert.strictEqual(e.calls.length, 0); assert.strictEqual(e.triggers.length, 0);
});
console.log(`\n${n} tests passed`);
