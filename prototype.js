/* Трекер заказов. Деньги и дни — calc.js, days.js, fbs.js. Запись в Ozon и таблицу перехватывается. */
(function () {
  const READ_SHEET = new Set(["list", "where", "payments"]);
  const READ_OZON = new Set(["/v4/posting/fbs/list", "/v3/posting/fbs/get", "/v5/product/info/prices"]);
  const nativeFetch = window.fetch.bind(window);
  window.__prototypeBlocked = [];
  window.fetch = (input, init) => {
    const url = typeof input === "string" ? input : (input && input.url) || "";
    const demo = new URLSearchParams(location.search).get("demo") === "1";
    const ozon = /api-seller\.ozon\.ru/.test(url);
    const sheet = url.startsWith(SCRIPT_URL) || /script\.google\.com\/macros/.test(url);
    if (ozon || sheet) {
      let action = "";
      try { action = JSON.parse((init && init.body) || "{}").action || ""; } catch {}
      const path = ozon ? url.split("api-seller.ozon.ru")[1].split("?")[0] : "";
      const allowed = !demo && ((ozon && READ_OZON.has(path)) || (sheet && READ_SHEET.has(action)));
      if (!allowed) {
        window.__prototypeBlocked.push(url.slice(0, 120));
        return Promise.reject(new Error("Прототип не записывает в таблицу и не пишет в Ozon"));
      }
    }
    return nativeFetch(input, init);
  };
  const liveSheet = sheetApi;
  sheetApi = function (payload) {
    if (!READ_SHEET.has(payload && payload.action) || new URLSearchParams(location.search).get("demo") === "1") {
      window.__prototypeBlocked.push("sheet:" + ((payload && payload.action) || "?"));
      return Promise.reject(new Error("Прототип не записывает в таблицу"));
    }
    return liveSheet(payload);
  };
})();

const DEMO = new URLSearchParams(location.search).get("demo") === "1";
const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"})[c]);
const sp = n => Math.round(Math.abs(Number(n) || 0)).toLocaleString("ru-RU").replace(/\u00a0/g, " ");
const rub = n => (Number(n) < 0 ? "−" : "") + sp(n) + " ₽";
const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const wide = () => matchMedia("(min-width: 1100px)").matches;
const SHIP = new Set(["awaiting_registration", "acceptance_in_progress", "awaiting_approve", "awaiting_packaging", "awaiting_deliver", "not_accepted"]);
const WAY = new Set(["delivering", "driver_pickup", "sent_by_seller"]);
const TRACK = [["sent", "Передан"], ["ack", "Принял"], ["agreed", "Согласован"], ["enroute", "В пути"], ["onsite", "На месте"], ["done", "Доставлен"]];
const ICO = {new: "orders", sent: "send", ack: "check", agreed: "calcheck", enroute: "truck", onsite: "pin", done: "checkc", cancel: "x"};
const NEXT = {new: "отправить Рашаду", sent: "ждём «Принял»", ack: "согласовать время", agreed: "выехать к клиенту", enroute: "будет «На месте»", onsite: "отметить доставку", done: "", cancel: ""};
const STORE = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} },
  del(k) { try { localStorage.removeItem(k); } catch {} },
};

let ORDERS = [], PRICES = {}, DELIV = {}, PAYS = [], PAYS_OK = false, RASHAD = null, LOGI = {}, UPDATED = Date.now();
let MODE = DEMO ? "demo" : "gate", LOADING = false, LOAD_ERR = "";
let TAB = "today", Q = "", OPEN = "", EXTRA = null, CONFIRM = null, FILTER = "all", VIEW = "lanes";
let ARCH = "7", ARCH_DAY = "", PANEL = "", PANEL_TAB = "courier";
let MAP = null, MAP_OK = null, PINS = [], RPIN = null, MAP_KEY = "", ROUTE_KEY = "", USER_MOVED = false, MAP_DIRTY = false;

const canSend = p => p && !isAlmalyFbs(p) && !DELIV[p.posting_number] && (SHIP.has(p.status) || WAY.has(p.status));
const buckets = () => dayBuckets(ORDERS.map((p, i) => [p, i]), DELIV, mskDay(Date.now()));
const todayRu = () => isoToRu(mskDay(Date.now()));
const moneyOf = p => orderMoney(p, DELIV[p.posting_number], PRICES, LOGI);

function unloadText(prr) {
  const floor = prr && prr.floor ? ", эт. " + prr.floor : "";
  if (!prr || !prr.code || prr.code === "none") return "Нет";
  return ({lift: "Лифт", stairs: "Лестница"}[prr.code] || prr.code) + floor;
}
function goodsLine(p) {
  return (p.products || []).map(x => `${x.quantity} уп ${tileFormat(String(x.offer_id || ""), x.name || "") || x.offer_id}`).join(" + ");
}
function orderKg(p) {
  return Math.round((p.products || []).reduce((s, x) => s + (Number(x.quantity) || 0) * packKg(tileFormat(String(x.offer_id || ""), x.name || "")), 0));
}
function addrParts(s) {
  const t = String(s || "").trim(), i = t.indexOf(",");
  return i > 0 ? [t.slice(0, i), t.slice(i + 1).trim()] : [t, ""];
}
function addrOf(p) {
  const d = DELIV[p.posting_number], a = ((p.customer || {}).address) || {};
  return (d && d.address) || a.address_tail || a.city || "Адрес уточняется";
}
function mskClock(v) {
  const d = new Date(v);
  return isNaN(d) ? "" : d.toLocaleTimeString("ru-RU", {timeZone: "Europe/Moscow", hour: "2-digit", minute: "2-digit"});
}
function whenShort(v) {
  const m = /(\d\d)\.(\d\d)(?:\.\d{4})?\s+(\d\d:\d\d)/.exec(String(v || ""));
  if (!m) return "";
  return `${m[1]}.${m[2]}` === agreedNow().slice(0, 5) ? m[3] : `${m[1]}.${m[2]} ${m[3]}`;
}
function ozWindow(p) {
  const an = (p && p.analytics_data) || {};
  if (!an.delivery_date_begin) return "";
  const day = mskDay(new Date(an.delivery_date_begin).getTime()), t = mskDay(Date.now());
  const label = day === t ? "Сегодня" : day === addDaysIso(t, 1) ? "Завтра" : isoToRu(day).slice(0, 5);
  return `${label} ${mskClock(an.delivery_date_begin)}${an.delivery_date_end ? "–" + mskClock(an.delivery_date_end) : ""}`;
}
function expectLine(p) {
  const d = DELIV[p.posting_number];
  if (!d) return ozWindow(p) || "Окно Ozon не пришло";
  const info = deliveryDetails(d.comment);
  const time = info.time || ((agreementOf(d) || {}).slot) || "";
  if (!d.date) return time ? "Дата не назначена · " + time : "Дата не назначена";
  const day = d.date === todayRu() ? "Сегодня" : d.date.slice(0, 5);
  return [day, time].filter(Boolean).join(" · ");
}
function lateOf(p) {
  const o = orderDay(p, DELIV[p.posting_number]);
  return o.kind === "work" && !!o.day && o.day < mskDay(Date.now());
}
function track(p) {
  const d = DELIV[p.posting_number];
  const n = d ? courierNotes(d.courier_comment) : {};
  const a = d ? agreementOf(d) : null;
  const cancelled = p.status === "cancelled" || !!(d && d.status === "Отменён");
  const delivered = p.status === "delivered" || !!(d && d.status === "Доставлен");
  const seen = !!(d && isAccepted(d));
  const has = {sent: !!d, ack: seen, agreed: !!(a || (d && d.status === "Согласован")), enroute: !!(n.enroute || n.onsite), onsite: !!n.onsite, done: delivered};
  if (delivered) { has.sent = has.ack = has.agreed = has.enroute = true; }
  let cur = 0;
  TRACK.forEach(([k], i) => { if (has[k]) cur = i; });
  if (delivered) cur = TRACK.length - 1;
  const at = {
    sent: d && d.sent, ack: n.ack && n.ack.at, agreed: a && a.at,
    enroute: n.enroute && n.enroute.at, onsite: n.onsite && n.onsite.at, done: d && d.delivered_at,
  };
  const steps = TRACK.map(([k, label], i) => ({k, label, when: i <= cur && at[k] ? whenShort(at[k]) : ""}));
  const problems = [];
  if (!cancelled && !delivered && d && !seen) problems.push({k: "unseen", t: "Рашад не видел заказ"});
  if (!cancelled && !delivered && lateOf(p)) problems.push({k: "late", t: "Дата прошла"});
  if (!cancelled && !delivered && d && !d.date) problems.push({k: "nodate", t: "Нет даты"});
  const live = rashadPoint();
  if (!cancelled && !delivered && (has.enroute || has.onsite) && live && !online(live)) problems.push({k: "off", t: "Рашад не в сети"});
  if (cancelled) return {key: "cancel", label: "Отменён", cur, steps, when: "", next: "", problems, seen, seenAt: "", expected: expectLine(p)};
  if (!d) return {key: "new", label: "Не отправлен", cur: -1, steps, when: whenShort(mskStamp(p.in_process_at)), next: NEXT.new, problems, seen: false, seenAt: "", expected: expectLine(p)};
  const key = TRACK[cur][0];
  return {key, label: TRACK[cur][1], cur, steps, when: whenShort(at[key]) || whenShort(at.sent), next: NEXT[key] || "", problems, seen, seenAt: n.ack ? whenShort(n.ack.at) : "", expected: expectLine(p)};
}
function urgency(p) {
  const t = track(p);
  if (t.problems.some(x => x.k === "late")) return 0;
  if (t.problems.some(x => x.k === "unseen")) return 1;
  if (t.key === "onsite") return 2;
  if (t.key === "enroute") return 3;
  if (t.problems.some(x => x.k === "nodate")) return 4;
  if (t.key === "agreed") return 5;
  if (t.key === "ack") return 6;
  if (t.key === "sent") return 7;
  if (t.key === "new") return 8;
  return t.key === "done" ? 20 : 30;
}
function passFilter(p) {
  const t = track(p);
  if (FILTER === "all") return true;
  if (FILTER === "problem") return t.problems.length > 0;
  if (FILTER === "unseen" || FILTER === "late" || FILTER === "nodate" || FILTER === "off") return t.problems.some(x => x.k === FILTER) || (FILTER === "off" && (t.key === "enroute" || t.key === "onsite"));
  return t.key === FILTER;
}
const WD = ["вс", "пн", "вт", "ср", "чт", "пт", "сб"];
function dayTitle(iso) {
  const t = mskDay(Date.now()), d = new Date(iso + "T12:00:00Z");
  const label = d.toLocaleDateString("ru-RU", {day: "numeric", month: "long", timeZone: "UTC"});
  if (iso === t) return "Сегодня, " + label;
  if (iso === addDaysIso(t, 1)) return "Завтра, " + label;
  if (iso === addDaysIso(t, -1)) return "Вчера, " + label;
  const w = WD[d.getUTCDay()];
  return w.charAt(0).toUpperCase() + w.slice(1) + ", " + label;
}
function archBounds() {
  const t = mskDay(Date.now());
  if (ARCH === "1") return [addDaysIso(t, -1), addDaysIso(t, -1)];
  if (ARCH === "7") return [addDaysIso(t, -7), addDaysIso(t, -1)];
  if (ARCH === "30") return [addDaysIso(t, -30), addDaysIso(t, -1)];
  if (ARCH === "day") return [ARCH_DAY || addDaysIso(t, -1), ARCH_DAY || addDaysIso(t, -1)];
  return ["", ""];
}
function tabOf(p) {
  const b = buckets(), id = p.posting_number, has = list => list.some(([x]) => x.posting_number === id);
  if (has(b.today.work) || has(b.today.done) || has(b.today.cancel)) return "today";
  if (has(b.fresh.send) || has(b.fresh.nodate)) return "fresh";
  if (Object.values(b.upcoming).some(has)) return "ahead";
  return "archive";
}
function llOf(p) {
  const d = DELIV[p.posting_number];
  if (d && isFinite(+d.lat) && isFinite(+d.lon) && +d.lat) return [+d.lat, +d.lon];
  const a = ((p.customer || {}).address) || {};
  if (isFinite(+a.latitude) && isFinite(+a.longitude) && +a.latitude) return [+a.latitude, +a.longitude];
  return null;
}
function nearest(points, start) {
  const left = points.slice(), out = [];
  let cur = start;
  while (left.length) {
    left.sort((a, b) => (a.ll[0] - cur[0]) ** 2 + (a.ll[1] - cur[1]) ** 2 - ((b.ll[0] - cur[0]) ** 2 + (b.ll[1] - cur[1]) ** 2));
    out.push(left.shift()); cur = out[out.length - 1].ll;
  }
  return out;
}
function rashadPoint() {
  const l = RASHAD && RASHAD.latest;
  return l && l.lat != null && l.lng != null ? l : null;
}
function rashadTodayLL() {
  const l = rashadPoint();
  return l && mskDay(l.ts) === mskDay(Date.now()) ? [+l.lat, +l.lng] : null;
}
function seenShort(point) {
  if (!point || !point.ts) return "нет данных";
  const age = Date.now() - Number(point.ts);
  if (age < 3 * 60 * 1000) return "в сети";
  if (age < 60 * 60 * 1000) return Math.max(1, Math.round(age / 60000)) + " мин назад";
  return geoSeenText(point, Date.now()).split(" · ")[0].replace("Был в сети ", "");
}
function online(point) { return !!(point && point.ts && Date.now() - point.ts < 3 * 60 * 1000); }
function freshLabel() {
  const s = Math.round((Date.now() - UPDATED) / 1000);
  if (s < 20) return "сейчас";
  if (s < 60) return "обновлено " + s + " с назад";
  return "обновлено " + Math.round(s / 60) + " мин назад";
}

