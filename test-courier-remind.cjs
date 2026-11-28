// Тест apps-script/CourierRemind.gs с заглушками Apps Script. Реальных пушей и записи в таблицу нет.
const fs = require("fs"), vm = require("vm"), assert = require("assert");
const SRC = fs.readFileSync(__dirname + "/apps-script/CourierRemind.gs", "utf8");

function mskDate(isoHm) {
  // "2026-11-28 08:30" as Moscow local → UTC Date (MSK = UTC+3)
  const [d, t] = isoHm.split(" ");
  const [y, m, day] = d.split("-").map(Number);
  const [H, M] = (t || "00:00").split(":").map(Number);
  return new Date(Date.UTC(y, m - 1, day, H - 3, M, 0));
}

function row(extra) {
  return Object.assign({
    sent: "27.11.2026 10:00", cb: "ЦБ-971", posting: "48210021-013-1",
    status: "Согласован", courier: "Рашад", date: "28.11.2026",
    address: "Мытищи, Новомытищинский пр-т, 33к2", phone: "+79001111111",
    ext: "", packs: "6 уп 60×60", unload: "Лифт, эт. 6",
    delivery: "3000", lift: "900", pay: "3900",
    comment: "Время доставки: 10:00–12:00",
    courier_comment: "Согласовано: клиент · 27.11 18:00 · интервал 10:00–12:00",
    delivered_at: "", lat: "55.9", lon: "37.7"
  }, extra);
}

function env(o) {
  o = o || {};
  const props = Object.assign({}, o.props || {});
  const calls = {notice: [], push: [], remind: []};
  const triggers = (o.triggers || []).slice();
  let rows = (o.rows || []).map(r => Object.assign({}, r));
  let locked = false;
  let pushOk = o.pushOk != null ? o.pushOk : 1;
  const ctx = {
    console: {log() {}, warn() {}, error() {}},
    JSON, Date, Math, String, Number, parseInt, isFinite, Error, Object,
    TZ: "Europe/Moscow",
    PropertiesService: {getScriptProperties: () => ({
      getProperty: k => (k in props ? props[k] : null),
      setProperty: (k, v) => { props[k] = String(v); },
      setProperties: (m) => { Object.assign(props, m); },
      deleteProperty: k => { delete props[k]; }
    })},
    LockService: {getScriptLock: () => ({
      tryLock: () => (o.busy ? false : (locked = true)),
      waitLock: () => { locked = true; },
      releaseLock: () => { locked = false; }
    })},
    ScriptApp: {
      getProjectTriggers: () => triggers.slice(),
      deleteTrigger: t => { const i = triggers.indexOf(t); if (i >= 0) triggers.splice(i, 1); },
      newTrigger: fn => ({timeBased: () => ({everyMinutes: m => ({create: () => {
        const t = {fn, m, getHandlerFunction: () => fn}; triggers.push(t); return t;
      }})})})
    },
    Utilities: {formatDate: (d, tz, fmt) => {
      assert.strictEqual(tz, "Europe/Moscow");
      const x = new Date(d.getTime() + 3 * 3600 * 1000);
      const p = n => (n < 10 ? "0" : "") + n;
      const map = {yyyy: x.getUTCFullYear(), MM: p(x.getUTCMonth() + 1), dd: p(x.getUTCDate()),
        HH: p(x.getUTCHours()), mm: p(x.getUTCMinutes())};
      return fmt.replace(/yyyy|MM|dd|HH|mm/g, k => map[k]);
    }},
    listRows: () => rows.map(r => Object.assign({}, r)),
    setNotice: n => { calls.notice.push(JSON.parse(JSON.stringify(n))); },
    push: (jwts, prop) => { calls.push.push({jwts: jwts || {}, prop: prop || "SUBS"}); return pushOk; },
    remind: (posting, text, jwts) => { calls.remind.push({posting, text, jwts}); return {pushed: pushOk}; }
  };
  vm.createContext(ctx); vm.runInContext(SRC, ctx);
  return {
    ctx, props, calls, triggers, rows,
    setRows: r => { rows = r.map(x => Object.assign({}, x)); },
    setPush: n => { pushOk = n; }
  };
}

let n = 0;
const t = (name, f) => { f(); n++; console.log("ok -", name); };

