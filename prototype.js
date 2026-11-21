/* Прототип экрана менеджера. Заказы, деньги и дни считают calc.js, days.js, fbs.js, config.js.
   Сеть: в демо нет запросов к Ozon и к таблице. В боевом режиме только чтение
   (список, карточка, цены, list / where / payments). Запись перехватывается и не уходит. */
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
    const action = payload && payload.action;
    if (!READ_SHEET.has(action) || new URLSearchParams(location.search).get("demo") === "1") {
      window.__prototypeBlocked.push("sheet:" + (action || "?"));
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
const SHIP = new Set(["awaiting_registration", "acceptance_in_progress", "awaiting_approve", "awaiting_packaging", "awaiting_deliver", "not_accepted"]);
const WAY = new Set(["delivering", "driver_pickup", "sent_by_seller"]);
const STEPS = [["new", "Не отправлен"], ["sent", "Передан"], ["ack", "Принял"], ["agreed", "Согласован"], ["enroute", "В пути"], ["done", "Доставлен"]];
const STORE = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} },
  del(k) { try { localStorage.removeItem(k); } catch {} },
};

let ORDERS = [], PRICES = {}, DELIV = {}, PAYS = [], PAYS_OK = false, RASHAD = null, LOGI = {};
let MODE = DEMO ? "demo" : "gate", LOADING = false, LOAD_ERR = "";
let TAB = "today", Q = "", OPEN = "", EXTRA = null, CONFIRM = null, CANCEL_OPEN = false;
let ARCH = "7", ARCH_DAY = "", PANEL = "", PANEL_TAB = "courier";
let MAP = null, MAP_OK = null, PINS = [], RPIN = null, MAP_KEY = "", ROUTE_KEY = "", USER_MOVED = false, TICK = "";

const canSend = p => p && !isAlmalyFbs(p) && !DELIV[p.posting_number] && (SHIP.has(p.status) || WAY.has(p.status));
const buckets = () => dayBuckets(ORDERS.map((p, i) => [p, i]), DELIV, mskDay(Date.now()));
const todayRu = () => isoToRu(mskDay(Date.now()));

function unloadText(prr) {
  const floor = prr && prr.floor ? ", эт. " + prr.floor : "";
  if (!prr || !prr.code || prr.code === "none") return "Нет";
  const name = {lift: "Лифт", stairs: "Лестница"}[prr.code];
  return (name || prr.code) + floor;
}
function goodsLine(p) {
  return (p.products || []).map(x => `${x.quantity} уп ${tileFormat(String(x.offer_id || ""), x.name || "") || x.offer_id}`).join(" + ");
}
function orderKg(p) {
  return Math.round((p.products || []).reduce((s, x) => s + (Number(x.quantity) || 0) * packKg(tileFormat(String(x.offer_id || ""), x.name || "")), 0));
}
function kgText(kg) { return kg >= 1000 ? (kg / 1000).toFixed(1).replace(".", ",") + " т" : kg + " кг"; }
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
function ozWindow(p) {
  const an = (p && p.analytics_data) || {};
  if (!an.delivery_date_begin) return "";
  const day = mskDay(new Date(an.delivery_date_begin).getTime()), t = mskDay(Date.now());
  const label = day === t ? "сегодня" : day === addDaysIso(t, 1) ? "завтра" : isoToRu(day).slice(0, 5);
  const end = an.delivery_date_end ? "–" + mskClock(an.delivery_date_end) : "";
  return `${label} ${mskClock(an.delivery_date_begin)}${end}`;
}
function whenOf(p) {
  const d = DELIV[p.posting_number];
  if (!d) return ozWindow(p);
  const info = deliveryDetails(d.comment);
  const time = info.time || ((agreementOf(d) || {}).slot) || "";
  if (!d.date) return time || "без даты";
  if (d.date === todayRu()) return time || "сегодня";
  return [d.date.slice(0, 5), time].filter(Boolean).join(" · ");
}
function whenShort(v) {
  const m = /(\d\d)\.(\d\d)(?:\.\d{4})?\s+(\d\d:\d\d)/.exec(String(v || ""));
  if (!m) return "";
  return `${m[1]}.${m[2]}` === agreedNow().slice(0, 5) ? m[3] : `${m[1]}.${m[2]} ${m[3]}`;
}
function phoneOf(p) {
  const d = DELIV[p.posting_number];
  if (d && d.phone) return {phone: String(d.phone).replace(/^'/, ""), ext: d.ext || ""};
  return {phone: (p.customer || {}).phone || "", ext: ((p.addressee || {}).pin) || ""};
}
function telHref(phone, ext) {
  const digits = String(phone || "").replace(/\D/g, "").replace(/^8(?=\d{10}$)/, "7");
  const x = ext ? String(ext).replace(/\D/g, "").padStart(4, "0") : "";
  return digits ? `tel:+${digits}${x ? "," + x : ""}` : "";
}
function flow(p) {
  const d = DELIV[p.posting_number];
  const n = d ? courierNotes(d.courier_comment) : {};
  const a = d ? agreementOf(d) : null;
  const cancelled = p.status === "cancelled" || !!(d && d.status === "Отменён");
  const delivered = p.status === "delivered" || !!(d && d.status === "Доставлен");
  const has = {
    new: true, sent: !!d, ack: !!(d && isAccepted(d)),
    agreed: !!(a || (d && d.status === "Согласован")),
    enroute: !!(n.enroute || n.onsite), done: delivered,
  };
  let cur = 0;
  STEPS.forEach(([k], i) => { if (has[k]) cur = i; });
  const at = {
    new: p.in_process_at ? mskStamp(p.in_process_at) : "",
    sent: d && d.sent, ack: n.ack && n.ack.at, agreed: a && a.at,
    enroute: (n.onsite && n.onsite.at) || (n.enroute && n.enroute.at),
    done: d && d.delivered_at,
  };
  const steps = STEPS.map(([k, label], i) => ({k, label, when: i <= cur ? whenShort(at[k]) : ""}));
  if (cancelled) return {key: "cancel", label: "Отменён", cur, steps, onsite: false, when: ""};
  const key = STEPS[cur][0];
  return {key, label: STEPS[cur][1], cur, steps, onsite: !!(n.onsite && !delivered && !cancelled), when: whenShort(at[key])};
}
function lateOf(p) {
  const o = orderDay(p, DELIV[p.posting_number]);
  return o.kind === "work" && !!o.day && o.day < mskDay(Date.now());
}
function moneyOf(p) { return orderMoney(p, DELIV[p.posting_number], PRICES, LOGI); }
const WD = ["вс", "пн", "вт", "ср", "чт", "пт", "сб"];
function dayTitle(iso) {
  const t = mskDay(Date.now());
  const d = new Date(iso + "T12:00:00Z");
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
  const b = buckets(), id = p.posting_number;
  const has = list => list.some(([x]) => x.posting_number === id);
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
    const next = left.shift();
    out.push(next);
    cur = next.ll;
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
    status: "delivering", in_process_at: clockIso(t, "08:10"),
    products: [tile("60×60", 8, 4200)], delivery_price: "1500",
    prr_option: {code: "lift", price: "900", floor: 5},
    customer: cust("Андрей Соколов", "+79031001001", "Советская улица, 12, Балашиха", 55.7964, 37.9385, "Домофон не работает"),
  });
  add(way, {
    cb: "ЦБ-9101", status: "Согласован", date: isoToRu(t), delivery: "1500", lift: "900",
    sent: isoToRu(t) + " 08:20",
    comment: deliveryComment({time: "14:00–16:00", note: "Позвонить за 20 минут", foreman: "+79032001001"}),
    courier_comment: courierComment({ack: {at: at(t, "08:40")}, agreed: {who: "прораб", at: at(t, "09:05"), slot: "14:00–16:00"}, enroute: {at: at(t, "11:10")}, onsite: {at: at(t, "11:36")}, text: "Поднялись, ждём прораба"}),
  });

  const go = posting("00000000-0102-1", {
    status: "delivering", in_process_at: clockIso(t, "08:30"),
    products: [tile("60×120", 6, 5100)], delivery_price: "1800",
    prr_option: {code: "stairs", price: "1400", floor: 3},
    customer: cust("Марина Лебедева", "+79031001002", "Маяковского улица, 8, Железнодорожный", 55.7442, 38.0094, ""),
  });
  add(go, {
    cb: "ЦБ-9102", status: "Согласован", date: isoToRu(t), delivery: "1800", lift: "1400",
    sent: isoToRu(t) + " 08:35",
    comment: deliveryComment({time: "16:00–18:00"}),
    courier_comment: courierComment({ack: {at: at(t, "08:50")}, agreed: {who: "клиент", at: at(t, "10:15"), slot: "16:00–18:00"}, enroute: {at: at(t, "12:05")}}),
  });

  const agreed = posting("00000000-0103-1", {
    status: "delivering", in_process_at: clockIso(t, "07:40"),
    products: [tile("60×60", 4, 3900), tile("60×120", 2, 4800)], delivery_price: "1200",
    prr_option: {code: "lift", price: "700", floor: 7},
    customer: cust("Илья Петров", "+79031001003", "Юбилейный проспект, 48, Реутов", 55.7614, 37.8572, ""),
  });
  add(agreed, {
    cb: "ЦБ-9103", status: "Согласован", date: isoToRu(t), delivery: "1200", lift: "700", ext: "214",
    sent: isoToRu(t) + " 09:00",
    comment: deliveryComment({time: "12:00–14:00", foreman: "+79032001003"}),
    courier_comment: courierComment({ack: {at: at(t, "09:10")}, agreed: {who: "прораб", at: at(t, "09:40"), slot: "12:00–14:00"}}),
  });

  const ack = posting("00000000-0104-1", {
    status: "delivering", in_process_at: clockIso(t, "09:00"),
    products: [tile("60×60", 10, 3600)], delivery_price: "1600",
    prr_option: {code: "none", price: "0"},
    customer: cust("Ольга Смирнова", "+79031001004", "Октябрьский проспект, 140, Люберцы", 55.6778, 37.8935, ""),
  });
  add(ack, {
    cb: "ЦБ-9104", status: "Новый", date: isoToRu(t), delivery: "1600", lift: "0",
    sent: isoToRu(t) + " 09:20",
    comment: deliveryComment({time: "18:00–20:00"}),
    courier_comment: courierComment({ack: {at: at(t, "09:28")}}),
  });

  const sent = posting("00000000-0105-1", {
    status: "delivering", in_process_at: clockIso(y, "16:00"),
    products: [tile("60×60", 5, 4000)], delivery_price: "1500",
    prr_option: {code: "lift", price: "800", floor: 2},
    customer: cust("Павел Орлов", "+79031001005", "Мира улица, 26, Мытищи", 55.9112, 37.7304, ""),
  });
  add(sent, {
    cb: "ЦБ-9105", status: "Новый", date: isoToRu(y), delivery: "1500", lift: "800",
    sent: isoToRu(y) + " 18:10", comment: deliveryComment({time: "10:00–12:00"}),
  });

  const done = posting("00000000-0106-1", {
    status: "delivered", in_process_at: clockIso(t, "07:10"),
    products: [tile("60×60", 12, 4100)], delivery_price: "1500",
    prr_option: {code: "lift", price: "900", floor: 4},
    customer: cust("Елена Кузнецова", "+79031001006", "Энтузиастов шоссе, 3, Балашиха", 55.7872, 37.9681, ""),
  });
  add(done, {
    cb: "ЦБ-9106", status: "Доставлен", date: isoToRu(t), delivery: "1500", lift: "900",
    sent: isoToRu(t) + " 07:30", delivered_at: isoToRu(t) + " 13:20",
    comment: deliveryComment({time: "12:00–14:00"}),
    courier_comment: courierComment({ack: {at: at(t, "07:45")}, agreed: {who: "клиент", at: at(t, "08:10"), slot: "12:00–14:00"}, enroute: {at: at(t, "12:30")}, onsite: {at: at(t, "13:05")}}),
  });

  const cancel = posting("00000000-0107-1", {
    status: "cancelled", in_process_at: clockIso(t, "08:00"),
    products: [tile("60×60", 3, 3900)], delivery_price: "1000",
    customer: cust("Сергей Волков", "+79031001007", "Комсомольская улица, 5, Люберцы", 55.6901, 37.9102, ""),
  });
  add(cancel, {cb: "ЦБ-9107", status: "Отменён", date: isoToRu(t), delivery: "1000", lift: "0", sent: isoToRu(t) + " 08:15"});

  add(posting("00000000-0108-1", {
    status: "awaiting_deliver", in_process_at: clockIso(t, "10:05"),
    products: [tile("60×60", 6, 2400)], delivery_price: "900",
    prr_option: {code: "stairs", price: "600", floor: 4},
    customer: cust("Никита Егоров", "+79031001008", "Победы улица, 7, Реутов", 55.7522, 37.8555, "Оплата на месте"),
    analytics_data: {delivery_date_begin: clockIso(t, "15:00"), delivery_date_end: clockIso(t, "17:00"), city: "Реутов"},
  }));
  add(posting("00000000-0109-1", {
    status: "awaiting_deliver", in_process_at: clockIso(t, "11:20"),
    products: [tile("60×120", 8, 5300)], delivery_price: "2000",
    prr_option: {code: "lift", price: "1100", floor: 9},
    customer: cust("Дарья Новикова", "+79031001009", "2-й Покровский проезд, 5, Котельники", 55.6604, 37.8655, ""),
    analytics_data: {delivery_date_begin: clockIso(d1, "10:00"), delivery_date_end: clockIso(d1, "12:00"), city: "Котельники"},
  }));

  const nodate = posting("00000000-0110-1", {
    status: "delivering", in_process_at: clockIso(y, "12:00"),
    products: [tile("60×60", 7, 3800)], delivery_price: "1400",
    customer: cust("Кирилл Морозов", "+79031001010", "Новая улица, 2, Старая Купавна", 55.7455, 38.0801, ""),
  });
  add(nodate, {
    cb: "ЦБ-9110", status: "Новый", date: "", delivery: "1400", lift: "0",
    sent: isoToRu(y) + " 12:30",
    courier_comment: courierComment({ack: {at: at(y, "12:40")}, text: "Клиент просит перенести, дату не назвал"}),
  });

  const tomorrow = posting("00000000-0111-1", {
    status: "delivering", in_process_at: clockIso(t, "09:50"),
    products: [tile("60×60", 9, 4000)], delivery_price: "1700",
    prr_option: {code: "lift", price: "900", floor: 6},
    customer: cust("Анна Белова", "+79031001011", "Центральная улица, 15, Железнодорожный", 55.7501, 38.0204, ""),
  });
  add(tomorrow, {
    cb: "ЦБ-9111", status: "Согласован", date: isoToRu(d1), delivery: "1700", lift: "900",
    sent: isoToRu(t) + " 10:00",
    comment: deliveryComment({time: "10:00–12:00"}),
    courier_comment: courierComment({ack: {at: at(t, "10:12")}, agreed: {who: "клиент", at: at(t, "10:40"), slot: "10:00–12:00"}}),
  });
  const later = posting("00000000-0112-1", {
    status: "delivering", in_process_at: clockIso(t, "11:00"),
    products: [tile("60×120", 4, 5000)], delivery_price: "1600",
    customer: cust("Виктор Савельев", "+79031001012", "Ленина проспект, 15, Балашиха", 55.8092, 37.9584, ""),
  });
  add(later, {
    cb: "ЦБ-9112", status: "Новый", date: isoToRu(d3), delivery: "1600", lift: "0",
    sent: isoToRu(t) + " 11:15",
    courier_comment: courierComment({ack: {at: at(t, "11:22")}}),
  });

  const yDone = posting("00000000-0113-1", {
    status: "delivered", in_process_at: clockIso(y, "08:00"),
    products: [tile("60×60", 6, 4000)], delivery_price: "1300",
    customer: cust("Юлия Фролова", "+79031001013", "Советская улица, 40, Реутов", 55.758, 37.862, ""),
  });
  add(yDone, {cb: "ЦБ-9113", status: "Доставлен", date: isoToRu(y), delivery: "1300", lift: "0", sent: isoToRu(y) + " 08:20", delivered_at: isoToRu(y) + " 15:10"});
  const old = posting("00000000-0114-1", {
    status: "delivered", in_process_at: clockIso(ago(5), "08:00"),
    products: [tile("60×60", 15, 3700)], delivery_price: "1900",
    prr_option: {code: "lift", price: "1000", floor: 8},
    customer: cust("Геннадий Пашин", "+79031001014", "Строителей улица, 9, Балашиха", 55.802, 37.97, ""),
  });
  add(old, {cb: "ЦБ-9114", status: "Доставлен", date: isoToRu(ago(5)), delivery: "1900", lift: "1000", sent: isoToRu(ago(5)) + " 09:00", delivered_at: isoToRu(ago(5)) + " 17:40"});
  const oldX = posting("00000000-0115-1", {
    status: "cancelled", in_process_at: clockIso(ago(4), "08:00"),
    products: [tile("60×60", 2, 3900)],
    customer: cust("Роман Ильин", "+79031001015", "Парковая улица, 1, Люберцы", 55.682, 37.89, ""),
  });
  add(oldX, {cb: "ЦБ-9115", status: "Отменён", date: isoToRu(ago(4)), delivery: "0", lift: "0", sent: isoToRu(ago(4)) + " 09:00"});

  ORDERS.push(posting("00000000-0199-1", {
    status: "awaiting_packaging", in_process_at: clockIso(t, "07:00"),
    products: [tile("60×60", 20, 3500)],
    customer: cust("Склад", "", "FBS Алмалы, не адрес клиента", "", "", ""),
    delivery_method: {warehouse_id: "1020005035230080", warehouse: "FBS Алмалы (Плитка 60×60 Розница)", name: "Ozon"},
  }));

  PRICES = {
    "600-josephine": {commissions: {sales_percent_rfbs: 41, sales_percent_fbs: 41}, marketing_actions: {actions: []}},
    "612-calacatta": {commissions: {sales_percent_rfbs: 41, sales_percent_fbs: 41}, marketing_actions: {actions: []}},
  };
  const now = Date.now();
  RASHAD = {
    latest: {ts: now - 90 * 1000, lat: 55.792, lng: 37.925, acc: 18, battery: 0.64},
    track: [
      {ts: now - 50 * 60 * 1000, lat: 55.761, lng: 37.857},
      {ts: now - 30 * 60 * 1000, lat: 55.775, lng: 37.89},
      {ts: now - 12 * 60 * 1000, lat: 55.786, lng: 37.912},
      {ts: now - 90 * 1000, lat: 55.792, lng: 37.925},
    ],
  };
  PAYS = [
    {id: "demo-1", amount: "18600", date: isoToRu(ago(12)), comment: "на карту"},
    {id: "demo-2", amount: "12400", date: isoToRu(ago(3)), comment: "наличные"},
  ];
  PAYS_OK = true;
  checkDemo();
}
function checkDemo() {
  const b = buckets();
  const today = b.today.work.concat(b.today.done, b.today.cancel);
  if (today.some(([p]) => isAlmalyFbs(p)) || b.fresh.send.some(([p]) => isAlmalyFbs(p))) throw new Error("FBS попал к Рашаду");
  if (!b.fbs) throw new Error("Нет заказа FBS");
  const labels = new Set(ORDERS.map(p => flow(p).label));
  for (const s of ["Не отправлен", "Передан", "Принял", "Согласован", "В пути", "Доставлен", "Отменён"]) {
    if (!labels.has(s)) throw new Error("Нет статуса " + s);
  }
  const t = mskDay(Date.now());
  if (b.today.work.some(([, , o]) => o.day && o.day > t)) throw new Error("Будущий заказ попал в сегодня");
  if (Object.keys(b.upcoming).some(d => d <= t)) throw new Error("Сегодня попало во вкладку впереди");
}