function tile(fmt, qty, price) {
  return fmt === "60×120"
    ? {offer_id: "612-calacatta", name: "Керамогранит Калакатта 60х120", quantity: qty, price: String(price), sku: "2"}
    : {offer_id: "600-josephine", name: "Керамогранит Джозефина Полиш 60х60", quantity: qty, price: String(price), sku: "1"};
}
function posting(number, extra) {
  return Object.assign({
    posting_number: number, order_number: number.replace(/-\d+$/, ""), status: "awaiting_deliver",
    in_process_at: new Date().toISOString(), products: [tile("60×60", 8, 4200)],
    customer: {name: "", phone: "", address: {address_tail: "", city: "", comment: "", latitude: "", longitude: ""}},
    addressee: {}, prr_option: {code: "none", price: "0"}, delivery_price: "0",
    delivery_method: {name: "Алмалы", warehouse: "Реутов"}, analytics_data: {},
  }, extra);
}
function putRow(p, extra) {
  const a = p.customer.address;
  const delivery = extra.delivery != null ? extra.delivery : "0";
  const lift = extra.lift != null ? extra.lift : "0";
  DELIV[p.posting_number] = Object.assign({
    posting: p.posting_number, cb: "", address: a.address_tail || "",
    lat: a.latitude ? String(a.latitude) : "", lon: a.longitude ? String(a.longitude) : "",
    phone: p.customer.phone || "", ext: "", packs: goodsLine(p), unload: unloadText(p.prr_option),
    delivery, lift, pay: String(num(delivery) + num(lift)), date: "", status: "Новый",
    comment: "", courier_comment: "", sent: "", delivered_at: "",
  }, extra, {delivery, lift, pay: String(num(delivery) + num(lift))});
}
function at(day, hm) { return isoToRu(day).slice(0, 5) + " " + hm; }
function clockIso(day, hm) { return new Date(day + "T" + hm + ":00+03:00").toISOString(); }