t("quiet hours 21:00–08:00: no pushes, dry run still lists nothing to send", () => {
  const e = env({rows: [row()]});
  const night = e.ctx.courierRemindTick(mskDate("2026-11-27 21:00"));
  assert.strictEqual(night.quiet, true);
  assert.strictEqual(night.sent, 0);
  assert.strictEqual(e.calls.push.length, 0);
  const late = e.ctx.courierRemindTick(mskDate("2026-11-28 07:59"));
  assert.strictEqual(late.quiet, true);
  assert.strictEqual(e.calls.push.length, 0);
  const dry = e.ctx.courierRemindTest(mskDate("2026-11-28 07:59"));
  assert.strictEqual(dry.dry, true);
  assert.strictEqual(dry.quiet, true);
  assert.strictEqual(dry.count, 0);
});

t("morning digest ~08:30: today's + overdue, returns listed, no money, type remind", () => {
  const e = env({rows: [
    row(),
    row({cb: "ЦБ-972", posting: "A-2", date: "28.11.2026", address: "Реутов, Юбилейный пр-т, 61",
      comment: "Время доставки: 16:00–18:00", status: "Новый", courier_comment: ""}),
    row({cb: "ЦБ-966", posting: "A-3", date: "27.11.2026", address: "Москва, Профсоюзная ул., 104",
      comment: "Время доставки: 16:00–18:00", status: "Согласован"}),
    row({cb: "ЦБ-968", posting: "71187501-0092-1-R", date: "", address: "Москва, Ленинский пр-т, 99",
      comment: 'Возврат: {"of":"71187501-0092-1","note":"заберите плитку","price":"договорная"}',
      status: "Новый", courier_comment: "", delivery: "", lift: "", pay: "0"}),
    row({cb: "ЦБ-999", posting: "Z-1", date: "28.11.2026", status: "Доставлен", comment: "Время доставки: 10:00–12:00"}),
    row({cb: "ЦБ-998", posting: "Z-2", date: "28.11.2026", status: "Отменён", comment: "Время доставки: 10:00–12:00"})
  ]});
  e.ctx.courierRemindInstall(mskDate("2026-11-28 08:00"));
  const r = e.ctx.courierRemindTick(mskDate("2026-11-28 08:30"));
  assert.strictEqual(r.sent, 2); // digest + daily return
  const texts = e.calls.notice.map(n => n.text).join("\n---\n");
  assert.match(texts, /Сегодня 3 доставки \(\+1 возврат\)/);
  assert.match(texts, /ЦБ-971 · Мытищи · 10:00–12:00/);
  assert.match(texts, /ЦБ-972 · Реутов · 16:00–18:00/);
  assert.match(texts, /ЦБ-966 · Москва · 16:00–18:00/);
  assert.match(texts, /↩️ ЦБ-968 · Москва/);
  assert.ok(e.calls.notice[0].type === "remind");
  assert.ok(!/₽|3900|3000|900/.test(JSON.stringify(e.calls.notice)));
  assert.ok(!/₽|3900|3000/.test(JSON.stringify(e.calls.push)));
  // same morning: no second digest
  assert.strictEqual(e.ctx.courierRemindTick(mskDate("2026-11-28 08:40")).sent, 0);
});

t("digest not sent before 08:30", () => {
  const e = env({rows: [row()]});
  e.ctx.courierRemindInstall(mskDate("2026-11-28 08:00"));
  const r = e.ctx.courierRemindTick(mskDate("2026-11-28 08:20"));
  assert.strictEqual(r.sent, 0);
  assert.strictEqual(e.calls.push.length, 0);
});

t("pre-window ~60 min before start, adds 'не забудьте согласовать' if not agreed", () => {
  const agreed = row({comment: "Время доставки: 14:00–16:00",
    courier_comment: "Согласовано: клиент · 28.11 09:00 · интервал 14:00–16:00", status: "Согласован"});
  const fresh = row({cb: "ЦБ-973", posting: "B-1", address: "Реутов, Юбилейный пр-т, 61",
    comment: "Время доставки: 14:00–16:00", status: "Новый", courier_comment: ""});
  const e = env({rows: [agreed, fresh]});
  e.ctx.courierRemindInstall(mskDate("2026-11-28 12:00"));
  const r = e.ctx.courierRemindTick(mskDate("2026-11-28 13:00"));
  assert.strictEqual(r.sent, 2);
  const byCb = {};
  e.calls.notice.forEach(n => { byCb[n.cb] = n.text; });
  assert.match(byCb["ЦБ-971"], /Через час доставка ЦБ-971 · Мытищи/);
  assert.doesNotMatch(byCb["ЦБ-971"], /согласовать/);
  assert.match(byCb["ЦБ-973"], /Через час доставка ЦБ-973 · Реутов/);
  assert.match(byCb["ЦБ-973"], /не забудьте согласовать/i);
});

