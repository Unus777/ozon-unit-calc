const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const fbs = require("./fbs.js");

const wh = {warehouse_id: 1020005035230080, warehouse: "FBS Алмалы (Плитка 60×60 Розница)"};
const part = (i, extra = {}) => Object.assign({
  posting_number: `90000001-0001-${i}`,
  order_id: 424242,
  order_number: "90000001-0001",
  delivery_method: wh,
  products: [{name: i % 2 ? "Другое имя" : "Тестовый Уайт", quantity: 1, offer_id: "T-60"}],
  customer: {name: "Покупатель тест"},
  status: "awaiting_deliver",
  shipment_date: "2026-11-09T12:00:00Z",
}, extra);
const eight = Array.from({length: 8}, (_, i) => part(i + 1));
const flash = {
  posting_number: "52725489-0199-1", order_id: 88, order_number: "52725489-0199",
  delivery_method: {warehouse_id: 999, warehouse: "Свой склад"},
  tpl_integration_type: "non_integrated", products: [{name: "Флэшстоун"}], status: "awaiting_deliver",
};
const memory = () => { const mem = {}; return {mem, get(k) { return mem[k]; }, set(k, v) { mem[k] = String(v); }}; };

assert.equal(fbs.isAlmalyFbs(eight[0]), true);
assert.equal(fbs.isAlmalyFbs({delivery_method: {warehouse_id: "1020005035230080"}}), true);
assert.equal(fbs.isAlmalyFbs(flash), false);
assert.equal(fbs.isAlmalyFbs({tpl_integration_type: "ozon", delivery_method: {warehouse_id: 1, tpl_provider: "Доставка Ozon", warehouse: "Другой"}, products: [{name: "FBS Алмалы"}]}), false);
assert.equal(fbs.isAlmalyFbs({products: [{name: "Миррор Вайт"}], customer: {name: "Один"}, posting_number: "13027396-2392-1"}), false);

const bare = [1, 2].map(i => ({posting_number: `90000001-2392-${i}`, delivery_method: wh, products: [{name: "Тестовый Уайт"}], customer: {name: "Один"}}));
assert.equal(fbs.fbsOrderKey(bare[0]), "");
assert.equal(fbs.groupFbsPostings(bare).length, 2);
assert.equal(fbs.fbsSiblings(bare[0], bare).length, 1);
assert.equal(fbs.groupFbsPostings(eight.concat([flash, part(1, {posting_number: "90000002-0002-1", order_id: 7, order_number: "90000002-0002"})])).length, 2);
assert.equal(fbs.groupFbsPostings(eight)[0].postings.length, 8);
assert.equal(fbs.fbsSiblings(Object.assign({}, eight[0], {order_id: 424242}), eight.concat([Object.assign({}, flash, {order_id: 424242})])).length, 8);

const rfbs = {posting_number: "1-1-1", status: "awaiting_deliver", delivery_method: {warehouse_id: 5}};
assert.equal(fbs.orderTab(rfbs, null), "new");
assert.equal(fbs.orderTab(rfbs, {status: "Новый"}), "courier");
assert.equal(fbs.orderTab(Object.assign({}, rfbs, {status: "delivered"}), null), "done");
assert.equal(fbs.orderTab(Object.assign({}, rfbs, {status: "cancelled"}), null), "cancel");
assert.equal(fbs.orderTab(eight[0], {status: "Доставлен"}), "fbs");
assert.equal(fbs.orderTab(Object.assign({}, eight[0], {status: "delivered"}), null), "fbs");
assert.equal(fbs.orderTab(Object.assign({}, eight[0], {status: "cancelled"}), null), "fbs");

assert.equal(fbs.isFbsSheetRow({address: "ППЗ Ozon (Балашиха, ул. Реутовская, 5)", unload: "Сдача в ППЗ"}), true);
assert.equal(fbs.isFbsSheetRow({address: "ул. Реутовская, 10", unload: "Нет"}), false);
assert.equal(fbs.rashadDeliveries([{posting: "a", address: "ППЗ Ozon"}, {posting: "b", address: "Химки"}, {posting: "c", unload: "Сдача в ППЗ"}]).map(r => r.posting).join(), "b");
assert.throws(() => fbs.assertRashadPath(eight[0], null), /Рашаду/);
assert.throws(() => fbs.assertRashadPath(null, {address: "ППЗ Ozon"}), /Рашаду/);
assert.doesNotThrow(() => fbs.assertRashadPath(flash, {address: "Химки", unload: "Нет"}));

const html = fbs.fbsBoardHtml(eight.concat([flash]), {deliv: {}, local: {}});
for (let i = 1; i <= 8; i++) assert.match(html, new RegExp("90000001-0001-" + i + "\\b"));
assert.match(html, /1020005035230080/);
assert.match(html, /FBS Алмалы \(Плитка 60×60 Розница\)/);
assert.match(html, /Сохранить ЦБ для всех 8/);
assert.match(html, /Распечатать этикетку/);
assert.match(html, /Собрать и отгрузить до/);
assert.match(html, /не уходят Рашаду/);
assert.doesNotMatch(html, /data-remind|Отправить курьеру|Сдан в ППЗ|Сдал в ППЗ|Отправить в ППЗ|Флэшстоун|52725489|₽\/м²/);