function buildDemo() {
  const t = mskDay(Date.now()), y = addDaysIso(t, -1), d1 = addDaysIso(t, 1), d3 = addDaysIso(t, 3);
  const ago = n => addDaysIso(t, -n);
  ORDERS = []; DELIV = {}; LOGI = {};
  const add = (p, row) => { ORDERS.push(p); if (row) putRow(p, row); };
  const cust = (name, phone, address, lat, lon, comment) => ({name, phone, address: {address_tail: address, city: address.split(", ").pop(), comment: comment || "", latitude: lat, longitude: lon}});
  const way = posting("00000000-0101-1", {
    status: "delivering", in_process_at: clockIso(t, "08:10"), products: [tile("60×60", 8, 4200)], delivery_price: "1500",
    prr_option: {code: "lift", price: "900", floor: 5},
    customer: cust("Андрей Соколов", "+79031001001", "Советская улица, 12, Балашиха", 55.7964, 37.9385, "Домофон не работает"),
  });
  add(way, {cb: "ЦБ-9101", status: "Согласован", date: isoToRu(t), delivery: "1500", lift: "900", sent: isoToRu(t) + " 08:20",
    comment: deliveryComment({time: "14:00–16:00", note: "Позвонить за 20 минут", foreman: "+79032001001"}),
    courier_comment: courierComment({ack: {at: at(t, "08:40")}, agreed: {who: "прораб", at: at(t, "09:05"), slot: "14:00–16:00"}, enroute: {at: at(t, "11:10")}, onsite: {at: at(t, "11:36")}, text: "Поднялись, ждём прораба"})});
  const go = posting("00000000-0102-1", {
    status: "delivering", in_process_at: clockIso(t, "08:30"), products: [tile("60×120", 6, 5100)], delivery_price: "1800",
    prr_option: {code: "stairs", price: "1400", floor: 3},
    customer: cust("Марина Лебедева", "+79031001002", "Маяковского улица, 8, Железнодорожный", 55.7442, 38.0094, ""),
  });
  add(go, {cb: "ЦБ-9102", status: "Согласован", date: isoToRu(t), delivery: "1800", lift: "1400", sent: isoToRu(t) + " 08:35",
    comment: deliveryComment({time: "16:00–18:00"}),
    courier_comment: courierComment({ack: {at: at(t, "08:50")}, agreed: {who: "клиент", at: at(t, "10:15"), slot: "16:00–18:00"}, enroute: {at: at(t, "12:05")}})});
  const agreed = posting("00000000-0103-1", {
    status: "delivering", in_process_at: clockIso(t, "07:40"), products: [tile("60×60", 4, 3900), tile("60×120", 2, 4800)], delivery_price: "1200",
    prr_option: {code: "lift", price: "700", floor: 7},
    customer: cust("Илья Петров", "+79031001003", "Юбилейный проспект, 48, Реутов", 55.7614, 37.8572, ""),
  });
  add(agreed, {cb: "ЦБ-9103", status: "Согласован", date: isoToRu(t), delivery: "1200", lift: "700", ext: "214", sent: isoToRu(t) + " 09:00",
    comment: deliveryComment({time: "12:00–14:00", foreman: "+79032001003"}),
    courier_comment: courierComment({ack: {at: at(t, "09:10")}, agreed: {who: "прораб", at: at(t, "09:40"), slot: "12:00–14:00"}})});
  const ack = posting("00000000-0104-1", {
    status: "delivering", in_process_at: clockIso(t, "09:00"), products: [tile("60×60", 10, 3600)], delivery_price: "1600",
    prr_option: {code: "none", price: "0"},
    customer: cust("Ольга Смирнова", "+79031001004", "Октябрьский проспект, 140, Люберцы", 55.6778, 37.8935, ""),
  });
  add(ack, {cb: "ЦБ-9104", status: "Новый", date: isoToRu(t), delivery: "1600", lift: "0", sent: isoToRu(t) + " 09:20",
    comment: deliveryComment({time: "18:00–20:00"}), courier_comment: courierComment({ack: {at: at(t, "09:28")}})});
  const sent = posting("00000000-0105-1", {
    status: "delivering", in_process_at: clockIso(y, "16:00"), products: [tile("60×60", 5, 4000)], delivery_price: "1500",
    prr_option: {code: "lift", price: "800", floor: 2},
    customer: cust("Павел Орлов", "+79031001005", "Мира улица, 26, Мытищи", 55.9112, 37.7304, ""),
  });
  add(sent, {cb: "ЦБ-9105", status: "Новый", date: isoToRu(y), delivery: "1500", lift: "800", sent: isoToRu(y) + " 18:10", comment: deliveryComment({time: "10:00–12:00"})});
  const done = posting("00000000-0106-1", {
    status: "delivered", in_process_at: clockIso(t, "07:10"), products: [tile("60×60", 12, 4100)], delivery_price: "1500",
    prr_option: {code: "lift", price: "900", floor: 4},
    customer: cust("Елена Кузнецова", "+79031001006", "Энтузиастов шоссе, 3, Балашиха", 55.7872, 37.9681, ""),
  });
  add(done, {cb: "ЦБ-9106", status: "Доставлен", date: isoToRu(t), delivery: "1500", lift: "900", sent: isoToRu(t) + " 07:30", delivered_at: isoToRu(t) + " 13:20",
    comment: deliveryComment({time: "12:00–14:00"}),
    courier_comment: courierComment({ack: {at: at(t, "07:45")}, agreed: {who: "клиент", at: at(t, "08:10"), slot: "12:00–14:00"}, enroute: {at: at(t, "12:30")}, onsite: {at: at(t, "13:05")}})});
  const cancel = posting("00000000-0107-1", {
    status: "cancelled", in_process_at: clockIso(t, "08:00"), products: [tile("60×60", 3, 3900)], delivery_price: "1000",
    customer: cust("Сергей Волков", "+79031001007", "Комсомольская улица, 5, Люберцы", 55.6901, 37.9102, ""),
  });
  add(cancel, {cb: "ЦБ-9107", status: "Отменён", date: isoToRu(t), delivery: "1000", lift: "0", sent: isoToRu(t) + " 08:15"});
  add(posting("00000000-0108-1", {
    status: "awaiting_deliver", in_process_at: clockIso(t, "10:05"), products: [tile("60×60", 6, 2400)], delivery_price: "900",
    prr_option: {code: "stairs", price: "600", floor: 4},
    customer: cust("Никита Егоров", "+79031001008", "Победы улица, 7, Реутов", 55.7522, 37.8555, ""),
    analytics_data: {delivery_date_begin: clockIso(t, "15:00"), delivery_date_end: clockIso(t, "17:00"), city: "Реутов"},
  }));
  add(posting("00000000-0109-1", {
    status: "awaiting_deliver", in_process_at: clockIso(t, "11:20"), products: [tile("60×120", 8, 5300)], delivery_price: "2000",
    prr_option: {code: "lift", price: "1100", floor: 9},
    customer: cust("Дарья Новикова", "+79031001009", "2-й Покровский проезд, 5, Котельники", 55.6604, 37.8655, ""),
    analytics_data: {delivery_date_begin: clockIso(d1, "10:00"), delivery_date_end: clockIso(d1, "12:00"), city: "Котельники"},
  }));
  const nodate = posting("00000000-0110-1", {
    status: "delivering", in_process_at: clockIso(y, "12:00"), products: [tile("60×60", 7, 3800)], delivery_price: "1400",
    customer: cust("Кирилл Морозов", "+79031001010", "Новая улица, 2, Старая Купавна", 55.7455, 38.0801, ""),
  });
  add(nodate, {cb: "ЦБ-9110", status: "Новый", date: "", delivery: "1400", lift: "0", sent: isoToRu(y) + " 12:30",
    courier_comment: courierComment({ack: {at: at(y, "12:40")}, text: "Клиент просит перенести, дату не назвал"})});
  const tomorrow = posting("00000000-0111-1", {
    status: "delivering", in_process_at: clockIso(t, "09:50"), products: [tile("60×60", 9, 4000)], delivery_price: "1700",
    prr_option: {code: "lift", price: "900", floor: 6},
    customer: cust("Анна Белова", "+79031001011", "Центральная улица, 15, Железнодорожный", 55.7501, 38.0204, ""),
  });
  add(tomorrow, {cb: "ЦБ-9111", status: "Согласован", date: isoToRu(d1), delivery: "1700", lift: "900", sent: isoToRu(t) + " 10:00",
    comment: deliveryComment({time: "10:00–12:00"}),
    courier_comment: courierComment({ack: {at: at(t, "10:12")}, agreed: {who: "клиент", at: at(t, "10:40"), slot: "10:00–12:00"}})});
  const later = posting("00000000-0112-1", {
    status: "delivering", in_process_at: clockIso(t, "11:00"), products: [tile("60×120", 4, 5000)], delivery_price: "1600",
    customer: cust("Виктор Савельев", "+79031001012", "Ленина проспект, 15, Балашиха", 55.8092, 37.9584, ""),
  });
  add(later, {cb: "ЦБ-9112", status: "Новый", date: isoToRu(d3), delivery: "1600", lift: "0", sent: isoToRu(t) + " 11:15",
    courier_comment: courierComment({ack: {at: at(t, "11:22")}})});
  add(posting("00000000-0113-1", {status: "delivered", in_process_at: clockIso(y, "08:00"), products: [tile("60×60", 6, 4000)], delivery_price: "1300",
    customer: cust("Юлия Фролова", "+79031001013", "Советская улица, 40, Реутов", 55.758, 37.862, "")}),
    {cb: "ЦБ-9113", status: "Доставлен", date: isoToRu(y), delivery: "1300", lift: "0", sent: isoToRu(y) + " 08:20", delivered_at: isoToRu(y) + " 15:10"});
  add(posting("00000000-0114-1", {status: "delivered", in_process_at: clockIso(ago(5), "08:00"), products: [tile("60×60", 15, 3700)], delivery_price: "1900",
    prr_option: {code: "lift", price: "1000", floor: 8}, customer: cust("Геннадий Пашин", "+79031001014", "Строителей улица, 9, Балашиха", 55.802, 37.97, "")}),
    {cb: "ЦБ-9114", status: "Доставлен", date: isoToRu(ago(5)), delivery: "1900", lift: "1000", sent: isoToRu(ago(5)) + " 09:00", delivered_at: isoToRu(ago(5)) + " 17:40"});
  add(posting("00000000-0115-1", {status: "cancelled", in_process_at: clockIso(ago(4), "08:00"), products: [tile("60×60", 2, 3900)],
    customer: cust("Роман Ильин", "+79031001015", "Парковая улица, 1, Люберцы", 55.682, 37.89, "")}),
    {cb: "ЦБ-9115", status: "Отменён", date: isoToRu(ago(4)), delivery: "0", lift: "0", sent: isoToRu(ago(4)) + " 09:00"});
  ORDERS.push(posting("00000000-0199-1", {
    status: "awaiting_packaging", in_process_at: clockIso(t, "07:00"), products: [tile("60×60", 20, 3500)],
    customer: cust("Склад", "", "FBS Алмалы, не адрес клиента", "", "", ""),
    delivery_method: {warehouse_id: "1020005035230080", warehouse: "FBS Алмалы (Плитка 60×60 Розница)", name: "Ozon"},
  }));
  PRICES = {
    "600-josephine": {commissions: {sales_percent_rfbs: 41, sales_percent_fbs: 41}, marketing_actions: {actions: []}},
    "612-calacatta": {commissions: {sales_percent_rfbs: 41, sales_percent_fbs: 41}, marketing_actions: {actions: []}},
  };
  const now = Date.now();
  RASHAD = {latest: {ts: now - 90 * 1000, lat: 55.792, lng: 37.925, acc: 18, battery: 0.64}, track: [
    {ts: now - 50 * 60 * 1000, lat: 55.761, lng: 37.857}, {ts: now - 30 * 60 * 1000, lat: 55.775, lng: 37.89},
    {ts: now - 12 * 60 * 1000, lat: 55.786, lng: 37.912}, {ts: now - 90 * 1000, lat: 55.792, lng: 37.925}]};
  PAYS = [{id: "demo-1", amount: "18600", date: isoToRu(ago(12)), comment: "на карту"}, {id: "demo-2", amount: "12400", date: isoToRu(ago(3)), comment: "наличные"}];
  PAYS_OK = true; UPDATED = Date.now();
  checkDemo();
}
function checkDemo() {
  const b = buckets();
  const today = b.today.work.concat(b.today.done, b.today.cancel);
  if (today.some(([p]) => isAlmalyFbs(p)) || b.fresh.send.some(([p]) => isAlmalyFbs(p))) throw new Error("FBS попал к Рашаду");
  if (!b.fbs) throw new Error("Нет заказа FBS");
  const labels = new Set(ORDERS.map(p => track(p).label));
  for (const s of ["Не отправлен", "Передан", "Принял", "Согласован", "В пути", "На месте", "Доставлен", "Отменён"]) {
    if (!labels.has(s)) throw new Error("Нет статуса " + s);
  }
  const t = mskDay(Date.now());
  if (b.today.work.some(([, , o]) => o.day && o.day > t)) throw new Error("Будущий заказ попал в сегодня");
}

async function ozon(path, payload) {
  if (!READ_OZON.has(path)) throw new Error("Прототип не пишет в Ozon");
  const r = await fetch("https://api-seller.ozon.ru" + path, {method: "POST", headers: {"Client-Id": STORE.get("ozon_cid") || "", "Api-Key": STORE.get("ozon_key") || "", "Content-Type": "application/json"}, body: JSON.stringify(payload)});
  if (!r.ok) throw new Error("Ozon не ответил (" + r.status + ")");
  return r.json();
}
async function loadLive() {
  const to = new Date(), filter = {since: new Date(to - 90 * 864e5).toISOString().slice(0, 19) + "Z", to: to.toISOString().slice(0, 19) + "Z"};
  const postings = [];
  let cursor = "", guard = 0;
  do {
    if (++guard > 30) break;
    const r = await ozon("/v4/posting/fbs/list", Object.assign({filter, limit: 100, sort_dir: "DESC"}, cursor ? {cursor} : {}));
    postings.push(...(r.postings || []));
    cursor = r.has_next ? r.cursor : "";
  } while (cursor);
  postings.forEach(p => { if (p.substatus === "posting_conditionally_delivered") p.status = "delivered"; });
  const offers = [...new Set(postings.flatMap(p => (p.products || []).map(x => x.offer_id)).filter(Boolean))];
  const prices = {};
  for (let i = 0; i < offers.length; i += 100) {
    const r = await ozon("/v5/product/info/prices", {filter: {offer_id: offers.slice(i, i + 100), visibility: "ALL"}, limit: 100});
    for (const it of r.items || []) prices[it.offer_id] = it;
  }
  ORDERS = postings; PRICES = prices;
  const admin = STORE.get("dlv_admin");
  if (admin && SCRIPT_URL) {
    try { DELIV = Object.fromEntries((await sheetApi({action: "list", key: admin})).map(r => [r.posting, r])); }
    catch { DELIV = {}; LOAD_ERR = "Заказы Ozon прочитаны. Таблица не открылась — в неё всё равно ничего не пишется."; }
    try { RASHAD = await sheetApi({action: "where", key: admin}); } catch { if (!RASHAD) RASHAD = {latest: null, track: []}; }
    try { PAYS = await sheetApi({action: "payments", key: admin}); PAYS_OK = true; } catch { PAYS = []; PAYS_OK = false; }
  } else { DELIV = {}; PAYS_OK = false; }
  UPDATED = Date.now();
}
async function fillLogistics() {
  const need = ORDERS.filter(p => !isAlmalyFbs(p) && p.status !== "cancelled" && (p.delivery_price == null || String(p.delivery_price) === "")).slice(0, 25);
  for (const p of need) {
    try {
      const r = (await ozon("/v3/posting/fbs/get", {posting_number: p.posting_number})).result || {};
      if (r.delivery_price != null) p.delivery_price = r.delivery_price;
      if (r.prr_option) p.prr_option = r.prr_option;
      LOGI[p.posting_number] = ozonLogistics(p, null);
    } catch {}
  }
}