t("pre-window: too early / already started → no 'через час'", () => {
  const e = env({rows: [row({comment: "Время доставки: 14:00–16:00"})]});
  e.ctx.courierRemindInstall(mskDate("2026-11-28 10:00"));
  assert.strictEqual(e.ctx.courierRemindTick(mskDate("2026-11-28 12:50")).sent, 0);
  assert.strictEqual(e.ctx.courierRemindTick(mskDate("2026-11-28 14:00")).sent, 0);
  // 13:05 is inside the hour — would send, but not in this test's first call
});

t("not agreed by ~11:00: reminder to call; already agreed skipped", () => {
  const e = env({rows: [
    row({cb: "ЦБ-973", posting: "C-1", status: "Новый", courier_comment: "", comment: "Время доставки: 16:00–18:00"}),
    row({cb: "ЦБ-971", posting: "C-2", status: "Согласован"})
  ]});
  e.ctx.courierRemindInstall(mskDate("2026-11-28 10:30"));
  assert.strictEqual(e.ctx.courierRemindTick(mskDate("2026-11-28 10:50")).sent, 0);
  const r = e.ctx.courierRemindTick(mskDate("2026-11-28 11:00"));
  assert.strictEqual(r.sent, 1);
  assert.match(e.calls.notice[0].text, /Не согласовано: ЦБ-973 · позвоните клиенту и согласуйте доставку/);
  assert.strictEqual(e.calls.notice[0].posting, "C-1");
  assert.strictEqual(e.ctx.courierRemindTick(mskDate("2026-11-28 11:20")).sent, 0);
});

t("overdue: one reminder after window end, not repeated", () => {
  const e = env({rows: [row({comment: "Время доставки: 10:00–12:00", date: "28.11.2026"})]});
  e.ctx.courierRemindInstall(mskDate("2026-11-28 09:00"));
  assert.strictEqual(e.ctx.courierRemindTick(mskDate("2026-11-28 11:50")).sent, 0);
  const r = e.ctx.courierRemindTick(mskDate("2026-11-28 12:00"));
  assert.strictEqual(r.sent, 1);
  assert.match(e.calls.notice[0].text, /Отметьте доставку ЦБ-971 или сообщите о проблеме/);
  assert.strictEqual(e.ctx.courierRemindTick(mskDate("2026-11-28 12:20")).sent, 0);
  assert.strictEqual(e.ctx.courierRemindTick(mskDate("2026-11-28 18:00")).sent, 0);
});

t("returns: daily reminder until picked, mentions calling first; stops when picked", () => {
  const ret = row({cb: "ЦБ-968", posting: "X-1-R", date: "", status: "Новый",
    comment: 'Возврат: {"of":"X-1"}', courier_comment: "", address: "Москва, Ленинский пр-т, 99"});
  const e = env({rows: [ret]});
  e.ctx.courierRemindInstall(mskDate("2026-11-27 12:00"));
  const d1 = e.ctx.courierRemindTick(mskDate("2026-11-28 08:30"));
  assert.ok(d1.sent >= 1);
  const retText = e.calls.notice.map(n => n.text).filter(s => /Возврат ЦБ-968/.test(s));
  assert.strictEqual(retText.length, 1);
  assert.match(retText[0], /сначала позвоните клиенту/);
  assert.strictEqual(e.ctx.courierRemindTick(mskDate("2026-11-28 12:00")).sent, 0);
  const d2 = e.ctx.courierRemindTick(mskDate("2026-11-29 08:30"));
  assert.ok(d2.sent >= 1);
  e.setRows([Object.assign({}, ret, {status: "Доставлен", delivered_at: "29.11.2026 09:00"})]);
  assert.strictEqual(e.ctx.courierRemindTick(mskDate("2026-11-30 08:30")).sent, 0);
});