async function ozon(path, payload) {
  if (!READ_OZON.has(path)) throw new Error("Прототип не пишет в Ozon");
  const r = await fetch("https://api-seller.ozon.ru" + path, {
    method: "POST",
    headers: {"Client-Id": STORE.get("ozon_cid") || "", "Api-Key": STORE.get("ozon_key") || "", "Content-Type": "application/json"},
    body: JSON.stringify(payload),
  });
  if (!r.ok) throw new Error("Ozon не ответил (" + r.status + ")");
  return r.json();
}
async function loadLive() {
  const to = new Date();
  const filter = {since: new Date(to - 90 * 864e5).toISOString().slice(0, 19) + "Z", to: to.toISOString().slice(0, 19) + "Z"};
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
  ORDERS = postings;
  PRICES = prices;
  const admin = STORE.get("dlv_admin");
  if (admin && SCRIPT_URL) {
    try {
      DELIV = Object.fromEntries((await sheetApi({action: "list", key: admin})).map(r => [r.posting, r]));
    } catch { DELIV = {}; LOAD_ERR = "Заказы Ozon прочитаны. Таблица доставок не открылась — в неё всё равно ничего не пишется."; }
    try { RASHAD = await sheetApi({action: "where", key: admin}); } catch { if (!RASHAD) RASHAD = {latest: null, track: []}; }
    try { PAYS = await sheetApi({action: "payments", key: admin}); PAYS_OK = true; }
    catch { PAYS = []; PAYS_OK = false; }
  } else { DELIV = {}; PAYS_OK = false; }
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

function statusHtml(p) {
  const f = flow(p), late = lateOf(p);
  const when = f.onsite ? "на адресе" + (f.when ? " · " + f.when : "") : (whenOf(p) || f.when);
  return `<span class="status k-${f.key}"><i></i>${esc(f.label)}</span>` +
    (when ? `<span class="when${late ? " late" : ""}">${esc(late ? "дата прошла · " + when : when)}</span>` : "");
}
function railHtml(p) {
  const f = flow(p);
  if (f.key === "cancel") return "";
  return `<ol class="rail" aria-hidden="true">${f.steps.map((s, i) => {
    const cls = f.key === "done" ? "done" : i < f.cur ? "done" : i === f.cur ? "now" : "";
    return `<li class="${cls}"></li>`;
  }).join("")}</ol>`;
}
function moneyRow(p) {
  const m = moneyOf(p);
  if (flow(p).key === "cancel") return "";
  const profit = m.profit == null ? "—" : rub(m.profit);
  const cls = m.profit == null ? "" : m.profit < 0 ? "neg" : "pos";
  return `<div class="money"><div><span>Товар</span><b>${sp(m.goods)} ₽</b></div><div><span>${m.planned ? "Рашаду, план" : "Рашаду"}</span><b>${sp(m.courier)} ₽</b></div>` +
    `<div class="${cls}"><span>Прибыль</span><b>${profit}</b></div></div>`;
}
function primaryAct(p) {
  if (isAlmalyFbs(p) || (EXTRA && EXTRA.posting === p.posting_number)) return "";
  const d = DELIV[p.posting_number], f = flow(p);
  if (f.key === "cancel" || f.key === "done") return "";
  if (!d && canSend(p)) return `<button type="button" class="btn grow" data-act="send" data-id="${esc(p.posting_number)}">${ic("send")}Отправить Рашаду</button>`;
  if (!d) return "";
  if (!isAccepted(d)) return `<button type="button" class="btn ghost grow" data-act="remind" data-id="${esc(p.posting_number)}">${ic("bell")}Напомнить</button>`;
  return `<button type="button" class="btn grow" data-act="ask-done" data-id="${esc(p.posting_number)}">${ic("check")}Доставлено</button>`;
}
function cardHtml(p, n) {
  if (isAlmalyFbs(p)) return "";
  const d = DELIV[p.posting_number], f = flow(p), open = OPEN === p.posting_number;
  const [area, rest] = addrParts(addrOf(p));
  const act = primaryAct(p);
  return `<article class="card k-${f.key}${lateOf(p) ? " late" : ""}${open ? " open" : ""}" data-id="${esc(p.posting_number)}" style="--i:${Math.min(n, 8)}">
    <div class="card-top"><span class="cb${d && d.cb ? "" : " need"}">${d && d.cb ? esc(d.cb) : "Без ЦБ"}</span>${statusHtml(p)}</div>
    <div class="card-hit" data-act="toggle" data-id="${esc(p.posting_number)}" role="button" tabindex="0" aria-expanded="${open ? "true" : "false"}">
      <b>${esc(area)}</b>${rest ? `<span>${esc(rest)}</span>` : ""}
      <div class="meta"><span>${esc(goodsLine(p))} · ${esc(kgText(orderKg(p)))}</span>${(d ? d.unload : unloadText(p.prr_option)) !== "Нет" ? `<span>${esc(d ? d.unload : unloadText(p.prr_option))}</span>` : ""}</div>
      ${railHtml(p)}${moneyRow(p)}
    </div>
    ${act ? `<div class="acts">${act}</div>` : ""}
    <div class="more"><div class="more-in">${open ? moreHtml(p) : ""}</div></div>
  </article>`;
}
function receiptHtml(p) {
  const m = moneyOf(p), t = m.t, f = flow(p);
  const line = (k, v, cls = "", sub = "") => `<div class="rline ${cls}"><span>${k}${sub ? `<small>${esc(sub)}</small>` : ""}</span><b>${v}</b></div>`;
  const goods = (p.products || []).map(x => {
    const price = parseFloat(x.price && x.price.amount != null ? x.price.amount : x.price) || 0;
    const qty = Number(x.quantity) || 0;
    return line(`${qty} уп · ${esc(shortName(x.name).replace(/^Керамогранит\s+/i, ""))}`, rub(price * qty));
  }).join("");
  const map = {red: ["ниже порога", "bad"], yellow: ["на грани", "mid"], green: ["выше порога", "ok"]};
  const lv = m.level && map[m.level] ? `<span class="lv lv-${map[m.level][1]}">${sp(m.perM2)} ₽/м² · ${map[m.level][0]}</span>` : "";
  const oz = (on, text) => text + (on ? " · из Ozon" : "");
  return `<section class="receipt"><h3>Расчёт ${lv}</h3>${goods}
    ${m.clientDelivery ? line("Доставка от клиента", rub(m.clientDelivery), "", "по данным Ozon") : ""}
    ${m.clientLift ? line("Подъём от клиента", rub(m.clientLift), "", "по данным Ozon") : ""}
    ${!m.clientDelivery && !m.clientLift ? line("Доставка и подъём от клиента", "в Ozon нет суммы") : ""}
    ${line("Клиент платит", rub(m.client), "tot")}
    ${t ? line("Комиссия Ozon, эквайринг, сбор", "−" + sp(t.commission + t.acquiring + t.fee) + " ₽") + line("НДС к уплате", "−" + sp(t.vat) + " ₽") + line("Себестоимость плитки", "−" + sp(t.cost) + " ₽") : ""}
    ${line(m.planned ? "Рашаду (план)" : "Рашаду", "−" + sp(m.courier) + " ₽", "", oz(m.deliveryAuto, "доставка " + sp(m.courierDelivery)) + " + " + oz(m.liftAuto, "подъём " + sp(m.courierLift)))}
    ${m.profit == null ? line("Прибыль", "не считается — не плитка 60×60 или 60×120") : line("Прибыль по заказу", rub(m.profit), "profit" + (m.profit < 0 ? " neg" : ""))}
    ${f.key === "done" && p.status !== "delivered" ? `<p class="hint">В Ozon это не отмечалось — прототип туда не пишет.</p>` : ""}
  </section>`;
}
function timelineHtml(p) {
  const f = flow(p);
  return `<ol class="time">${f.steps.map((s, i) => {
    const cls = f.key === "cancel" ? "" : f.key === "done" || i < f.cur ? "done" : i === f.cur ? "now" : "";
    return `<li class="${cls}"><i></i><b>${esc(s.label)}</b><time>${esc(s.when || "")}</time></li>`;
  }).join("")}${f.key === "cancel" ? `<li class="now cancel"><i></i><b>Отменён</b><time></time></li>` : ""}</ol>`;
}
function confirmHtml(p) {
  if (!CONFIRM || CONFIRM.posting !== p.posting_number) return "";
  const cancel = CONFIRM.kind === "cancel";
  return `<div class="confirm"><p>${cancel ? "Статус станет «Отменён» только на этом экране. Рашаду пуш не уйдёт, таблица и Ozon не изменятся." : "Статус станет «Доставлен» только на этом экране. В Ozon и в таблицу это не отправится."}</p>
    <div class="acts"><button type="button" class="btn${cancel ? " danger" : ""}" data-act="confirm-yes" data-id="${esc(p.posting_number)}">Да, только здесь</button>
    <button type="button" class="btn soft" data-act="confirm-no">Не надо</button></div></div>`;
}
function sendForm(p) {
  const old = EXTRA && EXTRA.old && DELIV[EXTRA.old];
  const oz = ozonLogistics(p, LOGI);
  const dlv = old && num(old.delivery) > 0 ? num(old.delivery) : oz.delivery;
  const lift = old && num(old.lift) > 0 ? num(old.lift) : oz.lift;
  const cb = old ? String(old.cb || "").replace(/^ЦБ-?/i, "") : "";
  const date = old && dayIso(old.date) || "";
  const time = old ? deliveryDetails(old.comment).time : "";
  const t = mskDay(Date.now()), tm = addDaysIso(t, 1);
  const info = old ? deliveryDetails(old.comment) : {};
  return `<form class="form send" data-id="${esc(p.posting_number)}" data-old="${esc(EXTRA && EXTRA.old || "")}">
    ${old ? `<p class="hint">Замена вместо ${esc(old.cb || EXTRA.old)}. Прежний заказ станет «Отменён» только на этом экране.</p>` : ""}
    <label>Номер ЦБ из 1С<input name="cb" inputmode="numeric" autocomplete="off" required placeholder="9108" value="${esc(cb)}"></label>
    <div class="grid2"><label>Доставка Рашаду, ₽<input name="delivery_pay" inputmode="numeric" value="${dlv || ""}" placeholder="${oz.delivery}" data-oz="${oz.delivery}"></label>
    <label>Подъём, ₽<input name="lift_pay" inputmode="numeric" value="${lift || ""}" placeholder="${oz.lift}" data-oz="${oz.lift}"></label></div>
    <p class="hint">Пустое поле — сумма из Ozon. Рашаду выйдет <b data-sum>${rub(dlv + lift)}</b>. Финансы магазина ему не показываем.</p>
    <label>Когда везти<div class="days"><button type="button" data-day="${t}" aria-pressed="${date === t}">Сегодня</button><button type="button" data-day="${tm}" aria-pressed="${date === tm}">Завтра</button><input name="date" type="date" value="${esc(date)}" aria-label="Дата"></div></label>
    <label>Время<input name="time" value="${esc(time)}" placeholder="или своё, например с 9 до 11" maxlength="100">
      <span class="slots">${DELIVERY_SLOTS.map(x => `<button type="button" data-slot="${esc(x)}" aria-pressed="${x === time}">${esc(slotLabel(x))}</button>`).join("")}</span></label>
    <label>Телефон прораба<input name="foreman" type="tel" value="${esc(info.foreman || "")}" placeholder="+7 900 000-00-00"></label>
    <label>Пометка для Рашада<textarea name="note" rows="2" maxlength="2000">${esc(info.note || (old ? "Замена заказа " + (old.cb || "") : ""))}</textarea></label>
    <p class="hint">В таблицу это не запишется и пуш Рашаду не уйдёт.</p>
    <div class="acts"><button type="button" class="btn soft" data-act="close-extra">Назад</button><button class="btn grow">${old ? "Заменить" : "Отправить"} · <span data-sum>${rub(dlv + lift)}</span></button></div>
  </form>`;
}
function editForm(p) {
  const d = DELIV[p.posting_number], info = deliveryDetails(d.comment);
  const name = (info.ozon && info.ozon.customer) || (p.customer || {}).name || "";
  const date = dayIso(d.date), t = mskDay(Date.now());
  const oz = ozonLogistics(p, LOGI), pay = courierPay(d, oz);
  const f = (n, label, v, attrs = "") => `<label>${label}<input name="${n}" value="${esc(v ?? "")}" ${attrs}></label>`;
  return `<form class="form edit" data-id="${esc(p.posting_number)}">
    <label>Адрес<textarea name="address" rows="2" required>${esc(d.address || "")}</textarea></label>
    <div class="grid2">${f("cb", "Номер ЦБ", String(d.cb || "").replace(/^ЦБ-?/i, ""), 'inputmode="numeric" autocomplete="off"')}${f("name", "Получатель", name, 'autocomplete="off"')}</div>
    <div class="grid2">${f("phone", "Телефон", String(d.phone || "").replace(/^'/, ""), 'type="tel"')}${f("ext", "Добавочный", d.ext || "", 'inputmode="numeric"')}</div>
    <label>Дата<div class="days"><button type="button" data-day="${t}" aria-pressed="${date === t}">Сегодня</button><button type="button" data-day="${addDaysIso(t, 1)}" aria-pressed="${date === addDaysIso(t, 1)}">Завтра</button><input name="date" type="date" value="${esc(date)}" aria-label="Дата доставки"></div></label>
    <label>Время<input name="time" value="${esc(info.time || "")}" maxlength="100"><span class="slots">${DELIVERY_SLOTS.map(x => `<button type="button" data-slot="${esc(x)}" aria-pressed="${x === info.time}">${esc(slotLabel(x))}</button>`).join("")}</span></label>
    <div class="grid2">${f("packs", "Упаковки", d.packs || "")}${f("unload", "Разгрузка", d.unload || "", 'placeholder="Лифт, эт. 5"')}</div>
    <div class="grid2">${f("delivery", "Доставка, ₽" + (pay.deliveryAuto ? " · из Ozon" : ""), num(d.delivery) > 0 ? d.delivery : "", `inputmode="numeric" placeholder="${oz.delivery}" data-oz="${oz.delivery}"`)}
      ${f("lift", "Подъём, ₽" + (pay.liftAuto ? " · из Ozon" : ""), num(d.lift) > 0 ? d.lift : "", `inputmode="numeric" placeholder="${oz.lift}" data-oz="${oz.lift}"`)}</div>
    <p class="hint">Пустое поле берёт сумму из Ozon. Рашаду: <b data-sum>${rub(pay.delivery + pay.lift)}</b></p>
    ${f("foreman", "Телефон прораба", info.foreman || "", 'type="tel" placeholder="+7 900 000-00-00"')}
    <label>Пометка<textarea name="note" rows="2" maxlength="2000">${esc(info.note || "")}</textarea></label>
    <div class="acts"><button type="button" class="btn soft" data-act="close-extra">Назад</button><button class="btn grow">${ic("check")}Сохранить здесь</button></div>
  </form>`;
}
function replaceHtml(p) {
  const cands = ORDERS.filter(x => canSend(x));
  return `<div class="picker"><p class="hint">Выберите заказ Ozon вместо ${esc((DELIV[p.posting_number] || {}).cb || p.posting_number)}. Склад FBS в список не входит.</p>
    ${cands.length ? cands.map(x => `<button type="button" class="picker-i" data-act="pick" data-id="${esc(x.posting_number)}" data-old="${esc(p.posting_number)}"><span><b>${esc(addrParts(addrOf(x))[0])}</b><span>${esc(goodsLine(x))}</span></span>${ic("chev")}</button>`).join("") : `<p class="hint">Неотправленных заказов нет.</p>`}
    <form class="form" data-repl="${esc(p.posting_number)}"><label>Или номер отправления<input name="num" placeholder="00000000-0108-1" autocomplete="off"></label><button class="btn">Дальше</button></form>
    <button type="button" class="btn soft" data-act="close-extra">Назад</button></div>`;
}
function moreHtml(p) {
  const d = DELIV[p.posting_number];
  const editing = EXTRA && EXTRA.type === "edit" && EXTRA.posting === p.posting_number;
  const sending = EXTRA && EXTRA.type === "send" && EXTRA.posting === p.posting_number;
  const replacing = EXTRA && EXTRA.type === "replace" && EXTRA.posting === p.posting_number;
  const notes = d ? courierNotes(d.courier_comment) : {text: ""};
  const ph = phoneOf(p), tel = telHref(ph.phone, ph.ext);
  let foreman = "";
  try { foreman = d ? foremanPhone(deliveryDetails(d.comment).foreman) : ""; } catch { foreman = ""; }
  const win = ozWindow(p);
  if (sending) return sendForm(p) + confirmHtml(p);
  if (editing) return editForm(p);
  if (replacing) return replaceHtml(p);
  const links = [
    tel ? `<a href="${esc(tel)}">${ic("phone")}Клиенту</a>` : "",
    foreman ? `<a href="tel:${esc(foreman)}">${ic("user")}Прорабу</a>` : "",
    llOf(p) ? `<button type="button" data-act="fly" data-id="${esc(p.posting_number)}">${ic("map")}На карте</button>` : "",
    `<a href="https://seller.ozon.ru/app/postings/fbs?search=${encodeURIComponent(p.posting_number)}" target="_blank" rel="noopener">${ic("nav")}В Ozon</a>`,
    `<button type="button" data-act="copy" data-id="${esc(p.posting_number)}">${ic("copy")}Номер</button>`,
    d ? `<button type="button" data-act="edit" data-id="${esc(p.posting_number)}">${ic("edit")}Изменить</button>` : "",
  ].filter(Boolean).join("");
  return `${receiptHtml(p)}${timelineHtml(p)}
    ${win ? `<p class="hint">Окно Ozon: ${esc(win)}</p>` : ""}
    ${notes.text ? `<div class="quote"><span>Рашад</span>${esc(notes.text)}</div>` : ""}
    <div class="links">${links}</div>
    ${confirmHtml(p)}
    ${dangerHtml(p)}
    <button type="button" class="btn soft" data-act="toggle" data-id="${esc(p.posting_number)}">Свернуть</button>`;
}
function dangerHtml(p) {
  const d = DELIV[p.posting_number];
  if (!d || isAlmalyFbs(p) || p.status === "cancelled") return p.status === "cancelled" ? `<p class="hint">В Ozon заказ уже отменён.</p>` : "";
  if (d.status === "Отменён") return `<button type="button" class="btn ghost" data-act="restore" data-id="${esc(p.posting_number)}">${ic("undo")}Вернуть в работу</button>`;
  if (d.status === "Доставлен" || p.status === "delivered") return "";
  return `<div class="acts"><button type="button" class="btn ghost" data-act="replace" data-id="${esc(p.posting_number)}">${ic("swap")}Заменить</button>
    <button type="button" class="btn danger" data-act="ask-cancel" data-id="${esc(p.posting_number)}">${ic("ban")}Отменить</button></div>`;
}
function section(title, list, cls) {
  if (!list.length) return "";
  return `<section class="sec ${cls || ""}"><h2>${esc(title)} <em>${list.length}</em></h2>${list.map((p, n) => cardHtml(p, n)).join("")}</section>`;
}
function dateBadge() {
  const parts = new Intl.DateTimeFormat("ru-RU", {timeZone: "Europe/Moscow", day: "numeric", month: "short", weekday: "short"}).formatToParts(new Date());
  const get = type => (parts.find(p => p.type === type) || {}).value || "";
  return `<div class="daten"><b>${esc(get("day"))}</b><span>${esc(get("month"))}<br>${esc(get("weekday"))}</span></div>`;
}
function todayHtml() {
  const b = buckets();
  const work = b.today.work.slice().sort((a, c) => flow(c[0]).cur - flow(a[0]).cur);
  const done = b.today.done.slice().sort((a, c) => String((DELIV[c[0].posting_number] || {}).delivered_at || "").localeCompare(String((DELIV[a[0].posting_number] || {}).delivered_at || "")));
  const all = work.concat(done);
  const s = sumMoney(all.map(([p]) => [p]), DELIV, PRICES, LOGI);
  const total = all.length, pct = total ? done.length / total : 0;
  const late = work.filter(x => x[2].late).length;
  const wait = work.filter(([p]) => DELIV[p.posting_number] && !isAccepted(DELIV[p.posting_number])).length;
  const chips = [
    b.fresh.send.length ? `<button type="button" data-act="go" data-tab="fresh">${esc(plural(b.fresh.send.length, "новый ждёт отправки", "новых ждут отправки", "новых ждут отправки"))}</button>` : "",
    b.fresh.nodate.length ? `<button type="button" data-act="go" data-tab="fresh">${b.fresh.nodate.length} без даты</button>` : "",
    late ? `<button type="button" data-act="go" data-tab="today" data-focus="late">${late} с прошедшей датой</button>` : "",
    wait ? `<button type="button" data-act="go" data-tab="today">${wait} не принял</button>` : "",
    b.fbs ? `<button type="button" class="quiet" data-act="go" data-tab="fresh">FBS на складе · ${b.fbs}</button>` : "",
  ].filter(Boolean).join("");
  const profitCls = !s.profitKnown ? "" : s.profit < 0 ? "neg" : "pos";
  let body = work.length ? `<section class="sec"><h2>В работе <em>${work.length}</em></h2>${work.map(([p], n) => cardHtml(p, n)).join("")}</section>` : "";
  body += done.length ? `<section class="sec done"><h2>Доставлено сегодня <em>${done.length}</em></h2>${done.map(([p], n) => cardHtml(p, n)).join("")}</section>` : "";
  body += b.today.cancel.length ? `<details class="sec cancel" id="cancelBox"${CANCEL_OPEN ? " open" : ""}><summary>Отменено сегодня <em>${b.today.cancel.length}</em></summary>${b.today.cancel.map(([p], n) => cardHtml(p, n)).join("")}</details>` : "";
  if (!body) body = `<div class="empty"><b>На сегодня заказов нет</b><p>${b.fresh.send.length ? "Новые ждут во вкладке «Новые»." : "Когда у заказа появится дата «сегодня», он будет здесь и только здесь."}</p></div>`;
  return `${LOAD_ERR ? `<p class="banner">${esc(LOAD_ERR)}</p>` : ""}${adminNote()}
    <div class="dayhead">${dateBadge()}<div class="daystat"><strong>${total ? `Доставлено ${done.length} из ${total}` : "На сегодня пусто"}</strong><div class="bar"><i style="--p:${pct}"></i></div></div></div>
    <div class="sums"><div><span>Товар</span><b><span data-count="${Math.round(s.goods)}">${sp(s.goods)}</span> ₽</b></div>
      <div><span>Рашаду</span><b><span data-count="${Math.round(s.courier)}">${sp(s.courier)}</span> ₽</b></div>
      <div class="${profitCls}"><span>Прибыль</span><b>${s.profitKnown ? (s.profit < 0 ? "−" : "") + `<span data-count="${Math.round(Math.abs(s.profit))}">${sp(s.profit)}</span> ₽` : "—"}</b></div></div>
    ${chips ? `<div class="attn">${chips}</div>` : ""}${body}`;
}
function adminNote() {
  if (MODE !== "live" || STORE.get("dlv_admin")) return "";
  return `<p class="banner">Таблица не подключена. Заказы Ozon только читаются. Ссылку доступа можно вставить у Рашада, в настройках.</p>`;
}
function freshHtml() {
  const b = buckets();
  const send = b.fresh.send.slice().sort((a, c) => new Date(c[0].in_process_at) - new Date(a[0].in_process_at));
  let html = section("Нужно отправить Рашаду", send.map(([p]) => p), "") + section("У Рашада без даты", b.fresh.nodate.map(([p]) => p), "");
  if (!html) html = `<div class="empty"><b>Всё разобрано</b><p>Новых заказов и заказов без даты нет.</p></div>`;
  html += fbsBlock(ORDERS.filter(isAlmalyFbs));
  return html;
}
function fbsBlock(list) {
  if (!list.length) return "";
  return `<aside class="fbs"><b>Склад FBS · ${list.length}</b><p>Грузовик Ozon забирает плитку со склада ${esc(FBS_WAREHOUSE_NAME)}. Эти отправления нельзя отправить Рашаду — кнопки отправки нет.</p><ul>${list.map(p => `<li><span>${esc(p.posting_number)}</span><small>${esc(OZON_FBS_STATUS[p.status] || p.status)}</small></li>`).join("")}</ul></aside>`;
}
function aheadHtml() {
  const b = buckets();
  const html = Object.keys(b.upcoming).sort().map(day => section(dayTitle(day), b.upcoming[day].map(([p]) => p))).join("");
  return html || `<div class="empty"><b>Впереди пусто</b><p>Здесь заказы с датой на завтра и позже. Сегодняшние сюда не попадают.</p></div>`;
}
function archiveHtml() {
  const b = buckets();
  const [from, to] = archBounds();
  const list = archiveRange(b.archive, from, to);
  const done = list.filter(x => x[2].kind === "done"), cancel = list.filter(x => x[2].kind !== "done");
  const s = sumMoney(done, DELIV, PRICES, LOGI);
  const chips = [["1", "Вчера"], ["7", "7 дней"], ["30", "30 дней"], ["all", "Всё"]].map(([k, v]) => `<button type="button" data-act="arch" data-arch="${k}" aria-pressed="${ARCH === k}">${v}</button>`).join("");
  const by = {};
  done.forEach(x => { (by[x[2].day] = by[x[2].day] || []).push(x[0]); });
  let html = `<div class="arch">${chips}<input type="date" id="archDay" value="${ARCH === "day" ? esc(ARCH_DAY) : ""}" max="${addDaysIso(mskDay(Date.now()), -1)}" aria-label="День архива"></div>
    <div class="sums"><div><span>Доставлено</span><b>${s.n}</b></div><div><span>Товар</span><b>${sp(s.goods)} ₽</b></div><div><span>Рашаду</span><b>${sp(s.courier)} ₽</b></div><div class="${s.profit < 0 ? "neg" : "pos"}"><span>Прибыль</span><b>${s.profitKnown ? rub(s.profit) : "—"}</b></div></div>`;
  html += Object.keys(by).sort().reverse().map(day => section(dayTitle(day), by[day], "done")).join("");
  if (cancel.length) html += `<details class="sec cancel"><summary>Отменено за период <em>${cancel.length}</em></summary>${cancel.map(([p], n) => cardHtml(p, n)).join("")}</details>`;
  if (!list.length) html += `<div class="empty"><b>За этот период пусто</b><p>Сегодня в архив не входит.</p></div>`;
  return html;
}
function searchHtml() {
  const hits = ORDERS.filter(p => !isAlmalyFbs(p) && matches(p));
  const groups = new Map();
  hits.forEach(p => {
    const [key, title] = placeOf(p);
    if (!groups.has(key)) groups.set(key, {title, list: []});
    groups.get(key).list.push(p);
  });
  const html = [...groups.entries()].sort((a, b) => a[0] < b[0] ? -1 : 1).map(([, g]) => section(g.title, g.list)).join("");
  const fbs = ORDERS.filter(p => isAlmalyFbs(p) && matches(p));
  if (!html && !fbs.length) return `<div class="empty"><b>Ничего не нашли</b><p>Проверьте номер ЦБ, адрес или отправление.</p></div>`;
  return html + fbsBlock(fbs);
}
function matches(p) {
  const d = DELIV[p.posting_number] || {}, a = ((p.customer || {}).address) || {};
  return [p.posting_number, d.cb, d.address, d.phone, (p.customer || {}).name, a.address_tail, a.city, goodsLine(p)].join(" ").toLowerCase().includes(Q);
}
function placeOf(p) {
  const o = orderDay(p, DELIV[p.posting_number]), t = mskDay(Date.now());
  if (o.kind === "new") return ["1", "Новые"];
  if (o.kind === "work" && !o.day) return ["2", "Без даты"];
  if (o.kind === "work" && o.day <= t) return ["0", "Сегодня"];
  if ((o.kind === "done" || o.kind === "cancel") && o.day === t) return ["0", "Сегодня"];
  if (o.kind === "work") return ["3-" + o.day, dayTitle(o.day)];
  return ["4", "Архив"];
}
function gateHtml() {
  return `<form class="gate" id="keysForm"><h2>Ключи Ozon</h2><p>Нужны, чтобы прочитать заказы. Они остаются в этом браузере. Прототип не отмечает доставку и не пишет в таблицу.</p>
    <label>Client-Id<input name="cid" inputmode="numeric" autocomplete="off" required></label>
    <label>Api-Key<input name="key" type="password" autocomplete="new-password" required></label>
    <button class="btn grow">Читать заказы</button>
    <a class="demo-link" href="?demo=1">Открыть демо без ключей</a></form>`;
}
function errorHtml() {
  return `<div class="empty"><b>Не удалось прочитать заказы</b><p>${esc(LOAD_ERR)}</p><button type="button" class="btn" id="retryBtn">Повторить</button><a class="demo-link" href="?demo=1">Открыть демо</a></div>`;
}

function renderStage() {
  document.body.dataset.mode = MODE;
  document.body.dataset.tab = Q ? "search" : TAB;
  const el = $("stage");
  if (MODE === "gate") { el.innerHTML = gateHtml(); return; }
  if (LOADING) { el.innerHTML = `<div class="skeleton" role="status">Читаем заказы…</div>`; return; }
  if (LOAD_ERR && !ORDERS.length) { el.innerHTML = errorHtml(); return; }
  el.innerHTML = Q ? searchHtml() : TAB === "today" ? todayHtml() : TAB === "fresh" ? freshHtml() : TAB === "ahead" ? aheadHtml() : archiveHtml();
  const key = [TAB, Q, ORDERS.length, Object.keys(DELIV).length, doneCount()].join(":");
  if (TICK !== key && !reduced()) { TICK = key; tickCount(el); }
}
function doneCount() { return buckets().today.done.length; }
function paintChrome() {
  const b = ORDERS.length ? buckets() : {today: {work: [], done: [], cancel: []}, fresh: {send: [], nodate: []}, upcoming: {}, archive: [], fbs: 0};
  const [from, to] = archBounds();
  const counts = {
    today: b.today.work.length + b.today.done.length + b.today.cancel.length,
    fresh: b.fresh.send.length + b.fresh.nodate.length,
    ahead: Object.values(b.upcoming).reduce((s, l) => s + l.length, 0),
    archive: archiveRange(b.archive, from, to).length,
  };
  const names = {today: "Сегодня", fresh: "Новые", ahead: "Впереди", archive: "Архив"};
  $("tabs").innerHTML = Object.entries(names).map(([k, v]) => `<button type="button" role="tab" data-tab="${k}" aria-selected="${!Q && TAB === k}" class="${k === "fresh" && b.fresh.send.length ? "hot" : ""}">${v}${counts[k] ? `<em>${counts[k]}</em>` : ""}</button>`).join("");
  const day = new Date().toLocaleDateString("ru-RU", {weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Moscow"});
  $("dayLine").textContent = day.charAt(0).toUpperCase() + day.slice(1) + (MODE === "demo" ? " · демо" : "");
  $("ribbon").textContent = MODE === "demo"
    ? "Демо · в таблицу и Ozon ничего не отправляется"
    : "Только чтение · правки остаются на экране и не пишутся в таблицу или Ozon";
  paintWho();
}
function paintWho() {
  const point = rashadPoint();
  $("whoSeen").textContent = seenShort(point);
  $("whoAva").classList.toggle("on", online(point));
  const full = document.querySelector("[data-seen-full]");
  if (full) full.textContent = geoSeenText(point, Date.now());
}
function render() { paintChrome(); renderStage(); if (PANEL) renderPanel(); paintMap(false); }

function mapModel() {
  const showRashad = TAB !== "archive" || !!Q;
  if (!Q && TAB === "archive") return {title: "Архив", active: [], done: [], showRashad: false, empty: "Архив без карты: прошлые дни не смешиваются с сегодня."};
  const b = buckets();
  let active = [], done = [];
  const push = (p, into) => { const ll = llOf(p); if (ll && !isAlmalyFbs(p)) into.push({p, ll}); };
  const src = Q ? ORDERS.filter(p => !isAlmalyFbs(p) && matches(p)) : null;
  if (src) src.forEach(p => push(p, orderDay(p, DELIV[p.posting_number]).kind === "done" ? done : active));
  else if (TAB === "today") { b.today.work.forEach(([p]) => push(p, active)); b.today.done.forEach(([p]) => push(p, done)); }
  else if (TAB === "fresh") b.fresh.send.concat(b.fresh.nodate).forEach(([p]) => push(p, active));
  else Object.keys(b.upcoming).sort().forEach(day => b.upcoming[day].forEach(([p]) => push(p, active)));
  const start = rashadTodayLL() || (active[0] && active[0].ll) || [55.76, 37.86];
  active = nearest(active, start);
  const title = Q ? "Найденное" : TAB === "today" ? "Сегодня" : TAB === "fresh" ? "Новые" : "Впереди";
  const empty = active.length || done.length || (showRashad && rashadPoint()) ? "" : "В этом разделе нет точек с координатами.";
  return {title, active, done, showRashad, empty};
}
let MAP_DIRTY = false;
function paintMap(fitNow) {
  if (!MAP || !MAP.isStyleLoaded || !MAP.isStyleLoaded() || !MAP.getSource("route")) { MAP_DIRTY = true; return; }
  MAP_DIRTY = false;
  const model = mapModel();
  const rp = rashadPoint();
  const key = (Q ? "q:" + Q : TAB) + "|" + model.active.map(x => x.p.posting_number).join(",") + "|" + model.done.map(x => x.p.posting_number).join(",") + (rp ? "@" + rp.lat.toFixed(3) + "," + rp.lng.toFixed(3) : "");
  $("mapCap").textContent = model.empty ? model.title : `${model.title} · ${model.active.length + model.done.length}`;
  $("mapShade").hidden = !model.empty;
  if (model.empty) $("mapShade").innerHTML = `<div><b>${esc(model.title)}</b><p>${esc(model.empty)}</p></div>`;
  const link = $("routeLink");
  if (!Q && TAB === "today" && model.active.length) {
    const lls = (rashadTodayLL() ? [rashadTodayLL()] : []).concat(model.active.map(x => x.ll));
    link.hidden = false;
    link.href = "https://yandex.ru/maps/?rtext=" + lls.map(p => p.join(",")).join("~") + "&rtt=auto";
  } else link.hidden = true;
  if (key === MAP_KEY && !fitNow) {
    const lab = document.querySelector(".rpin span");
    if (lab && rp) lab.textContent = seenShort(rp);
    return;
  }
  MAP_KEY = key;
  PINS.forEach(m => m.remove()); PINS = [];
  if (RPIN) { RPIN.remove(); RPIN = null; }
  const add = (el, ll, id) => {
    el.addEventListener("click", ev => { ev.stopPropagation(); jumpTo(id, {fromMap: true}); });
    PINS.push(new maplibregl.Marker({element: el, anchor: "center"}).setLngLat([ll[1], ll[0]]).addTo(MAP));
  };
  model.active.forEach((x, i) => {
    const el = document.createElement("button");
    el.type = "button"; el.className = "pin" + (i === 0 ? " next" : "") + (TAB === "fresh" ? " send" : "");
    el.textContent = String(i + 1); el.style.opacity = "1";
    el.setAttribute("aria-label", (i + 1) + ". " + addrOf(x.p));
    add(el, x.ll, x.p.posting_number);
  });
  model.done.forEach((x, i) => {
    const el = document.createElement("button");
    el.type = "button"; el.className = "pin done"; el.textContent = String(i + 1); el.style.opacity = "1";
    el.setAttribute("aria-label", "Доставлен. " + addrOf(x.p));
    add(el, x.ll, x.p.posting_number);
  });
  if (model.showRashad && rp) {
    const el = document.createElement("div");
    el.className = "rpin" + (online(rp) ? " on" : "");
    el.innerHTML = `<b>Р</b><span>${esc(seenShort(rp))}</span>`;
    RPIN = new maplibregl.Marker({element: el, anchor: "center"}).setLngLat([+rp.lng, +rp.lat]).addTo(MAP);
  }
  const chips = model.active.length ? model.active : model.done;
  $("mapStops").innerHTML = chips.map((x, i) => `<button type="button" data-fly="${esc(x.p.posting_number)}"><b>${i + 1}</b><span>${esc(addrParts(addrOf(x.p))[0])}</span></button>`).join("");
  const trackOn = !Q && TAB === "today";
  const track = trackOn ? todayTrack((RASHAD && RASHAD.track) || [], Date.now()).map(p => [p.lng, p.lat]) : [];
  const tsrc = MAP.getSource("track");
  if (tsrc) tsrc.setData(track.length > 1 ? {type: "Feature", geometry: {type: "LineString", coordinates: track}} : {type: "FeatureCollection", features: []});
  const line = [];
  if (trackOn && rashadTodayLL()) line.push(rashadTodayLL());
  model.active.forEach(x => line.push(x.ll));
  const rkey = line.map(p => p.map(n => n.toFixed(3)).join(",")).join(";");
  if (rkey !== ROUTE_KEY) {
    ROUTE_KEY = rkey;
    if (line.length < 2) paintRoute(MAP, "route", []);
    else drawRoute(line);
  }
  if (fitNow || !USER_MOVED) fitTo(model, rp);
}
function drawRoute(line) {
  const path = line.map(p => `${(+p[1]).toFixed(6)},${(+p[0]).toFixed(6)}`).join(";");
  const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 6000);
  fetch(`https://router.project-osrm.org/route/v1/driving/${path}?overview=full&geometries=geojson`, {signal: ctl.signal})
    .then(r => r.json()).then(j => {
      const g = j && j.routes && j.routes[0] && j.routes[0].geometry;
      paintRoute(MAP, "route", g ? g.coordinates : line.map(p => [p[1], p[0]]));
    }).catch(() => paintRoute(MAP, "route", line.map(p => [p[1], p[0]]))).finally(() => clearTimeout(timer));
}
function fitTo(model, rp) {
  if (!MAP) return;
  const pts = model.active.map(x => x.ll).concat(model.done.map(x => x.ll));
  if (model.showRashad && rp) pts.push([+rp.lat, +rp.lng]);
  const duration = reduced() ? 0 : 700;
  if (!pts.length) return;
  if (pts.length === 1) MAP.flyTo({center: [pts[0][1], pts[0][0]], zoom: 12, duration});
  else {
    const b = new maplibregl.LngLatBounds();
    pts.forEach(p => b.extend([p[1], p[0]]));
    MAP.fitBounds(b, {padding: {top: 80, bottom: 128, left: 40, right: 48}, maxZoom: 13, duration});
  }
}
function mapStyleName() {
  const dark = document.documentElement.dataset.theme ? document.documentElement.dataset.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
  return dark ? "dark" : "positron";
}
function ensureLayers() {
  if (!MAP.getSource("track")) {
    MAP.addSource("track", {type: "geojson", data: {type: "FeatureCollection", features: []}});
    MAP.addLayer({id: "track", type: "line", source: "track", layout: {"line-cap": "round", "line-join": "round"},
      paint: {"line-color": "#93b4ff", "line-width": 3, "line-dasharray": [1.4, 1.6], "line-opacity": .9}});
  }
  if (!MAP.getSource("route")) {
    MAP.addSource("route", {type: "geojson", data: {type: "FeatureCollection", features: []}});
    MAP.addLayer({id: "route-case", type: "line", source: "route", layout: {"line-cap": "round", "line-join": "round"},
      paint: {"line-color": "#ffffff", "line-width": 8, "line-opacity": .95}});
    MAP.addLayer({id: "route", type: "line", source: "route", layout: {"line-cap": "round", "line-join": "round"},
      paint: {"line-color": "#1d4ed8", "line-width": 4.5}});
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
    MAP = new maplibregl.Map({container: "map", style: "https://tiles.openfreemap.org/styles/" + mapStyleName(),
      center: [37.9, 55.78], zoom: 10, attributionControl: true, dragRotate: false, pitchWithRotate: false});
    MAP.addControl(new maplibregl.NavigationControl({showCompass: false}), "bottom-right");
    MAP.on("dragstart", () => { USER_MOVED = true; });
    MAP.on("style.load", () => { ensureLayers(); MAP_KEY = ""; ROUTE_KEY = ""; paintMap(!USER_MOVED); });
    MAP.on("idle", () => { if (MAP_DIRTY) paintMap(false); });
    await new Promise(ok => MAP.once("load", ok));
    ensureLayers();
    paintMap(true);
    document.body.dataset.map = "1";
  })().catch(err => {
    MAP_OK = null;
    $("mapShade").hidden = false;
    $("mapShade").innerHTML = `<div><b>Карта не загрузилась</b><p>${esc(err.message || "")}</p></div>`;
  });
  return MAP_OK;
}
function setMapOpen(on) {
  document.body.classList.toggle("map-open", on);
  $("mapClose").hidden = !on;
  setTimeout(() => {
    if (!MAP) return;
    MAP.resize();
    if (on) { MAP_KEY = ""; USER_MOVED = false; paintMap(true); }
  }, 80);
}

function renderPanel() {
  $("panelTitle").textContent = {courier: "Рашад", pay: "Выплаты", settings: "Настройки"}[PANEL_TAB] || "Рашад";
  $("panelSeg").innerHTML = [["courier", "Рашад"], ["pay", "Выплаты"], ["settings", "Настройки"]].map(([k, v]) =>
    `<button type="button" data-ptab="${k}" aria-pressed="${PANEL_TAB === k}">${v}</button>`).join("");
  $("panelBody").innerHTML = PANEL_TAB === "pay" ? payHtml() : PANEL_TAB === "settings" ? settingsHtml() : courierHtml();
  if (PANEL_TAB === "settings" && $("themeSw")) mountThemeSwitch($("themeSw"));
  paintWho();
}
function courierHtml() {
  const point = rashadPoint(), batt = point && point.battery != null ? Math.round(point.battery * 100) : null;
  const items = ORDERS.filter(p => !isAlmalyFbs(p) && orderTab(p, DELIV[p.posting_number]) === "courier")
    .map(p => ({p, f: flow(p)})).sort((a, b) => b.f.cur - a.f.cur);
  const b = ORDERS.length ? buckets() : null;
  const done = b ? b.today.done.length : 0, work = b ? b.today.work.length : 0;
  return `<div class="who-card"><span class="ava${online(point) ? " on" : ""}">Р</span><div><b>Рашад</b><div data-seen-full>${esc(geoSeenText(point, Date.now()))}</div>${batt != null ? `<small>заряд ${batt}%</small>` : ""}</div></div>
    <div class="stats"><div><b>${work}</b><span>в работе</span></div><div><b>${done}</b><span>доставлено</span></div><div><b>${items.length}</b><span>у него сейчас</span></div></div>
    ${items.map(({p, f}) => `<button type="button" class="jump" data-jump="${esc(p.posting_number)}"><span><b>${esc((DELIV[p.posting_number] || {}).cb || "Без ЦБ")} · ${esc(addrParts(addrOf(p))[0])}</b><small>${esc(f.label)}${f.when ? " · " + esc(f.when) : ""}</small></span></button>`).join("") || `<p class="hint">Сейчас у Рашада нет заказов в работе.</p>`}
    <p class="hint">Точка приходит, пока у него открыто приложение. Склад на карту не ставится.</p>`;
}
function payHtml() {
  if (!PAYS_OK) return `<p class="note">Выплаты не показываем: таблица не ответила или не подключена. Так остаток не перепутать с начисленным.</p>`;
  const rep = deliveryReport(rashadDeliveries(Object.values(DELIV)), PAYS);
  const left = rep.hasPayments ? rep.left : rep.done.pay;
  const today = new Date().toISOString().slice(0, 10);
  const rows = [...rep.payments].reverse().map(p => `<li><div><b>${rub(num(p.amount))}</b><small>${esc(p.date)}${p.comment ? " · " + esc(p.comment) : ""}</small></div><button type="button" class="x" data-unpay="${esc(p.id)}" aria-label="Удалить выплату">✕</button></li>`).join("");
  return `<p class="hint">Запись выплаты останется только на этом экране.</p>
    <div class="sums"><div><span>Начислено</span><b>${sp(rep.done.pay)} ₽</b></div><div><span>Выплачено</span><b>${sp(rep.paid)} ₽</b></div><div class="${left < 0 ? "neg" : "pos"}"><span>${left < 0 ? "Переплата" : "Осталось"}</span><b>${sp(left)} ₽</b></div></div>
    ${rep.active.n ? `<p class="hint">В работе ещё ${esc(plural(rep.active.n, "заказ", "заказа", "заказов"))} на ${rub(rep.active.pay)}.</p>` : ""}
    <form class="form pay" id="payForm"><div class="grid2"><label>Сумма, ₽<input name="amount" inputmode="numeric" required></label><label>Дата<input name="date" type="date" value="${today}"></label></div>
      <label>Комментарий<input name="comment" placeholder="на карту"></label><button class="btn grow">Записать на экране</button></form>
    ${rows ? `<ul class="rows">${rows}</ul>` : `<p class="hint">Выплат пока нет.</p>`}
    ${rep.months.length ? `<details><summary>По месяцам</summary><ul class="rows">${rep.months.map(m => `<li><div><b>${esc(m.label)}</b><small>${esc(plural(m.n, "доставка", "доставки", "доставок"))}</small></div><b>${rub(m.pay)}</b></li>`).join("")}</ul></details>` : ""}`;
}
function settingsHtml() {
  const cid = STORE.get("ozon_cid");
  return `<p class="hint">${MODE === "demo" ? "Сейчас демо: ключи и таблица не используются." : "Ключи лежат только в этом браузере."} Запись в Ozon и в таблицу выключена.</p>
    <div class="seg" id="themeSw"></div>
    ${MODE === "demo" ? `<p><a href="${location.pathname}">Открыть с ключами этого браузера</a></p>` : `<form class="form" id="linkForm"><label>Ссылка доступа к таблице<input name="link" placeholder="Вставьте ссылку с #admin" autocomplete="off"></label><button class="btn">Подключить чтение</button></form>
      <p class="hint">Client-Id: ${cid ? "••••" + esc(String(cid).slice(-4)) : "не сохранён"}</p>
      <button type="button" class="btn ghost" data-forget>Забыть ключи Ozon</button>`}
    <p><button type="button" class="btn ghost" data-csv>${ic("copy")}Скачать CSV</button></p>
    <p class="hint"><a href="index.html">Текущее приложение</a> этот прототип не заменяет.</p>`;
}
function openPanel(tab) {
  PANEL = "open"; PANEL_TAB = tab || PANEL_TAB || "courier";
  $("panel").hidden = false;
  document.body.classList.add("panel-open");
  renderPanel();
  requestAnimationFrame(() => $("panel").classList.add("show"));
}
function closePanel() {
  $("panel").classList.remove("show");
  document.body.classList.remove("panel-open");
  setTimeout(() => { if (!$("panel").classList.contains("show")) { $("panel").hidden = true; PANEL = ""; } }, reduced() ? 0 : 280);
}
function jumpTo(id, opts) {
  const p = ORDERS.find(x => x.posting_number === id);
  if (!p || isAlmalyFbs(p)) { toast("Заказ склада FBS Рашаду не открывается"); return; }
  closePanel();
  if (opts && opts.fromMap && matchMedia("(max-width: 1039px)").matches) setMapOpen(false);
  Q = ""; $("q").value = "";
  TAB = tabOf(p); OPEN = id; EXTRA = null; CONFIRM = null;
  render();
  requestAnimationFrame(() => document.querySelector(`[data-id="${CSS.escape(id)}"]`)?.scrollIntoView({block: "center", behavior: reduced() ? "auto" : "smooth"}));
}
function localNotice(text) { toast(text); }

async function saveSend(form) {
  const id = form.dataset.id, old = form.dataset.old;
  const p = ORDERS.find(x => x.posting_number === id);
  try {
    assertRashadPath(p, null);
    const f = form.elements;
    let foreman = "";
    if (f.foreman.value.trim()) foreman = foremanPhone(f.foreman.value);
    const fields = {
      cb: f.cb.value, date: f.date.value ? f.date.value.split("-").reverse().join(".") : "",
      time: f.time.value.trim(), note: f.note.value.trim(), foreman,
      delivery_pay: f.delivery_pay.value, lift_pay: f.lift_pay.value,
    };
    const oz = ozonLogistics(p, LOGI);
    const dPay = payField(fields.delivery_pay, oz.delivery), lPay = payField(fields.lift_pay, oz.lift);
    const a = ((p.customer || {}).address) || {};
    const phoneDigits = String((p.customer || {}).phone || "").replace(/\D/g, "").replace(/^8(?=\d{10}$)/, "7");
    const row = {
      posting: id, cb: normalizeCb(fields.cb), address: a.address_tail || "",
      lat: a.latitude ? String(a.latitude) : "", lon: a.longitude ? String(a.longitude) : "",
      phone: phoneDigits ? "+" + phoneDigits : "", ext: String(((p.addressee || {}).pin) || "").replace(/\D/g, ""),
      packs: goodsLine(p), unload: unloadText(p.prr_option),
      delivery: String(dPay.value), lift: String(lPay.value), pay: String(dPay.value + lPay.value),
      date: fields.date, status: "Новый",
      comment: deliveryComment({note: fields.note, time: fields.time, foreman: fields.foreman}),
      courier_comment: "", sent: todayRu() + " " + agreedNow().slice(6), delivered_at: "",
    };
    if (!row.cb) throw new Error("Введите номер ЦБ");
    if (!row.address) throw new Error("В заказе нет адреса");
    if (old) {
      const oldP = ORDERS.find(x => x.posting_number === old);
      assertRashadPath(oldP, DELIV[old]);
      if (DELIV[old]) DELIV[old] = Object.assign({}, DELIV[old], {status: "Отменён"});
    }
    DELIV[id] = row;
    EXTRA = null; OPEN = id; TAB = tabOf(p);
    localNotice(old ? "Замена только на экране. Таблица и Рашад не получили пуш." : "Заказ собран для Рашада только на экране. В таблицу не записан.");
    render();
  } catch (err) { toast(err.message || "Не отправилось", true); }
}
async function saveEdit(form) {
  const id = form.dataset.id, old = DELIV[id], p = ORDERS.find(x => x.posting_number === id);
  try {
    assertRashadPath(p, old);
    const v = Object.fromEntries(new FormData(form)), info = deliveryDetails(old.comment);
    let ozonInfo = info.ozon ? Object.assign({}, info.ozon) : null;
    const name = String(v.name || "").trim();
    if (name && name !== String((p.customer || {}).name || "")) ozonInfo = Object.assign({}, ozonInfo, {customer: name});
    const dPay = payField(v.delivery, form.elements.delivery.dataset.oz), lPay = payField(v.lift, form.elements.lift.dataset.oz);
    const phoneDigits = String(v.phone || "").replace(/\D/g, "").replace(/^8(?=\d{10}$)/, "7");
    const next = {
      cb: normalizeCb(v.cb), address: String(v.address || "").trim(),
      date: v.date ? v.date.split("-").reverse().join(".") : "",
      phone: phoneDigits ? "+" + phoneDigits : "", ext: String(v.ext || "").replace(/\D/g, ""),
      packs: String(v.packs || "").trim(), unload: String(v.unload || "").trim() || "Нет",
      delivery: String(dPay.value), lift: String(lPay.value),
      comment: deliveryComment({note: v.note, time: v.time, foreman: v.foreman, agreed: info.agreed, ozon: ozonInfo}),
    };
    if (!next.address) throw new Error("Укажите адрес");
    const patch = editPatch(old, next);
    if (patch.address) {
      const g = await geocode(next.address).catch(() => null);
      if (g && g.lat) { patch.lat = g.lat; patch.lon = g.lon; }
      else toast("Адрес изменён на экране, точку на карте найти не удалось", true);
    }
    const row = Object.assign({}, old, patch);
    if (patch.delivery !== undefined || patch.lift !== undefined) row.pay = String(num(row.delivery) + num(row.lift));
    DELIV[id] = row;
    EXTRA = null;
    localNotice(Object.keys(patch).length ? "Изменения только на этом экране. Таблица не менялась." : "Менять нечего");
    render();
  } catch (err) { toast(err.message || "Не сохранилось", true); }
}
async function geocode(address) {
  const r = await fetch("https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=ru&q=" + encodeURIComponent(address), {headers: {"Accept-Language": "ru"}});
  const [hit] = await r.json();
  return hit ? {lat: (+hit.lat).toFixed(6), lon: (+hit.lon).toFixed(6)} : null;
}
function localDelivered(id) {
  const p = ORDERS.find(x => x.posting_number === id), d = DELIV[id];
  assertRashadPath(p, d);
  DELIV[id] = Object.assign({}, d, {status: "Доставлен", delivered_at: todayRu() + " " + agreedNow().slice(6)});
}
function localCancel(id) {
  const d = DELIV[id], p = ORDERS.find(x => x.posting_number === id);
  assertRashadPath(p, d);
  DELIV[id] = Object.assign({}, d, {status: "Отменён"});
}
function localRestore(id) {
  const d = DELIV[id], p = ORDERS.find(x => x.posting_number === id);
  assertRashadPath(p, d);
  DELIV[id] = Object.assign({}, d, {status: "Новый"});
}
function exportCsv() {
  const rows = [["отправление", "цб", "статус", "дата", "адрес", "телефон", "груз", "кг"]];
  ORDERS.forEach(p => {
    if (isAlmalyFbs(p)) return;
    const d = DELIV[p.posting_number] || {};
    rows.push([p.posting_number, d.cb || "", flow(p).label, d.date || "", addrOf(p), phoneOf(p).phone, goodsLine(p), orderKg(p)]);
  });
  const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(";")).join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob(["\uFEFF" + csv], {type: "text/csv;charset=utf-8"}));
  a.download = "almaly-prototype.csv";
  a.click();
}
function takeHash() {
  const q = location.hash.replace(/^#/, "");
  if (!q) return;
  const h = new URLSearchParams(q.replace(/\+/g, "%2B"));
  if (h.get("admin")) {
    STORE.set("dlv_admin", h.get("admin"));
    history.replaceState(null, "", location.pathname + location.search);
  }
}
function busyUi() {
  return !!(EXTRA || CONFIRM || PANEL || (document.activeElement && document.activeElement.matches && document.activeElement.matches("input, textarea, select")));
}
function onAct(el) {
  const act = el.dataset.act, id = el.dataset.id;
  if (act === "toggle") {
    OPEN = OPEN === id ? "" : id;
    if (OPEN !== id) { EXTRA = null; CONFIRM = null; }
    renderStage();
    if (OPEN) document.querySelector(`[data-id="${CSS.escape(id)}"]`)?.scrollIntoView({block: "nearest", behavior: reduced() ? "auto" : "smooth"});
    return;
  }
  if (act === "go") {
    TAB = el.dataset.tab; Q = ""; $("q").value = ""; OPEN = ""; EXTRA = null; CONFIRM = null; USER_MOVED = false; MAP_KEY = "";
    render();
    if (el.dataset.focus === "late") document.querySelector(".card.late")?.scrollIntoView({block: "center"});
    return;
  }
  if (act === "arch") { ARCH = el.dataset.arch; renderStage(); paintChrome(); return; }
  if (act === "send") {
    const p = ORDERS.find(x => x.posting_number === id);
    if (!canSend(p)) { toast("Этот заказ нельзя отправить Рашаду", true); return; }
    OPEN = id; EXTRA = {type: "send", posting: id, old: ""}; CONFIRM = null; TAB = tabOf(p);
    render();
    document.querySelector("form.send [name=cb]")?.focus();
    return;
  }
  if (act === "pick") {
    const p = ORDERS.find(x => x.posting_number === id);
    if (!canSend(p)) { toast("FBS и уже отправленные заказы Рашаду не уходят", true); return; }
    TAB = tabOf(p); OPEN = id; EXTRA = {type: "send", posting: id, old: el.dataset.old}; CONFIRM = null;
    render();
    return;
  }
  if (act === "replace") { OPEN = id; EXTRA = {type: "replace", posting: id}; CONFIRM = null; renderStage(); return; }
  if (act === "edit") { OPEN = id; EXTRA = {type: "edit", posting: id}; CONFIRM = null; renderStage(); return; }
  if (act === "close-extra") { EXTRA = null; renderStage(); return; }
  if (act === "remind") { localNotice("Напоминание Рашаду не ушло: прототип не шлёт пуши и не пишет в таблицу."); return; }
  if (act === "ask-done") { CONFIRM = {posting: id, kind: "done"}; OPEN = id; renderStage(); return; }
  if (act === "ask-cancel") { CONFIRM = {posting: id, kind: "cancel"}; OPEN = id; renderStage(); return; }
  if (act === "confirm-no") { CONFIRM = null; renderStage(); return; }
  if (act === "confirm-yes") {
    try {
      if (CONFIRM && CONFIRM.kind === "cancel") localCancel(id);
      else localDelivered(id);
      CONFIRM = null; EXTRA = null;
      localNotice("Статус изменён только на этом экране.");
      render();
    } catch (err) { toast(err.message, true); }
    return;
  }
  if (act === "restore") {
    try { localRestore(id); localNotice("Заказ снова в работе только на этом экране."); render(); }
    catch (err) { toast(err.message, true); }
    return;
  }
  if (act === "copy") {
    const text = id;
    const done = () => toast("Номер скопирован");
    if (navigator.clipboard) navigator.clipboard.writeText(text).then(done, done);
    else done();
    return;
  }
  if (act === "fly") {
    const p = ORDERS.find(x => x.posting_number === id), ll = p && llOf(p);
    setMapOpen(true);
    bootMap().then(() => { if (ll && MAP) MAP.flyTo({center: [ll[1], ll[0]], zoom: 14, duration: reduced() ? 0 : 600}); });
  }
}

$("tabs").addEventListener("click", ev => {
  const b = ev.target.closest("[data-tab]");
  if (!b) return;
  TAB = b.dataset.tab; Q = ""; $("q").value = ""; OPEN = ""; EXTRA = null; CONFIRM = null; USER_MOVED = false; MAP_KEY = "";
  render();
});
$("q").addEventListener("input", () => { Q = $("q").value.trim().toLowerCase(); OPEN = ""; renderStage(); paintMap(true); });
$("searchForm").addEventListener("submit", ev => ev.preventDefault());
$("stage").addEventListener("click", ev => {
  const slot = ev.target.closest("[data-slot]");
  if (slot) {
    const form = slot.closest("form");
    form.elements.time.value = slot.dataset.slot;
    form.querySelectorAll("[data-slot]").forEach(b => b.setAttribute("aria-pressed", b === slot ? "true" : "false"));
    return;
  }
  const day = ev.target.closest("[data-day]");
  if (day) {
    const form = day.closest("form");
    const on = day.getAttribute("aria-pressed") !== "true";
    form.elements.date.value = on ? day.dataset.day : "";
    form.querySelectorAll("[data-day]").forEach(b => b.setAttribute("aria-pressed", on && b === day ? "true" : "false"));
    return;
  }
  if (ev.target.id === "retryBtn") { bootLive(); return; }
  const act = ev.target.closest("[data-act]");
  if (act) onAct(act);
});
$("stage").addEventListener("keydown", ev => {
  if (ev.key !== "Enter" && ev.key !== " ") return;
  if (ev.target.classList && ev.target.classList.contains("card-hit")) { ev.preventDefault(); onAct(ev.target); }
});
$("stage").addEventListener("toggle", ev => { if (ev.target.id === "cancelBox") CANCEL_OPEN = ev.target.open; }, true);
$("stage").addEventListener("change", ev => {
  if (ev.target.id === "archDay" && ev.target.value) { ARCH = "day"; ARCH_DAY = ev.target.value; renderStage(); paintChrome(); }
});
$("stage").addEventListener("input", ev => {
  const form = ev.target.closest && ev.target.closest("form");
  if (!form || !form.querySelector("[data-sum]")) return;
  const d = form.elements.delivery || form.elements.delivery_pay;
  const l = form.elements.lift || form.elements.lift_pay;
  if (!d || !l) return;
  const ozD = Number(d.dataset.oz) || 0, ozL = Number(l.dataset.oz) || 0;
  const sum = payField(d.value, ozD).value + payField(l.value, ozL).value;
  form.querySelectorAll("[data-sum]").forEach(n => { n.textContent = rub(sum); });
});
document.addEventListener("submit", ev => {
  const form = ev.target;
  if (!(form instanceof HTMLFormElement)) return;
  if (form.classList.contains("send")) { ev.preventDefault(); saveSend(form); }
  else if (form.classList.contains("edit")) { ev.preventDefault(); saveEdit(form); }
  else if (form.dataset.repl) {
    ev.preventDefault();
    const num = form.elements.num.value.trim();
    const p = ORDERS.find(x => x.posting_number === num);
    if (!p) { toast("Такого отправления нет в списке", true); return; }
    if (!canSend(p)) { toast("Этот заказ нельзя отправить Рашаду", true); return; }
    onAct({dataset: {act: "pick", id: p.posting_number, old: form.dataset.repl}});
  } else if (form.id === "keysForm" || form.id === "keysForm2") {
    ev.preventDefault();
    STORE.set("ozon_cid", form.elements.cid.value.trim());
    STORE.set("ozon_key", form.elements.key.value.trim());
    form.elements.key.value = "";
    bootLive();
  } else if (form.id === "linkForm") {
    ev.preventDefault();
    const raw = form.elements.link.value;
    const h = new URLSearchParams(String(raw).replace(/^.*?#/, "").replace(/\+/g, "%2B"));
    if (!h.get("admin")) { toast("Нужна ссылка доступа целиком", true); return; }
    STORE.set("dlv_admin", h.get("admin"));
    form.elements.link.value = "";
    toast("Таблица подключена для чтения");
    if (MODE === "live") bootLive();
  } else if (form.id === "payForm") {
    ev.preventDefault();
    if (!PAYS_OK) return;
    const amount = form.elements.amount.value.trim();
    if (!num(amount)) { toast("Введите сумму", true); return; }
    const date = form.elements.date.value ? form.elements.date.value.split("-").reverse().join(".") : todayRu();
    PAYS = (PAYS || []).concat([{id: "local-" + Date.now(), amount, date, comment: form.elements.comment.value.trim()}]);
    localNotice("Выплата записана только на этом экране.");
    renderPanel();
  }
});
$("whoBtn").addEventListener("click", () => openPanel("courier"));
$("panel").addEventListener("click", ev => {
  if (ev.target.closest("[data-panel-close]")) { closePanel(); return; }
  const tab = ev.target.closest("[data-ptab]");
  if (tab) { PANEL_TAB = tab.dataset.ptab; renderPanel(); return; }
  const jump = ev.target.closest("[data-jump]");
  if (jump) { jumpTo(jump.dataset.jump); return; }
  const unpay = ev.target.closest("[data-unpay]");
  if (unpay) {
    if (unpay.dataset.sure !== "1") { unpay.dataset.sure = "1"; unpay.textContent = "да"; return; }
    PAYS = PAYS.filter(p => p.id !== unpay.dataset.unpay);
    localNotice("Выплата убрана только на этом экране.");
    renderPanel();
    return;
  }
  if (ev.target.closest("[data-forget]")) {
    STORE.del("ozon_cid"); STORE.del("ozon_key");
    closePanel(); MODE = "gate"; ORDERS = []; DELIV = {};
    render();
    return;
  }
  if (ev.target.closest("[data-csv]")) exportCsv();
});
$("reloadBtn").addEventListener("click", async () => {
  const b = $("reloadBtn");
  b.classList.add("spin");
  try {
    if (MODE === "demo") { buildDemo(); OPEN = ""; EXTRA = null; localNotice("Демо собрано заново, сеть не вызывалась"); render(); }
    else await reloadLive();
  } catch (err) { toast(err.message || "Не прочиталось", true); }
  finally { b.classList.remove("spin"); }
});
$("mapBtn").addEventListener("click", () => { setMapOpen(true); bootMap().then(() => MAP && MAP.resize()); });
$("mapClose").addEventListener("click", () => setMapOpen(false));
$("fitBtn").addEventListener("click", () => { USER_MOVED = false; MAP_KEY = ""; paintMap(true); });
$("rashadBtn").addEventListener("click", () => {
  const ll = rashadTodayLL() || (rashadPoint() && [+rashadPoint().lat, +rashadPoint().lng]);
  if (ll && MAP) { USER_MOVED = true; MAP.flyTo({center: [ll[1], ll[0]], zoom: 13, duration: reduced() ? 0 : 600}); }
  else toast("Рашад ещё не передавал точку");
});
$("mapStops").addEventListener("click", ev => {
  const b = ev.target.closest("[data-fly]");
  if (!b) return;
  const p = ORDERS.find(x => x.posting_number === b.dataset.fly);
  const ll = p && llOf(p);
  if (ll && MAP) { USER_MOVED = true; MAP.flyTo({center: [ll[1], ll[0]], zoom: 14, duration: reduced() ? 0 : 500}); }
});
addEventListener("keydown", ev => {
  if (ev.key !== "Escape") return;
  if (PANEL) closePanel();
  else if (document.body.classList.contains("map-open")) setMapOpen(false);
  else if (OPEN) { OPEN = ""; EXTRA = null; CONFIRM = null; renderStage(); }
});
let styleNow = mapStyleName();
new MutationObserver(() => {
  const next = mapStyleName();
  if (next !== styleNow && MAP) { styleNow = next; USER_MOVED = true; MAP.setStyle("https://tiles.openfreemap.org/styles/" + next); }
}).observe(document.documentElement, {attributes: true, attributeFilter: ["data-theme"]});
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
  if (!document.documentElement.dataset.theme) {
    const next = mapStyleName();
    if (next !== styleNow && MAP) { styleNow = next; MAP.setStyle("https://tiles.openfreemap.org/styles/" + next); }
  }
});

async function bootLive() {
  MODE = "live"; LOADING = true; LOAD_ERR = ""; OPEN = ""; EXTRA = null;
  render();
  try {
    await loadLive();
    LOADING = false;
    render();
    bootMap();
    fillLogistics().then(() => { if (!busyUi()) render(); });
  } catch (err) {
    LOADING = false; LOAD_ERR = err.message || "Не удалось прочитать заказы"; ORDERS = [];
    render();
  }
}
async function reloadLive() {
  await loadLive();
  await fillLogistics();
  localNotice("Прочитано заново. Правки, которые были только на экране, сброшены.");
  render();
}
function startTimers() {
  setInterval(paintWho, 30000);
  if (DEMO) return;
  setInterval(() => { if (!document.hidden && !busyUi() && MODE === "live" && ORDERS.length) reloadLive().catch(() => {}); }, 120000);
  setInterval(() => {
    if (document.hidden || MODE !== "live" || !STORE.get("dlv_admin")) return;
    sheetApi({action: "where", key: STORE.get("dlv_admin")}).then(r => { RASHAD = r; paintWho(); paintMap(false); }).catch(() => {});
  }, 45000);
}
function boot() {
  if (DEMO) {
    try { buildDemo(); }
    catch (err) { LOAD_ERR = err.message; $("stage").innerHTML = errorHtml(); return; }
    MODE = "demo";
    render();
    bootMap();
    document.body.dataset.ready = "demo";
    startTimers();
    return;
  }
  takeHash();
  if (!STORE.get("ozon_cid") || !STORE.get("ozon_key")) { MODE = "gate"; render(); document.body.dataset.ready = "gate"; return; }
  bootLive().then(() => { document.body.dataset.ready = "live"; startTimers(); });
}
boot();