function cardHtml(p, n) {
  const t = track(p), m = moneyOf(p), d = DELIV[p.posting_number];
  const [area, rest] = addrParts(addrOf(p));
  const profit = m.profit == null ? "—" : rub(m.profit);
  const bad = t.problems[0];
  const steps = t.key === "new" || t.key === "cancel" ? "" : `<ol class="steps" aria-hidden="true">${t.steps.map((s, i) => `<li class="${t.key === "done" || i < t.cur ? "on" : i === t.cur ? "now" : ""}"></li>`).join("")}</ol>`;
  const next = bad ? `<p class="next bad"><b>${esc(bad.t)}</b>${t.next ? " · дальше " + esc(t.next) : ""}</p>` : t.next ? `<p class="next">Дальше: <b>${esc(t.next)}</b></p>` : "";
  const seen = t.key === "new" ? `<p class="seen">Рашад ещё не получал</p>` : t.seen && t.key !== "cancel" ? `<p class="seen">Рашад видел${t.seenAt ? " · " + esc(t.seenAt) : ""}</p>` : "";
  const when = t.when || "—";
  const right = t.key === "new" && canSend(p) ? ["send", "Отправить"] : t.seen && t.key !== "done" && t.key !== "cancel" && t.key !== "new" ? ["ask-done", "Доставлено"] : null;
  const left = d && t.key !== "done" && t.key !== "cancel" && p.status !== "cancelled" ? "Отменить" : "";
  return `<article class="trk k-${t.key}${OPEN === p.posting_number ? " hot" : ""}" data-id="${esc(p.posting_number)}" style="--i:${Math.min(n, 8)}">
    ${left ? `<button type="button" class="sw l" data-act="ask-cancel" data-id="${esc(p.posting_number)}">${left}</button>` : ""}
    ${right ? `<button type="button" class="sw r" data-act="${right[0]}" data-id="${esc(p.posting_number)}">${right[1]}</button>` : ""}
    <div class="face" data-act="open" data-id="${esc(p.posting_number)}" role="button" tabindex="0">
      <div class="statline"><span class="badge k-${t.key}">${ic(ICO[t.key] || "orders", "s")}${esc(t.label)}</span><div class="clock" style="font-size:${when.length > 5 ? 15 : 22}px">${esc(when)}<small>изменение</small></div></div>
      <h3 class="addr">${esc(area)}</h3>${rest ? `<p class="rest">${esc(rest)}</p>` : ""}
      <p class="expect${t.problems.some(x => x.k === "late" || x.k === "nodate") ? " warn" : ""}">${ic("cal", "s")}${esc(t.expected)}</p>
      ${steps}${next}${seen}
      <div class="foot"><span class="cb${d && d.cb ? "" : " need"}">${d && d.cb ? esc(d.cb) : "Без ЦБ"}</span><span class="profit ${m.profit < 0 ? "neg" : "pos"}"><small>прибыль</small>${profit}</span></div>
    </div>
  </article>`;
}
function todayPack() {
  const b = buckets();
  let work = b.today.work.map(([p]) => p).filter(passFilter);
  work.sort((a, c) => urgency(a) - urgency(c));
  return {b, work, done: b.today.done.map(([p]) => p), cancel: b.today.cancel.map(([p]) => p)};
}
function stickyHtml() {
  if (MODE !== "demo" && MODE !== "live") return "";
  if (TAB !== "today" || Q) return `<div class="hero"><div><div class="big">${esc(({fresh: "Новые", ahead: "Впереди", archive: "Архив"})[TAB] || "Поиск")}</div><span class="lbl">${Q ? "результаты не смешивают дни" : "отдельный список, не сегодня"}</span></div></div>`;
  const b = buckets();
  const work = b.today.work.map(([p]) => p);
  const moving = work.filter(p => ["enroute", "onsite"].includes(track(p).key));
  const s = sumMoney(b.today.work.concat(b.today.done), DELIV, PRICES, LOGI);
  const unseen = work.filter(p => track(p).problems.some(x => x.k === "unseen")).length;
  const late = work.filter(p => track(p).problems.some(x => x.k === "late")).length;
  const off = rashadPoint() && !online(rashadPoint()) && moving.length;
  const chips = [
    unseen ? `<button type="button" data-act="filter" data-filter="unseen">${unseen} не видел</button>` : "",
    late ? `<button type="button" data-act="filter" data-filter="late">${late} просрочен</button>` : "",
    b.fresh.nodate.length ? `<button type="button" data-act="go" data-tab="fresh">${b.fresh.nodate.length} без даты</button>` : "",
    off ? `<button type="button" class="quiet" data-act="filter" data-filter="off">Рашад не в сети</button>` : "",
    b.fresh.send.length ? `<button type="button" data-act="go" data-tab="fresh">${b.fresh.send.length} не отправлен</button>` : "",
    b.fbs ? `<button type="button" class="quiet" data-act="go" data-tab="fresh">FBS · ${b.fbs}</button>` : "",
  ].filter(Boolean).join("");
  const filters = [["all", "Все"], ["problem", "Проблемы"], ["sent", "Передан"], ["ack", "Принял"], ["agreed", "Согласован"], ["enroute", "В пути"], ["onsite", "На месте"]].map(([k, v]) =>
    `<button type="button" data-act="filter" data-filter="${k}" aria-pressed="${FILTER === k}">${v}</button>`).join("");
  const n = moving.length || work.length;
  const word = moving.length ? (moving.some(p => track(p).key === "onsite") && moving.every(p => track(p).key === "onsite") ? "на месте" : "в движении") : "в работе";
  return `<div class="hero"><div><div class="big">${n}</div><span class="lbl">${word} · доставлено ${b.today.done.length}</span></div><div class="hero-side"><span>прибыль сегодня</span><b>${s.profitKnown ? rub(s.profit) : "—"}</b></div></div>
    ${chips ? `<div class="attn">${chips}</div>` : ""}<div class="filters">${filters}</div>
    <div class="viewtog"><button type="button" data-act="view" data-view="lanes" aria-pressed="${VIEW === "lanes"}">Дорожки</button><button type="button" data-act="view" data-view="table" aria-pressed="${VIEW === "table"}">Таблица</button></div>`;
}
function listHtml(list) { return list.map((p, n) => cardHtml(p, n)).join("") || `<div class="empty"><b>Здесь пусто</b><p>Под этот фильтр заказов нет.</p></div>`; }
function lanesHtml(work) {
  const cols = [["sent", "Передан"], ["ack", "Принял"], ["agreed", "Согласован"], ["enroute", "В пути"], ["onsite", "На месте"]];
  return `<div class="lanes">${cols.map(([k, name]) => {
    const list = work.filter(p => track(p).key === k);
    return `<section class="lane"><h3><span class="badge k-${k}">${esc(name)}</span><em>${list.length}</em></h3>${list.length ? list.map((p, n) => cardHtml(p, n)).join("") : `<p class="hint">пусто</p>`}</section>`;
  }).join("")}</div>`;
}
function tableHtml(list) {
  const rows = list.map(p => {
    const t = track(p), m = moneyOf(p);
    const flag = t.problems.map(x => x.t).join(", ") || (t.next ? "дальше: " + t.next : "");
    return `<tr class="${OPEN === p.posting_number ? "hot" : ""}" data-id="${esc(p.posting_number)}"><td><button type="button" class="link" data-act="open" data-id="${esc(p.posting_number)}"><span class="badge k-${t.key}">${ic(ICO[t.key], "s")}${esc(t.label)}</span></button></td><td>${esc(t.when || "—")}</td><td>${esc(addrParts(addrOf(p))[0])}</td><td>${esc(t.expected)}</td><td class="${t.problems.length ? "bad" : ""}">${esc(flag)}</td><td>${t.seen ? "видел" : "не видел"}</td><td>${m.profit == null ? "—" : rub(m.profit)}</td></tr>`;
  }).join("");
  return `<div class="tablewrap"><table class="grid"><thead><tr><th>Статус</th><th>Время</th><th>Адрес</th><th>Когда везти</th><th>Дальше</th><th>Рашад</th><th>Прибыль</th></tr></thead><tbody>${rows || `<tr><td colspan="7">Пусто</td></tr>`}</tbody></table></div>`;
}
function fbsBlock(list) {
  if (!list.length) return "";
  return `<aside class="fbs"><b>Склад FBS · ${list.length}</b><p>Грузовик Ozon забирает со склада. Рашаду эти заказы не отправляются.</p><ul>${list.map(p => `<li><span>${esc(p.posting_number)}</span><small>${esc((typeof OZON_FBS_STATUS !== "undefined" && OZON_FBS_STATUS[p.status]) || p.status)}</small></li>`).join("")}</ul></aside>`;
}
function renderStage() {
  const el = $("stage");
  if (MODE === "gate") { el.innerHTML = `<form class="gate form" id="keysForm"><h2>Ключи Ozon</h2><p class="hint">Только чтение. Демо без ключей: <a href="?demo=1">открыть</a>.</p><label>Client-Id<input name="cid" required autocomplete="off"></label><label>Api-Key<input name="key" type="password" required></label><button class="btn grow">Читать заказы</button></form>`; return; }
  if (LOADING) { el.innerHTML = `<div class="sk"></div><div class="sk"></div><div class="sk"></div>`; return; }
  if (LOAD_ERR && !ORDERS.length) { el.innerHTML = `<div class="empty"><b>Не прочиталось</b><p>${esc(LOAD_ERR)}</p><button class="btn" id="retryBtn">Повторить</button></div>`; return; }
  if (Q) { el.innerHTML = searchHtml(); return; }
  if (TAB === "today") {
    const pack = todayPack();
    let body = "";
    if (wide() && VIEW === "table") body = tableHtml(pack.work);
    else if (wide() && VIEW === "lanes" && FILTER === "all") body = lanesHtml(pack.work);
    else body = `<section class="sec"><h2>По срочности <em>${pack.work.length}</em></h2>${listHtml(pack.work)}</section>`;
    if (FILTER === "all") {
      body += pack.done.length ? `<section class="sec"><h2>Доставлено сегодня <em>${pack.done.length}</em></h2>${listHtml(pack.done)}</section>` : "";
      body += pack.cancel.length ? `<details class="sec"><summary>Отменено сегодня <em>${pack.cancel.length}</em></summary>${listHtml(pack.cancel)}</details>` : "";
    }
    el.innerHTML = body;
  } else if (TAB === "fresh") {
    const b = buckets();
    el.innerHTML = `<section class="sec"><h2>Нужно отправить <em>${b.fresh.send.length}</em></h2>${listHtml(b.fresh.send.map(([p]) => p))}</section>
      <section class="sec"><h2>Без даты <em>${b.fresh.nodate.length}</em></h2>${listHtml(b.fresh.nodate.map(([p]) => p))}</section>` + fbsBlock(ORDERS.filter(isAlmalyFbs));
  } else if (TAB === "ahead") {
    const b = buckets();
    const days = Object.keys(b.upcoming).sort();
    el.innerHTML = days.length ? days.map(day => `<section class="sec"><h2>${esc(dayTitle(day))} <em>${b.upcoming[day].length}</em></h2>${listHtml(b.upcoming[day].map(([p]) => p))}</section>`).join("") : `<div class="empty"><b>Впереди пусто</b><p>Сегодня сюда не попадает.</p></div>`;
  } else {
    const [from, to] = archBounds();
    const list = archiveRange(buckets().archive, from, to);
    const chips = [["1", "Вчера"], ["7", "7 дней"], ["30", "30 дней"], ["all", "Всё"]].map(([k, v]) => `<button type="button" data-act="arch" data-arch="${k}" aria-pressed="${ARCH === k}">${v}</button>`).join("");
    el.innerHTML = `<div class="arch">${chips}</div>` + (wide() && VIEW === "table" ? tableHtml(list.map(([p]) => p)) : listHtml(list.map(([p]) => p)));
  }
}
function searchHtml() {
  const hits = ORDERS.filter(p => !isAlmalyFbs(p) && matches(p));
  return hits.length ? listHtml(hits) : `<div class="empty"><b>Ничего не нашли</b></div>`;
}
function matches(p) {
  const d = DELIV[p.posting_number] || {}, a = ((p.customer || {}).address) || {};
  return [p.posting_number, d.cb, d.address, d.phone, (p.customer || {}).name, a.address_tail, goodsLine(p)].join(" ").toLowerCase().includes(Q);
}
function paintChrome() {
  const b = ORDERS.length ? buckets() : {today: {work: [], done: [], cancel: []}, fresh: {send: [], nodate: []}, upcoming: {}, archive: [], fbs: 0};
  const counts = {today: b.today.work.length + b.today.done.length + b.today.cancel.length, fresh: b.fresh.send.length + b.fresh.nodate.length, ahead: Object.values(b.upcoming).reduce((s, l) => s + l.length, 0), archive: b.archive.length};
  const tabs = [["today", "Сегодня", "M8 3v2M16 3v2M4 8h16M6 5h12a1 1 0 0 1 1 1v13H5V6a1 1 0 0 1 1-1z"], ["fresh", "Новые", "M7 4h10v16l-2-1.2L13 20l-2-1.2L9 20l-2-1.2V4z"], ["ahead", "Впереди", "M12 7v5l3 2M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z"], ["archive", "Архив", "M4 7h16v12H4zM4 7l2-3h12l2 3"]];
  $("tabbar").innerHTML = tabs.map(([k, name, path]) => `<button type="button" data-tab="${k}" aria-current="${!Q && TAB === k ? "page" : "false"}"><svg viewBox="0 0 24 24"><path d="${path}"/></svg>${name}${counts[k] ? `<em>${counts[k]}</em>` : ""}</button>`).join("");
  $("sticky").innerHTML = stickyHtml();
  $("fresh").textContent = freshLabel();
  $("ribbon").textContent = MODE === "demo" ? "Демо · в таблицу и Ozon ничего не отправляется" : "Только чтение · правки остаются на экране";
  const point = rashadPoint();
  $("whoSeen").textContent = seenShort(point);
  $("whoAva").classList.toggle("on", online(point));
  $("whoBtn").classList.toggle("off", !!(point && !online(point)));
  const handle = $("mapHandleText");
  if (handle) handle.textContent = "Карта · Рашад " + seenShort(point);
}
function render() { paintChrome(); renderStage(); if (OPEN) renderOrder(); if (PANEL) renderPanel(); paintMap(false); }