t("FBS warehouse and ППЗ rows never planned or pushed", () => {
  const e = env({rows: [
    row({cb: "ЦБ-F1", posting: "F-1", address: "ППЗ Реутовская, 12", comment: "Время доставки: 10:00–12:00"}),
    row({cb: "ЦБ-F2", posting: "F-2", unload: "ППЗ", address: "Москва, Ленина 1", comment: "Время доставки: 10:00–12:00"}),
    row({cb: "ЦБ-F3", posting: "F-3", address: "Химки, Ленина 1",
      comment: "Время доставки: 10:00–12:00\nOzon: {\"warehouse_id\":\"1020005035230080\"}"})
  ]});
  const dry = e.ctx.courierRemindTest(mskDate("2026-11-28 08:30"));
  assert.strictEqual(dry.count, 0);
  e.ctx.courierRemindInstall(mskDate("2026-11-28 08:00"));
  assert.strictEqual(e.ctx.courierRemindTick(mskDate("2026-11-28 08:30")).sent, 0);
  assert.strictEqual(e.ctx.courierRemindTick(mskDate("2026-11-28 11:00")).sent, 0);
  assert.strictEqual(e.calls.push.length, 0);
});

t("other couriers ignored; empty courier treated as Рашад", () => {
  const e = env({rows: [
    row({cb: "ЦБ-1", posting: "P-1", courier: "Иван", comment: "Время доставки: 10:00–12:00"}),
    row({cb: "ЦБ-2", posting: "P-2", courier: "", comment: "Время доставки: 16:00–18:00", status: "Новый", courier_comment: ""})
  ]});
  const dry = e.ctx.courierRemindTest(mskDate("2026-11-28 08:30"));
  const cbs = dry.items.filter(i => i.type === "digest").map(i => i.text).join();
  assert.match(cbs, /ЦБ-2/);
  assert.doesNotMatch(cbs, /ЦБ-1/);
});

t("install seeds past windows without pushing, creates one 10-min trigger, removes duplicates", () => {
  const other = {getHandlerFunction: () => "ozonWatchTick"};
  const old = {getHandlerFunction: () => "courierRemindTick"};
  const e = env({
    rows: [row({comment: "Время доставки: 10:00–12:00"})],
    triggers: [old, old, other]
  });
  const r = e.ctx.courierRemindInstall(mskDate("2026-11-28 15:00"));
  assert.strictEqual(e.calls.push.length, 0);
  assert.strictEqual(e.triggers.filter(x => x.getHandlerFunction() === "courierRemindTick").length, 1);
  assert(e.triggers.includes(other));
  assert.strictEqual(e.triggers.find(x => x.fn).m, 10);
  assert.strictEqual(e.props.CR_SEEDED, "1");
  assert.ok(r.seeded >= 1);
  // tick after install does not send overdue/digest retroactively
  assert.strictEqual(e.ctx.courierRemindTick(mskDate("2026-11-28 15:10")).sent, 0);
});

t("tick without install seeds silently (no flood of overdue)", () => {
  const e = env({rows: [row({comment: "Время доставки: 10:00–12:00"})]});
  const r = e.ctx.courierRemindTick(mskDate("2026-11-28 18:00"));
  assert.strictEqual(e.calls.push.length, 0);
  assert.strictEqual(e.props.CR_SEEDED, "1");
  assert.strictEqual(e.ctx.courierRemindTick(mskDate("2026-11-28 18:20")).sent, 0);
});

t("dedupe: each type per order at most once (return once a day)", () => {
  const e = env({rows: [
    row({status: "Новый", courier_comment: "", comment: "Время доставки: 14:00–16:00"})
  ]});
  e.ctx.courierRemindInstall(mskDate("2026-11-28 08:00"));
  e.ctx.courierRemindTick(mskDate("2026-11-28 08:30")); // digest
  e.ctx.courierRemindTick(mskDate("2026-11-28 11:00")); // agree
  e.ctx.courierRemindTick(mskDate("2026-11-28 13:00")); // pre
  e.ctx.courierRemindTick(mskDate("2026-11-28 16:00")); // overdue
  const types = e.calls.notice.map(() => true);
  const nPush = e.calls.push.length;
  e.ctx.courierRemindTick(mskDate("2026-11-28 08:40"));
  e.ctx.courierRemindTick(mskDate("2026-11-28 11:10"));
  e.ctx.courierRemindTick(mskDate("2026-11-28 13:10"));
  e.ctx.courierRemindTick(mskDate("2026-11-28 16:10"));
  assert.strictEqual(e.calls.push.length, nPush);
});