(async () => {
  const storage = memory();
  const deliv = {};
  for (const posting of eight) deliv[posting.posting_number] = {posting: posting.posting_number, cb: "", status: "Новый"};
  deliv[eight[0].posting_number].cb = "ЦБ-101";
  deliv[eight[1].posting_number].cb = "ЦБ-202";
  const blocked = fbs.sharedCbPlan(eight, deliv, {}, "303");
  assert.equal(blocked.needsConfirm, true);
  assert.ok(blocked.conflicts.some(row => row.posting === eight[0].posting_number && row.current.includes("ЦБ-101")));
  const conflictHtml = fbs.fbsBoardHtml(eight, {deliv, local: {}});
  assert.match(conflictHtml, /Разные ЦБ/);
  assert.match(conflictHtml, /ЦБ-101/);
  assert.match(conflictHtml, /ЦБ-202/);
  assert.match(conflictHtml, /value=""/);
  assert.equal(JSON.stringify(deliv[eight[7].posting_number]), JSON.stringify({posting: eight[7].posting_number, cb: "", status: "Новый"}));
  assert.equal(fbs.groupCbPicture(eight, deliv, fbs.loadFbsState(storage)).conflict, true);

  const calls = [];
  const other = {posting: "1-2-3", cb: "ЦБ-1", status: "Новый"};
  deliv[other.posting] = other;
  const saved = await fbs.persistSharedCb({
    numbers: eight.map(item => item.posting_number), cb: "303", deliv, storage, allowSheet: true, adminKey: "k",
    sheetApi: async body => {
      calls.push(JSON.parse(JSON.stringify(body)));
      return {posting: body.posting, cb: body.data.cb, status: "Новый"};
    },
  });
  assert.equal(calls.length, 8);
  assert.ok(calls.every(body => body.action === "update" && body.data.cb === "ЦБ-303" && !("jwts" in body) && body.action !== "create" && body.action !== "remind"));
  assert.ok(!calls.some(body => body.posting === other.posting));
  assert.equal(other.cb, "ЦБ-1");
  assert.equal(saved.localOnly.length, 0);
  assert.match(fbs.fbsCbSavedText(saved), /^ЦБ-303 записан в таблицу/);
  const reloaded = fbs.loadFbsState(storage);
  for (const posting of eight) assert.equal(reloaded[posting.posting_number].cb, "ЦБ-303");
  assert.equal(reloaded[other.posting], undefined);
  for (const row of saved.updated) deliv[row.posting] = row;
  assert.equal(fbs.groupCbPicture(eight, deliv, reloaded).agreed, "ЦБ-303");
  assert.equal(fbs.groupCbPicture(eight, deliv, reloaded).conflict, false);

  const localOnly = memory();
  const calls2 = [];
  const alone = await fbs.persistSharedCb({
    numbers: eight.map(item => item.posting_number), cb: "ЦБ-15", deliv: {}, storage: localOnly, allowSheet: true, adminKey: "k",
    sheetApi: async body => { calls2.push(body); return body; },
  });
  assert.equal(calls2.length, 0);
  assert.equal(alone.localOnly.length, 8);
  assert.match(fbs.fbsCbSavedText(alone), /этом устройстве/);
  assert.match(fbs.fbsCbSavedText(alone), /Рашаду/);
  assert.equal(fbs.loadFbsState(localOnly)[eight[3].posting_number].cb, "ЦБ-15");

  const broken = memory();
  const had = {[eight[0].posting_number]: {posting: eight[0].posting_number, cb: "ЦБ-101", status: "Новый"}};
  await assert.rejects(() => fbs.persistSharedCb({
    numbers: [eight[0].posting_number], cb: "ЦБ-404", deliv: had, storage: broken, allowSheet: true, adminKey: "k",
    sheetApi: async () => { throw new Error("нет сети"); },
  }), /нет сети/);
  assert.deepEqual(fbs.loadFbsState(broken), {});
  assert.equal(had[eight[0].posting_number].cb, "ЦБ-101");

  const quiet = memory();
  const posted = Object.assign({}, eight[0]);
  const marked = fbs.setFbsStage(quiet, posted.posting_number, "handed", true, "2026-11-08T10:00:00Z");
  fbs.setFbsStage(quiet, posted.posting_number, "truck", true, "2026-11-08T09:00:00Z");
  assert.equal(marked.status, undefined);
  assert.equal(posted.status, "awaiting_deliver");
  assert.equal(fbs.officialOzon(posted).accepted, false);
  assert.equal(fbs.officialOzon(posted).finalDelivery, false);
  assert.equal(fbs.loadFbsState(quiet)[posted.posting_number].stages.truck, true);
  assert.equal(fbs.loadFbsState(quiet)[posted.posting_number].stages.handed, true);
  fbs.setFbsStageAll(quiet, [eight[2].posting_number], "truck", true, "2026-11-08T09:30:00Z");
  assert.equal(fbs.loadFbsState(quiet)[eight[7].posting_number], undefined);

  const offline = await fbs.requestFbsLabel({postingNumber: eight[0].posting_number, online: false, fetchImpl: async () => { throw new Error("нельзя"); }, cid: "1", key: "secret-key"});
  assert.equal(offline.ok, false);
  assert.match(offline.error, /Нет подключения/);
  assert.equal(fbs.applyLabelResult(quiet, eight[0].posting_number, offline, "now").ok, false);
  assert.equal(fbs.loadFbsState(quiet)[eight[0].posting_number].stages.label, undefined);
  const failed = await fbs.requestFbsLabel({
    postingNumber: eight[0].posting_number, online: true, cid: "1", key: "secret-key",
    fetchImpl: async () => ({ok: false, status: 400, text: async () => "secret-key bad", headers: {get: () => "application/json"}}),
  });
  assert.equal(failed.ok, false);
  assert.match(failed.error, /400/);
  assert.doesNotMatch(failed.error, /secret-key/);
  const weird = await fbs.requestFbsLabel({
    postingNumber: eight[0].posting_number, online: true, cid: "1", key: "secret-key",
    fetchImpl: async () => ({ok: true, status: 200, headers: {get: () => "application/json"}, blob: async () => ({size: 10})}),
  });
  assert.equal(weird.ok, false);
  assert.match(weird.error, /не PDF/);
  const empty = await fbs.requestFbsLabel({
    postingNumber: eight[0].posting_number, online: true, cid: "1", key: "secret-key",
    fetchImpl: async () => ({ok: true, status: 200, headers: {get: () => "application/pdf"}, blob: async () => ({size: 0})}),
  });
  assert.equal(empty.ok, false);
  const down = await fbs.requestFbsLabel({
    postingNumber: eight[0].posting_number, online: true, cid: "1", key: "secret-key",
    fetchImpl: async () => { throw new Error("offline"); },
  });
  assert.match(down.error, /Сеть недоступна/);
  const ok = await fbs.requestFbsLabel({
    postingNumber: eight[0].posting_number, online: true, cid: "1", key: "secret-key",
    fetchImpl: async () => ({ok: true, status: 200, headers: {get: () => "application/pdf"}, blob: async () => ({size: 12, type: "application/pdf"})}),
  });
  assert.equal(ok.ok, true);
  const labeled = fbs.applyLabelResult(quiet, eight[0].posting_number, ok, "2026-11-08T11:00:00Z");
  assert.equal(labeled.ok, true);
  assert.equal(labeled.state.stages.label, true);
  assert.equal(fbs.officialOzon(posted).accepted, false);

  const owner = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
  const courier = fs.readFileSync(path.join(__dirname, "courier.html"), "utf8");
  assert.doesNotMatch(owner, /Сдан в ППЗ|Отправить в ППЗ|Сдал в ППЗ/);
  assert.doesNotMatch(courier, /Сдан в ППЗ|Сдал в ППЗ|Сдача в ППЗ|сдача в ППЗ/);
  assert.match(owner, /commitFbsCb/);
  assert.match(courier, /rashadDeliveries/);

  const context = {OPEN: "demo", FOCUS: null, ROWS: [], todayStr: () => "", toIso: () => "", rub: x => String(x), yandexMaps: () => "#", appleMaps: () => "#",
    e: s => String(s ?? "").replace(/[&<>"']/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"})[c])};
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, "config.js"), "utf8"), context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, "fbs.js"), "utf8"), context);
  const slice = courier.slice(courier.indexOf("function telOf("), courier.indexOf("\nfunction draw("));
  vm.runInContext(slice, context);
  vm.runInContext(courier.slice(courier.indexOf("function alarmItem("), courier.indexOf("\nasync function sendAck(")), context);
  assert.equal(context.card({posting: "ppz", address: "ППЗ Ozon", unload: "Сдача в ППЗ", status: "Новый", cb: "ЦБ-1", comment: "", phone: ""}), "");
  const customer = context.card({posting: "demo", address: "ул. Реутовская, 10", unload: "Нет", status: "Новый", cb: "ЦБ-1", comment: "", phone: "", packs: "1 уп"});
  assert.match(customer, /Реутовская/);
  assert.doesNotMatch(customer, /ППЗ/);
  assert.equal(context.alarmItem({posting: "ppz", address: "ППЗ Ozon", unload: "Сдача в ППЗ", status: "Новый", cb: "ЦБ-1", comment: ""}), null);
  console.log("FBS: изоляция, общий ЦБ, конфликт, этапы и ошибки этикетки — проверки пройдены");
})().catch(err => { console.error(err); process.exit(1); });