function timelineHtml(t) {
  return `<ol class="vtime">${t.steps.map((s, i) => {
    const cls = t.key === "done" || i < t.cur ? "on" : i === t.cur ? "now" : "";
    return `<li class="${cls}"><i></i><b>${esc(s.label)}</b><time>${esc(s.when || "")}</time></li>`;
  }).join("")}${t.key === "cancel" ? `<li class="now"><i></i><b>Отменён</b><time></time></li>` : ""}</ol>`;
}
function receiptHtml(p) {
  const m = moneyOf(p), t = m.t;
  const line = (k, v, cls = "", sub = "") => `<div class="rline ${cls}"><span>${k}${sub ? `<small>${esc(sub)}</small>` : ""}</span><b>${v}</b></div>`;
  const goods = (p.products || []).map(x => {
    const price = parseFloat(x.price && x.price.amount != null ? x.price.amount : x.price) || 0, qty = Number(x.quantity) || 0;
    return line(`${qty} × ${esc(shortName(x.name).replace(/^Керамогранит\s+/i, ""))}`, rub(price * qty));
  }).join("");
  const oz = (on, text) => text + (on ? " · из Ozon" : "");
  return `<section class="receipt"><h3>Расчёт</h3>${goods}
    ${m.clientDelivery ? line("Доставка от клиента", rub(m.clientDelivery)) : ""}${m.clientLift ? line("Подъём от клиента", rub(m.clientLift)) : ""}
    ${line("Клиент платит", rub(m.client), "tot")}
    ${t ? line("Комиссия, эквайринг, сбор", "−" + sp(t.commission + t.acquiring + t.fee) + " ₽") + line("НДС", "−" + sp(t.vat) + " ₽") + line("Себестоимость", "−" + sp(t.cost) + " ₽") : ""}
    ${line(m.planned ? "Рашаду, план" : "Рашаду", "−" + sp(m.courier) + " ₽", "", oz(m.deliveryAuto, "доставка " + sp(m.courierDelivery)) + " + " + oz(m.liftAuto, "подъём " + sp(m.courierLift)))}
    ${m.profit == null ? line("Прибыль", "не считается") : line("Прибыль", rub(m.profit), "profit" + (m.profit < 0 ? " neg" : ""))}
  </section>`;
}
function renderOrder() {
  const p = ORDERS.find(x => x.posting_number === OPEN);
  if (!p) { closeOrder(); return; }
  const t = track(p), d = DELIV[p.posting_number];
  const [area, rest] = addrParts(addrOf(p));
  let body = "";
  if (EXTRA && EXTRA.type === "edit") body = editForm(p);
  else if (EXTRA && EXTRA.type === "send") body = sendForm(p);
  else if (EXTRA && EXTRA.type === "replace") body = replaceHtml(p);
  else {
    const ph = d && d.phone ? String(d.phone).replace(/^'/, "") : ((p.customer || {}).phone || "");
    const links = [
      ph ? `<a href="tel:${esc(ph)}">${ic("phone", "s")}Клиенту</a>` : "",
      llOf(p) ? `<button type="button" data-act="fly" data-id="${esc(p.posting_number)}">${ic("map", "s")}На карте</button>` : "",
      d ? `<button type="button" data-act="edit" data-id="${esc(p.posting_number)}">${ic("edit", "s")}Изменить</button>` : "",
      `<button type="button" data-act="copy" data-id="${esc(p.posting_number)}">${ic("copy", "s")}Номер</button>`,
    ].filter(Boolean).join("");
    const confirm = CONFIRM && CONFIRM.posting === p.posting_number ? `<div class="note"><p>${CONFIRM.kind === "cancel" ? "Отменить только на этом экране? Таблица и Ozon не изменятся." : "Отметить доставленным только на этом экране?"}</p><div class="acts"><button class="btn ${CONFIRM.kind === "cancel" ? "danger" : ""}" data-act="confirm-yes" data-id="${esc(p.posting_number)}">Да, здесь</button><button class="btn soft" data-act="confirm-no">Нет</button></div></div>` : "";
    const danger = !d || t.key === "done" ? "" : t.key === "cancel" && p.status !== "cancelled" ? `<button class="btn ghost" data-act="restore" data-id="${esc(p.posting_number)}">${ic("undo", "s")}Вернуть в работу</button>` : t.key !== "cancel" ? `<div class="acts"><button class="btn ghost" data-act="replace" data-id="${esc(p.posting_number)}">${ic("swap", "s")}Заменить</button><button class="btn danger" data-act="ask-cancel" data-id="${esc(p.posting_number)}">${ic("ban", "s")}Отменить</button></div>` : "";
    const primary = t.key === "new" && canSend(p) ? `<button class="btn grow" data-act="send" data-id="${esc(p.posting_number)}">${ic("send", "s")}Отправить Рашаду</button>` : t.seen && t.key !== "done" && t.key !== "cancel" ? `<button class="btn grow" data-act="ask-done" data-id="${esc(p.posting_number)}">${ic("check", "s")}Доставлено</button>` : "";
    body = `<div class="sheet-h"><div><span class="badge k-${t.key}">${ic(ICO[t.key], "s")}${esc(t.label)}</span><h2 id="orderTitle">${esc(area)}</h2><p class="hint">${esc(rest)} · ${esc(t.expected)}</p></div><button type="button" class="icon" data-order-close aria-label="Закрыть"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>
      ${timelineHtml(t)}${t.problems.map(x => `<p class="next bad"><b>${esc(x.t)}</b></p>`).join("")}
      ${t.seen ? `<p class="seen">Рашад видел${t.seenAt ? " · " + esc(t.seenAt) : ""}</p>` : t.key === "new" ? `<p class="seen">Рашад ещё не получал</p>` : ""}
      ${receiptHtml(p)}<div class="links">${links}</div>${confirm}${danger}${primary ? `<div class="acts">${primary}</div>` : ""}`;
  }
  $("orderBody").innerHTML = body;
}
function showOrder() {
  const s = $("order");
  s.hidden = false;
  requestAnimationFrame(() => s.classList.add("show"));
  document.querySelectorAll(".trk, .grid tr").forEach(el => el.classList.toggle("hot", el.dataset.id === OPEN));
}
function closeOrder() {
  const s = $("order");
  s.classList.remove("show");
  OPEN = ""; EXTRA = null; CONFIRM = null;
  document.querySelectorAll(".trk, .grid tr").forEach(el => el.classList.remove("hot"));
  setTimeout(() => { if (!s.classList.contains("show")) s.hidden = true; }, reduced() ? 0 : 300);
  paintMap(false);
}
function editForm(p) {
  const d = DELIV[p.posting_number], info = deliveryDetails(d.comment);
  const date = dayIso(d.date), t = mskDay(Date.now()), oz = ozonLogistics(p, LOGI), pay = courierPay(d, oz);
  const f = (n, label, v, attrs = "") => `<label>${label}<input name="${n}" value="${esc(v ?? "")}" ${attrs}></label>`;
  return `<form class="form edit" data-id="${esc(p.posting_number)}"><h3>Изменить</h3>
    <label>Адрес<textarea name="address" rows="2" required>${esc(d.address || "")}</textarea></label>
    <div class="grid2">${f("cb", "ЦБ", String(d.cb || "").replace(/^ЦБ-?/i, ""))}${f("phone", "Телефон", String(d.phone || "").replace(/^'/, ""), 'type="tel"')}</div>
    <label>Дата<div class="days"><button type="button" data-day="${t}">Сегодня</button><button type="button" data-day="${addDaysIso(t, 1)}">Завтра</button><input name="date" type="date" value="${esc(date)}"></div></label>
    <label>Время<input name="time" value="${esc(info.time || "")}"><span class="slots">${DELIVERY_SLOTS.map(x => `<button type="button" data-slot="${esc(x)}">${esc(slotLabel(x))}</button>`).join("")}</span></label>
    <div class="grid2">${f("delivery", "Доставка, ₽", num(d.delivery) > 0 ? d.delivery : "", `placeholder="${oz.delivery}" data-oz="${oz.delivery}"`)}${f("lift", "Подъём, ₽", num(d.lift) > 0 ? d.lift : "", `placeholder="${oz.lift}" data-oz="${oz.lift}"`)}</div>
    <p class="hint">Пустое поле — сумма из Ozon. Сейчас Рашаду ${rub(pay.delivery + pay.lift)}.</p>
    <label>Пометка<textarea name="note" rows="2">${esc(info.note || "")}</textarea></label>
    <div class="acts"><button type="button" class="btn soft" data-act="close-extra">Назад</button><button class="btn grow">Сохранить здесь</button></div></form>`;
}
function sendForm(p) {
  const oz = ozonLogistics(p, LOGI), t = mskDay(Date.now());
  const old = EXTRA && EXTRA.old && DELIV[EXTRA.old];
  return `<form class="form send" data-id="${esc(p.posting_number)}" data-old="${esc((EXTRA && EXTRA.old) || "")}"><h3>${old ? "Замена" : "Отправить Рашаду"}</h3>
    ${old ? `<p class="hint">Вместо ${esc(old.cb || EXTRA.old)}. Старый станет «Отменён» только на экране.</p>` : ""}
    <label>Номер ЦБ<input name="cb" required inputmode="numeric" value="${esc(old ? String(old.cb || "").replace(/^ЦБ-?/i, "") : "")}"></label>
    <div class="grid2"><label>Доставка<input name="delivery_pay" inputmode="numeric" value="${oz.delivery || ""}" data-oz="${oz.delivery}"></label><label>Подъём<input name="lift_pay" inputmode="numeric" value="${oz.lift || ""}" data-oz="${oz.lift}"></label></div>
    <label>Дата<div class="days"><button type="button" data-day="${t}">Сегодня</button><button type="button" data-day="${addDaysIso(t, 1)}">Завтра</button><input name="date" type="date" value="${t}"></div></label>
    <label>Время<input name="time" value="${esc(old ? deliveryDetails(old.comment).time : "")}"><span class="slots">${DELIVERY_SLOTS.map(x => `<button type="button" data-slot="${esc(x)}">${esc(slotLabel(x))}</button>`).join("")}</span></label>
    <p class="hint">В таблицу не запишется.</p>
    <div class="acts"><button type="button" class="btn soft" data-act="close-extra">Назад</button><button class="btn grow">${old ? "Заменить" : "Отправить"}</button></div></form>`;
}
function replaceHtml(p) {
  const cands = ORDERS.filter(canSend);
  return `<div><p class="hint">Новый заказ вместо ${esc((DELIV[p.posting_number] || {}).cb || "")}. FBS нельзя.</p>
    ${cands.map(x => `<button type="button" class="jump" data-act="pick" data-id="${esc(x.posting_number)}" data-old="${esc(p.posting_number)}"><b>${esc(addrParts(addrOf(x))[0])}</b><small>${esc(x.posting_number)}</small></button>`).join("") || `<p class="hint">Неотправленных нет.</p>`}
    <button type="button" class="btn soft" data-act="close-extra">Назад</button></div>`;
}

function mapStyleName() {
  const dark = document.documentElement.dataset.theme ? document.documentElement.dataset.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
  return dark ? "dark" : "liberty";
}
function mapModel() {
  if (!Q && TAB === "archive") return {title: "Архив", active: [], done: [], show: false, empty: "Архив без карты."};
  const b = ORDERS.length ? buckets() : null;
  const active = [], done = [];
  const push = (p, into) => { const ll = llOf(p); if (ll && !isAlmalyFbs(p)) into.push({p, ll}); };
  if (!b) return {title: "", active, done, show: false, empty: ""};
  if (Q) ORDERS.filter(p => !isAlmalyFbs(p) && matches(p)).forEach(p => push(p, track(p).key === "done" ? done : active));
  else if (TAB === "today") { b.today.work.forEach(([p]) => push(p, active)); b.today.done.forEach(([p]) => push(p, done)); }
  else if (TAB === "fresh") b.fresh.send.concat(b.fresh.nodate).forEach(([p]) => push(p, active));
  else Object.keys(b.upcoming).sort().forEach(day => b.upcoming[day].forEach(([p]) => push(p, active)));
  const start = rashadTodayLL() || (active[0] && active[0].ll) || [55.76, 37.86];
  return {title: Q ? "Поиск" : {today: "Сегодня", fresh: "Новые", ahead: "Впереди"}[TAB] || "", active: nearest(active, start), done, show: true, empty: ""};
}
function paintMap(fitNow) {
  if (!MAP || !MAP.isStyleLoaded || !MAP.isStyleLoaded() || !MAP.getSource("route")) { MAP_DIRTY = true; return; }
  MAP_DIRTY = false;
  const model = mapModel();
  const rp = rashadPoint();
  const key = TAB + "|" + (Q || "") + "|" + model.active.map(x => x.p.posting_number).join(",") + "|" + OPEN;
  $("mapCap").textContent = model.empty ? model.title : model.title + " · " + (model.active.length + model.done.length);
  $("mapShade").hidden = !model.empty;
  if (model.empty) $("mapShade").innerHTML = `<div><b>${esc(model.title)}</b><p>${esc(model.empty)}</p></div>`;
  if (key === MAP_KEY && !fitNow) return;
  MAP_KEY = key;
  PINS.forEach(m => m.remove()); PINS = [];
  if (RPIN) { RPIN.remove(); RPIN = null; }
  const add = (el, ll, id) => {
    el.addEventListener("click", ev => { ev.stopPropagation(); openOrder(id); });
    PINS.push(new maplibregl.Marker({element: el, anchor: "center"}).setLngLat([ll[1], ll[0]]).addTo(MAP));
  };
  model.active.forEach((x, i) => {
    const t = track(x.p), el = document.createElement("button");
    el.type = "button"; el.className = "pin " + (t.key === "sent" ? "sent" : t.key === "onsite" ? "onsite" : "") + (OPEN === x.p.posting_number ? " hot" : "");
    el.textContent = String(i + 1); el.style.opacity = "1";
    el.setAttribute("aria-label", t.label + " " + addrOf(x.p));
    add(el, x.ll, x.p.posting_number);
  });
  model.done.forEach((x, i) => {
    const el = document.createElement("button");
    el.type = "button"; el.className = "pin done" + (OPEN === x.p.posting_number ? " hot" : "");
    el.textContent = String(i + 1); el.style.opacity = "1";
    add(el, x.ll, x.p.posting_number);
  });
  if (model.show && rp) {
    const el = document.createElement("div");
    el.className = "rpin"; el.innerHTML = `<b>Р</b><span>${esc(seenShort(rp))}</span>`;
    RPIN = new maplibregl.Marker({element: el, anchor: "center"}).setLngLat([+rp.lng, +rp.lat]).addTo(MAP);
  }
  const line = [];
  if (!Q && TAB === "today" && rashadTodayLL()) line.push(rashadTodayLL());
  model.active.forEach(x => line.push(x.ll));
  const rkey = line.map(p => p.map(n => n.toFixed(3)).join(",")).join(";");
  if (rkey !== ROUTE_KEY) {
    ROUTE_KEY = rkey;
    if (line.length < 2) paintRoute(MAP, "route", []);
    else {
      const path = line.map(p => `${(+p[1]).toFixed(6)},${(+p[0]).toFixed(6)}`).join(";");
      const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 6000);
      fetch("https://router.project-osrm.org/route/v1/driving/" + path + "?overview=full&geometries=geojson", {signal: ctl.signal})
        .then(r => r.json()).then(j => paintRoute(MAP, "route", (j.routes && j.routes[0] && j.routes[0].geometry.coordinates) || line.map(p => [p[1], p[0]])))
        .catch(() => paintRoute(MAP, "route", line.map(p => [p[1], p[0]]))).finally(() => clearTimeout(timer));
    }
  }
  if (fitNow || !USER_MOVED) fitTo(model, rp);
}
function fitTo(model, rp) {
  if (!MAP) return;
  const pts = model.active.concat(model.done).map(x => x.ll);
  if (model.show && rp) pts.push([+rp.lat, +rp.lng]);
  if (pts.length < 2) { if (pts[0]) MAP.flyTo({center: [pts[0][1], pts[0][0]], zoom: 12, duration: reduced() ? 0 : 600}); return; }
  const b = new maplibregl.LngLatBounds();
  pts.forEach(p => b.extend([p[1], p[0]]));
  MAP.fitBounds(b, {padding: 48, maxZoom: 13, duration: reduced() ? 0 : 650});
}
function ensureLayers() {
  if (!MAP.getSource("route")) {
    MAP.addSource("route", {type: "geojson", data: {type: "FeatureCollection", features: []}});
    MAP.addLayer({id: "route-case", type: "line", source: "route", layout: {"line-cap": "round", "line-join": "round"}, paint: {"line-color": "#ffffff", "line-width": 8, "line-opacity": .9}});
    MAP.addLayer({id: "route", type: "line", source: "route", layout: {"line-cap": "round", "line-join": "round"}, paint: {"line-color": "#1d4ed8", "line-width": 4.5}});
  }
}
function bootMap() {
  if (MAP_OK) return MAP_OK;
  MAP_OK = (async () => {
    if (!window.maplibregl) await new Promise((ok, fail) => {
      const css = Object.assign(document.createElement("link"), {rel: "stylesheet", href: "https://unpkg.com/maplibre-gl@5.24.0/dist/maplibre-gl.css", integrity: "sha384-uTttxo/aOKbdE5RlD/SPzSDoDmNvGlUYPjONi2MN/b7c9HPSvW07OIuyP7uL6jxK", crossOrigin: "anonymous"});
      const js = Object.assign(document.createElement("script"), {src: "https://unpkg.com/maplibre-gl@5.24.0/dist/maplibre-gl.js", integrity: "sha384-5+cfbwT0iiub6VsQAdn6yz16nr6sDiQoHx6tm4O8OVYXHYOxcffFmCJBL0dgdvGp", crossOrigin: "anonymous"});
      js.onload = ok; js.onerror = () => fail(new Error("Карта не загрузилась"));
      document.head.append(css, js);
    });
    MAP = new maplibregl.Map({container: "map", style: "https://tiles.openfreemap.org/styles/" + mapStyleName(), center: [37.9, 55.78], zoom: 10, attributionControl: true, dragRotate: false, pitchWithRotate: false});
    MAP.addControl(new maplibregl.NavigationControl({showCompass: false}), "bottom-right");
    MAP.on("dragstart", () => { USER_MOVED = true; });
    MAP.on("style.load", () => { ensureLayers(); MAP_KEY = ""; ROUTE_KEY = ""; paintMap(!USER_MOVED); });
    MAP.on("idle", () => { if (MAP_DIRTY) paintMap(false); });
    await new Promise(ok => MAP.once("load", ok));
    ensureLayers(); paintMap(true);
    document.body.dataset.map = "1";
  })().catch(err => { MAP_OK = null; $("mapShade").hidden = false; $("mapShade").textContent = err.message || "Карта не загрузилась"; });
  return MAP_OK;
}