t("courierRemindTest is dry-run: no push, no notice, no sent memory", () => {
  const e = env({rows: [row(), row({cb: "ЦБ-968", posting: "R-1-R", date: "", status: "Новый",
    comment: "Возврат: {}", courier_comment: ""})]});
  const dry = e.ctx.courierRemindTest(mskDate("2026-11-28 08:30"));
  assert.strictEqual(dry.dry, true);
  assert.ok(dry.count >= 1);
  assert.ok(dry.items.every(i => i.text && i.type));
  assert.strictEqual(e.calls.push.length, 0);
  assert.strictEqual(e.calls.notice.length, 0);
  assert.ok(!e.props.CR_SENT_0);
  // real tick still can send afterwards
  e.ctx.courierRemindInstall(mskDate("2026-11-28 08:00"));
  assert.ok(e.ctx.courierRemindTick(mskDate("2026-11-28 08:30")).sent >= 1);
});

t("busy lock → tick skipped, no list/push", () => {
  const e = env({busy: true, rows: [row()]});
  const r = e.ctx.courierRemindTick(mskDate("2026-11-28 08:30"));
  assert.strictEqual(r.error, "busy");
  assert.strictEqual(e.calls.push.length, 0);
});

t("uninstall removes only our triggers", () => {
  const other = {getHandlerFunction: () => "ozonWatchTick"};
  const e = env({triggers: [other], rows: [row()]});
  e.ctx.courierRemindInstall(mskDate("2026-11-28 08:00"));
  assert.strictEqual(e.ctx.courierRemindUninstall().removed, 1);
  assert.deepStrictEqual(e.triggers, [other]);
});

t("sent store prunes >21 days, chunks under 9KB", () => {
  const e = env();
  const now = mskDate("2026-11-28 12:00").getTime();
  const today = Math.floor(now / 86400000);
  const big = {};
  for (let i = 0; i < 800; i++) big["pre:9" + String(i).padStart(7, "0") + "-0001-1:2026-11-28"] = today;
  big["OLD:x"] = today - 22;
  big["EDGE:x"] = today - 21;
  e.ctx.CR_saveSent_(big, now);
  const N = Number(e.props.CR_SENT_N);
  assert(N >= 1);
  for (let i = 0; i < N; i++) assert(e.props["CR_SENT_" + i].length <= 8000);
  const back = e.ctx.CR_loadSent_();
  assert(!("OLD:x" in back));
  assert("EDGE:x" in back);
  e.ctx.CR_saveSent_({X: today}, now);
  assert.strictEqual(e.props.CR_SENT_N, "1");
  assert(!("CR_SENT_1" in e.props));
});

t("window parser: en-dash, 'с … до …', 'в течение дня', agreed slot fallback", () => {
  const e = env();
  const a = e.ctx.CR_window_({date: "28.11.2026", comment: "Время доставки: 10:00–12:00"});
  assert.strictEqual(a.label, "10:00–12:00");
  assert.ok(a.hasStart);
  const b = e.ctx.CR_window_({date: "28.11.2026", comment: "Время доставки: с 15:30 до 17:00"});
  assert.strictEqual(b.label, "15:30–17:00");
  const c = e.ctx.CR_window_({date: "28.11.2026", comment: "Время доставки: в течение дня"});
  assert.strictEqual(c.label, "в течение дня");
  const d = e.ctx.CR_window_({date: "28.11.2026", comment: "",
    courier_comment: "Согласовано: прораб · 27.11 12:00 · интервал 12–14"});
  assert.ok(d.hasStart);
  assert.strictEqual(d.label, "12:00–14:00");
  const e0 = e.ctx.CR_window_({date: "", comment: "Время доставки: 10:00–12:00"});
  assert.strictEqual(e0, null);
});

t("no financial data even if pay fields are huge", () => {
  const e = env({rows: [row({pay: "999999", delivery: "888888", lift: "777"})]});
  const dry = e.ctx.courierRemindTest(mskDate("2026-11-28 08:30"));
  const blob = JSON.stringify(dry);
  assert.doesNotMatch(blob, /₽|999999|888888|777/);
});

t("area skips postal code and region, keeps city", () => {
  const e = env();
  assert.strictEqual(e.ctx.CR_area_("Мытищи, Новомытищинский пр-т, 33к2"), "Мытищи");
  assert.strictEqual(e.ctx.CR_area_("141013, Россия, Московская Область, Мытищи, 1-й Стрелковый переулок, 5б"), "Мытищи");
  assert.strictEqual(e.ctx.CR_area_("Москва, Ленинский пр-т, 99"), "Москва");
});

console.log(`\n${n} tests passed`);