function renderPanel() {
  $("panelTitle").textContent = {courier: "Рашад", pay: "Выплаты", settings: "Настройки"}[PANEL_TAB];
  $("panelSeg").innerHTML = [["courier", "Рашад"], ["pay", "Выплаты"], ["settings", "Настройки"]].map(([k, v]) => `<button type="button" data-ptab="${k}" aria-pressed="${PANEL_TAB === k}">${v}</button>`).join("");
  const point = rashadPoint();
  if (PANEL_TAB === "courier") {
    const items = ORDERS.filter(p => !isAlmalyFbs(p) && orderTab(p, DELIV[p.posting_number]) === "courier");
    $("panelBody").innerHTML = `<p>${esc(geoSeenText(point, Date.now()))}</p><div class="stats"><div><b>${items.length}</b><span>у него</span></div><div><b>${point && point.battery != null ? Math.round(point.battery * 100) + "%" : "—"}</b><span>заряд</span></div><div><b>${online(point) ? "да" : "нет"}</b><span>в сети</span></div></div>` +
      items.map(p => { const t = track(p); return `<button type="button" class="jump" data-jump="${esc(p.posting_number)}"><b>${esc(t.label)} · ${esc(addrParts(addrOf(p))[0])}</b><small>${esc(t.when || "")} · ${esc(t.expected)}</small></button>`; }).join("");
  } else if (PANEL_TAB === "pay") {
    if (!PAYS_OK) { $("panelBody").innerHTML = `<p class="note">Выплаты не показываем, пока таблица не ответила.</p>`; return; }
    const rep = deliveryReport(rashadDeliveries(Object.values(DELIV)), PAYS);
    const left = rep.hasPayments ? rep.left : rep.done.pay;
    $("panelBody").innerHTML = `<p class="hint">Запись только на этом экране.</p><div class="stats"><div><b>${sp(rep.done.pay)}</b><span>начислено</span></div><div><b>${sp(rep.paid)}</b><span>выплачено</span></div><div><b>${sp(left)}</b><span>${left < 0 ? "переплата" : "осталось"}</span></div></div>
      <form class="form" id="payForm"><label>Сумма<input name="amount" inputmode="numeric" required></label><label>Дата<input name="date" type="date" value="${new Date().toISOString().slice(0, 10)}"></label><label>Комментарий<input name="comment"></label><button class="btn grow">Записать здесь</button></form>
      <ul class="rows">${[...rep.payments].reverse().map(p => `<li><div><b>${rub(num(p.amount))}</b><small>${esc(p.date)} ${esc(p.comment || "")}</small></div><button type="button" data-unpay="${esc(p.id)}">✕</button></li>`).join("")}</ul>`;
  } else {
    $("panelBody").innerHTML = `<div class="seg" id="themeSw"></div><p class="hint">${MODE === "demo" ? "Демо не ходит в сеть." : "Ключи только в этом браузере."}</p>${MODE === "demo" ? "" : `<form class="form" id="linkForm"><label>Ссылка доступа<input name="link" placeholder="#admin=…"></label><button class="btn">Подключить чтение</button></form>`}<p><a href="index.html">Текущее приложение</a></p>`;
    if ($("themeSw")) mountThemeSwitch($("themeSw"));
  }
}
function openPanel(tab) {
  PANEL = "open"; PANEL_TAB = tab || "courier";
  $("panel").hidden = false; renderPanel();
  requestAnimationFrame(() => $("panel").classList.add("show"));
}
function closePanel() {
  $("panel").classList.remove("show");
  setTimeout(() => { if (!$("panel").classList.contains("show")) { $("panel").hidden = true; PANEL = ""; } }, 280);
}
function openOrder(id) {
  const p = ORDERS.find(x => x.posting_number === id);
  if (!p || isAlmalyFbs(p)) { toast("Склад FBS Рашаду не показывается"); return; }
  OPEN = id; EXTRA = null; CONFIRM = null;
  renderOrder(); showOrder();
  const ll = llOf(p);
  if (ll && MAP) { USER_MOVED = true; MAP.flyTo({center: [ll[1], ll[0]], zoom: 14, duration: reduced() ? 0 : 550}); }
  MAP_KEY = ""; paintMap(false);
}
function jumpTo(id) { closePanel(); TAB = tabOf(ORDERS.find(x => x.posting_number === id) || {}); Q = ""; openOrder(id); render(); }

async function saveSend(form) {
  const id = form.dataset.id, old = form.dataset.old, p = ORDERS.find(x => x.posting_number === id);
  try {
    assertRashadPath(p, null);
    const f = form.elements, oz = ozonLogistics(p, LOGI);
    const dPay = payField(f.delivery_pay.value, oz.delivery), lPay = payField(f.lift_pay.value, oz.lift);
    const a = ((p.customer || {}).address) || {};
    const phoneDigits = String((p.customer || {}).phone || "").replace(/\D/g, "").replace(/^8(?=\d{10}$)/, "7");
    if (old) { assertRashadPath(ORDERS.find(x => x.posting_number === old), DELIV[old]); if (DELIV[old]) DELIV[old] = Object.assign({}, DELIV[old], {status: "Отменён"}); }
    DELIV[id] = {posting: id, cb: normalizeCb(f.cb.value), address: a.address_tail || "", lat: a.latitude ? String(a.latitude) : "", lon: a.longitude ? String(a.longitude) : "",
      phone: phoneDigits ? "+" + phoneDigits : "", ext: "", packs: goodsLine(p), unload: unloadText(p.prr_option),
      delivery: String(dPay.value), lift: String(lPay.value), pay: String(dPay.value + lPay.value),
      date: f.date.value ? f.date.value.split("-").reverse().join(".") : "", status: "Новый",
      comment: deliveryComment({time: f.time.value.trim()}), courier_comment: "", sent: todayRu() + " " + agreedNow().slice(6), delivered_at: ""};
    if (!DELIV[id].cb) throw new Error("Введите номер ЦБ");
    EXTRA = null; TAB = tabOf(p);
    toast(old ? "Замена только на экране" : "Отправлено только на экране");
    render();
  } catch (err) { toast(err.message, true); }
}
async function saveEdit(form) {
  const id = form.dataset.id, old = DELIV[id], p = ORDERS.find(x => x.posting_number === id);
  try {
    assertRashadPath(p, old);
    const v = Object.fromEntries(new FormData(form)), info = deliveryDetails(old.comment);
    const dPay = payField(v.delivery, form.elements.delivery.dataset.oz), lPay = payField(v.lift, form.elements.lift.dataset.oz);
    const phoneDigits = String(v.phone || "").replace(/\D/g, "").replace(/^8(?=\d{10}$)/, "7");
    const next = {cb: normalizeCb(v.cb), address: String(v.address || "").trim(), date: v.date ? v.date.split("-").reverse().join(".") : "",
      phone: phoneDigits ? "+" + phoneDigits : "", delivery: String(dPay.value), lift: String(lPay.value),
      comment: deliveryComment({note: v.note, time: v.time, agreed: info.agreed, ozon: info.ozon})};
    if (!next.address) throw new Error("Укажите адрес");
    const patch = editPatch(old, next);
    if (patch.address) { const g = await geocode(next.address).catch(() => null); if (g) Object.assign(patch, g); }
    const row = Object.assign({}, old, patch);
    if (patch.delivery !== undefined || patch.lift !== undefined) row.pay = String(num(row.delivery) + num(row.lift));
    DELIV[id] = row; EXTRA = null;
    toast("Изменения только на экране");
    render();
  } catch (err) { toast(err.message, true); }
}
async function geocode(address) {
  const r = await fetch("https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=ru&q=" + encodeURIComponent(address), {headers: {"Accept-Language": "ru"}});
  const [hit] = await r.json();
  return hit ? {lat: (+hit.lat).toFixed(6), lon: (+hit.lon).toFixed(6)} : null;
}
function localDelivered(id) {
  assertRashadPath(ORDERS.find(x => x.posting_number === id), DELIV[id]);
  DELIV[id] = Object.assign({}, DELIV[id], {status: "Доставлен", delivered_at: todayRu() + " " + agreedNow().slice(6)});
}
function localCancel(id) {
  assertRashadPath(ORDERS.find(x => x.posting_number === id), DELIV[id]);
  DELIV[id] = Object.assign({}, DELIV[id], {status: "Отменён"});
}
function localRestore(id) {
  assertRashadPath(ORDERS.find(x => x.posting_number === id), DELIV[id]);
  DELIV[id] = Object.assign({}, DELIV[id], {status: "Новый"});
}

function onAct(el) {
  const act = el.dataset.act, id = el.dataset.id;
  if (act === "open") { openOrder(id); return; }
  if (act === "go") { TAB = el.dataset.tab; Q = ""; $("q").value = ""; FILTER = "all"; render(); return; }
  if (act === "filter") { FILTER = el.dataset.filter; if (el.dataset.tab) TAB = el.dataset.tab; render(); return; }
  if (act === "view") { VIEW = el.dataset.view; renderStage(); paintChrome(); return; }
  if (act === "arch") { ARCH = el.dataset.arch; renderStage(); return; }
  if (act === "send") {
    const p = ORDERS.find(x => x.posting_number === id);
    if (!canSend(p)) { toast("Этот заказ нельзя отправить Рашаду", true); return; }
    OPEN = id; EXTRA = {type: "send", posting: id, old: ""}; renderOrder(); showOrder(); return;
  }
  if (act === "pick") {
    if (!canSend(ORDERS.find(x => x.posting_number === id))) { toast("Рашаду не уходит", true); return; }
    OPEN = id; EXTRA = {type: "send", posting: id, old: el.dataset.old}; renderOrder(); showOrder(); return;
  }
  if (act === "replace") { EXTRA = {type: "replace", posting: id}; OPEN = id; renderOrder(); showOrder(); return; }
  if (act === "edit") { EXTRA = {type: "edit", posting: id}; renderOrder(); return; }
  if (act === "close-extra") { EXTRA = null; renderOrder(); return; }
  if (act === "ask-done" || act === "ask-cancel") { CONFIRM = {posting: id, kind: act === "ask-cancel" ? "cancel" : "done"}; OPEN = id; renderOrder(); showOrder(); return; }
  if (act === "confirm-no") { CONFIRM = null; renderOrder(); return; }
  if (act === "confirm-yes") {
    try { if (CONFIRM && CONFIRM.kind === "cancel") localCancel(id); else localDelivered(id); CONFIRM = null; EXTRA = null; toast("Только на этом экране"); render(); }
    catch (err) { toast(err.message, true); }
    return;
  }
  if (act === "restore") { try { localRestore(id); toast("Снова в работе на экране"); render(); } catch (err) { toast(err.message, true); } return; }
  if (act === "copy") { const done = () => toast("Номер скопирован"); if (navigator.clipboard) navigator.clipboard.writeText(id).then(done, done); else done(); return; }
  if (act === "fly") {
    const ll = llOf(ORDERS.find(x => x.posting_number === id));
    if (ll && MAP) MAP.flyTo({center: [ll[1], ll[0]], zoom: 14, duration: reduced() ? 0 : 500});
  }
}

let swipe = null, suppressClick = false;
$("stage").addEventListener("touchstart", ev => {
  const face = ev.target.closest(".face");
  if (!face) return;
  swipe = {face, x: ev.touches[0].clientX, y: ev.touches[0].clientY, lock: "", dx: 0};
}, {passive: true});
$("stage").addEventListener("touchmove", ev => {
  if (!swipe) return;
  const dx = ev.touches[0].clientX - swipe.x, dy = ev.touches[0].clientY - swipe.y;
  if (!swipe.lock) { if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return; swipe.lock = Math.abs(dx) > Math.abs(dy) ? "x" : "y"; }
  if (swipe.lock !== "x") return;
  swipe.dx = Math.max(-110, Math.min(110, dx));
  swipe.face.style.transition = "none";
  swipe.face.style.transform = `translateX(${swipe.dx}px)`;
}, {passive: true});
$("stage").addEventListener("touchend", () => {
  if (!swipe) return;
  const face = swipe.face, dx = swipe.dx;
  face.style.transition = "";
  if (Math.abs(dx) > 72) {
    face.style.transform = `translateX(${dx > 0 ? 96 : -96}px)`;
    suppressClick = true;
  } else face.style.transform = "";
  swipe = null;
});
document.addEventListener("click", ev => {
  if (suppressClick && ev.target.closest(".face")) { suppressClick = false; return; }
  if (ev.target.closest("[data-order-close]")) { closeOrder(); return; }
  if (ev.target.closest("[data-panel-close]")) { closePanel(); return; }
  const tab = ev.target.closest("#tabbar [data-tab]");
  if (tab) { TAB = tab.dataset.tab; Q = ""; if ($("q")) $("q").value = ""; FILTER = "all"; USER_MOVED = false; MAP_KEY = ""; render(); return; }
  const ptab = ev.target.closest("[data-ptab]");
  if (ptab) { PANEL_TAB = ptab.dataset.ptab; renderPanel(); return; }
  const jump = ev.target.closest("[data-jump]");
  if (jump) { jumpTo(jump.dataset.jump); return; }
  const unpay = ev.target.closest("[data-unpay]");
  if (unpay) { PAYS = PAYS.filter(p => p.id !== unpay.dataset.unpay); toast("Убрано только на экране"); renderPanel(); return; }
  const slot = ev.target.closest("[data-slot]");
  if (slot) { const f = slot.closest("form"); f.elements.time.value = slot.dataset.slot; f.querySelectorAll("[data-slot]").forEach(b => b.setAttribute("aria-pressed", b === slot ? "true" : "false")); return; }
  const day = ev.target.closest("[data-day]");
  if (day && day.closest("form")) { day.closest("form").elements.date.value = day.dataset.day; return; }
  if (ev.target.id === "retryBtn") { bootLive(); return; }
  const act = ev.target.closest("[data-act]");
  if (act) onAct(act);
});
document.addEventListener("keydown", ev => {
  if ((ev.key === "Enter" || ev.key === " ") && ev.target.classList && ev.target.classList.contains("face")) { ev.preventDefault(); onAct(ev.target); }
  if (ev.key === "Escape") { if (PANEL) closePanel(); else if (document.body.classList.contains("map-full")) setMapFull(false); else if (OPEN) closeOrder(); }
});
$("q").addEventListener("input", () => { Q = $("q").value.trim().toLowerCase(); renderStage(); MAP_KEY = ""; paintMap(true); });
$("searchRow").addEventListener("submit", ev => ev.preventDefault());
document.addEventListener("submit", ev => {
  const form = ev.target;
  if (!(form instanceof HTMLFormElement)) return;
  if (form.classList.contains("send")) { ev.preventDefault(); saveSend(form); }
  else if (form.classList.contains("edit")) { ev.preventDefault(); saveEdit(form); }
  else if (form.id === "keysForm") { ev.preventDefault(); STORE.set("ozon_cid", form.elements.cid.value.trim()); STORE.set("ozon_key", form.elements.key.value.trim()); form.elements.key.value = ""; bootLive(); }
  else if (form.id === "linkForm") {
    ev.preventDefault();
    const h = new URLSearchParams(String(form.elements.link.value).replace(/^.*?#/, "").replace(/\+/g, "%2B"));
    if (!h.get("admin")) { toast("Нужна ссылка целиком", true); return; }
    STORE.set("dlv_admin", h.get("admin")); toast("Чтение таблицы подключено"); if (MODE === "live") bootLive();
  } else if (form.id === "payForm") {
    ev.preventDefault();
    const amount = form.elements.amount.value.trim();
    if (!num(amount)) return;
    PAYS = (PAYS || []).concat([{id: "local-" + Date.now(), amount, date: form.elements.date.value ? form.elements.date.value.split("-").reverse().join(".") : todayRu(), comment: form.elements.comment.value.trim()}]);
    toast("Выплата только на экране"); renderPanel();
  }
});
$("whoBtn").addEventListener("click", () => openPanel("courier"));
$("searchBtn").addEventListener("click", () => { const row = $("searchRow"); row.hidden = !row.hidden; $("searchBtn").setAttribute("aria-expanded", String(!row.hidden)); if (!row.hidden) $("q").focus(); else { Q = ""; $("q").value = ""; render(); } });
$("themeBtn").addEventListener("click", () => {
  const dark = document.documentElement.dataset.theme === "dark" || (!document.documentElement.dataset.theme && matchMedia("(prefers-color-scheme: dark)").matches);
  setTheme(dark ? "light" : "dark");
});
$("reloadBtn").addEventListener("click", async () => {
  $("reloadBtn").classList.add("spin");
  try { if (MODE === "demo") { buildDemo(); toast("Демо обновлено, сеть не вызывалась"); render(); } else await reloadLive(); }
  catch (err) { toast(err.message, true); }
  finally { $("reloadBtn").classList.remove("spin"); }
});
$("mapToggle").addEventListener("click", () => {
  if (wide()) return;
  document.body.classList.toggle("map-hide");
  $("mapToggle").setAttribute("aria-expanded", String(!document.body.classList.contains("map-hide")));
  setTimeout(() => MAP && MAP.resize(), 80);
});
function setMapFull(on) {
  document.body.classList.toggle("map-full", on);
  document.body.classList.remove("map-hide");
  $("mapClose").hidden = !on;
  setTimeout(() => { if (MAP) { MAP.resize(); if (on) { MAP_KEY = ""; paintMap(true); } } }, 60);
}
$("mapFull").addEventListener("click", () => setMapFull(true));
$("mapClose").addEventListener("click", () => setMapFull(false));
$("fitBtn").addEventListener("click", () => { USER_MOVED = false; MAP_KEY = ""; paintMap(true); });
$("rashadBtn").addEventListener("click", () => {
  const ll = rashadTodayLL() || (rashadPoint() && [+rashadPoint().lat, +rashadPoint().lng]);
  if (ll && MAP) MAP.flyTo({center: [ll[1], ll[0]], zoom: 13, duration: reduced() ? 0 : 500});
  else toast("Точки Рашада ещё нет");
});
let styleNow = mapStyleName();
new MutationObserver(() => {
  const next = mapStyleName();
  if (next !== styleNow && MAP) { styleNow = next; MAP.setStyle("https://tiles.openfreemap.org/styles/" + next); }
}).observe(document.documentElement, {attributes: true, attributeFilter: ["data-theme"]});

async function bootLive() {
  MODE = "live"; LOADING = true; LOAD_ERR = "";
  render();
  try { await loadLive(); LOADING = false; render(); bootMap(); fillLogistics().then(() => render()); }
  catch (err) { LOADING = false; LOAD_ERR = err.message || "Не удалось прочитать"; ORDERS = []; render(); }
}
async function reloadLive() { await loadLive(); await fillLogistics(); toast("Прочитано заново"); render(); }
function takeHash() {
  const h = new URLSearchParams(location.hash.replace(/^#/, "").replace(/\+/g, "%2B"));
  if (h.get("admin")) { STORE.set("dlv_admin", h.get("admin")); history.replaceState(null, "", location.pathname + location.search); }
}
function boot() {
  if (DEMO) {
    try { buildDemo(); } catch (err) { $("stage").innerHTML = `<div class="empty"><b>${esc(err.message)}</b></div>`; return; }
    MODE = "demo"; render(); bootMap(); document.body.dataset.ready = "demo";
  } else {
    takeHash();
    if (!STORE.get("ozon_cid") || !STORE.get("ozon_key")) { MODE = "gate"; render(); document.body.dataset.ready = "gate"; return; }
    bootLive().then(() => { document.body.dataset.ready = "live"; });
  }
  setInterval(() => { if ($("fresh")) $("fresh").textContent = freshLabel(); }, 15000);
}
boot();
