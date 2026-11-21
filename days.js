// Экран менеджера: раскладка заказов по дням (время московское) и расчёт по каждому заказу.
// Чистые функции без DOM — их проверяет test-days.cjs. Нужны config.js (mskDay, num), fbs.js (orderTab, isAlmalyFbs), calc.js (calc).
const SHIP_STATUSES = ["awaiting_registration", "acceptance_in_progress", "awaiting_approve", "awaiting_packaging", "awaiting_deliver",
  "not_accepted", "delivering", "driver_pickup", "sent_by_seller"];

// «21.11.2026» или «21.11.2026 09:40» → «2026-11-21»; пусто, если даты нет
function dayIso(value) {
  const m = /(\d{2})\.(\d{2})\.(\d{4})/.exec(String(value || ""));
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || "")) ? String(value) : "";
}
function isoToRu(iso) { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || "")); return m ? `${m[3]}.${m[2]}.${m[1]}` : ""; }
function addDaysIso(iso, n) {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
const tsDay = ts => { const d = new Date(ts); return ts && !isNaN(d) ? mskDay(d.getTime()) : ""; };

// К какому дню и какому разделу относится заказ.
// kind: work — у Рашада, done — доставлен, cancel — отменён, new — ещё не отправлен, fbs — склад (Рашаду не уходит)
function orderDay(p, row) {
  const tab = orderTab(p, row);
  if (tab === "fbs") return {kind: "fbs", day: ""};
  if (tab === "cancel") return {kind: "cancel", day: dayIso(row && row.date) || tsDay(p && p.in_process_at)};
  if (tab === "done") return {kind: "done", day: dayIso(row && row.delivered_at) || dayIso(row && row.date) || tsDay(p && p.in_process_at)};
  if (tab === "new") return {kind: SHIP_STATUSES.includes(p.status) ? "new" : "other", day: tsDay(p.in_process_at)};
  return {kind: "work", day: dayIso(row && row.date)};
}

// Разделы экрана: «Сегодня» (в работе / доставлено / отменено), «Новые» (отправить / без даты), «Впереди» по датам, «Архив».
// items — [[posting, index], …]; deliv — строки листа по номеру отправления; today — «2026-11-21» по Москве.
function dayBuckets(items, deliv, today) {
  const out = {today: {work: [], done: [], cancel: []}, fresh: {send: [], nodate: []}, upcoming: {}, archive: [], fbs: 0};
  for (const it of items) {
    const [p] = it, row = deliv[p.posting_number], o = orderDay(p, row);
    const x = [p, it[1], o];
    if (o.kind === "fbs") out.fbs++;
    else if (o.kind === "new") out.fresh.send.push(x);
    else if (o.kind === "other") out.archive.push(x);
    else if (o.kind === "work") {
      if (!o.day) out.fresh.nodate.push(x);
      else if (o.day <= today) { x[2] = Object.assign({}, o, {late: o.day < today}); out.today.work.push(x); }
      else (out.upcoming[o.day] = out.upcoming[o.day] || []).push(x);
    } else if (o.day >= today) out.today[o.kind].push(x);
    else out.archive.push(x);
  }
  return out;
}

// Архив за период: from/to — «гггг-мм-дд» включительно (пусто — без границы)
function archiveRange(list, from, to) {
  return list.filter(([, , o]) => (!from || o.day >= from) && (!to || o.day <= to))
    .sort((a, b) => (b[2].day || "").localeCompare(a[2].day || ""));
}

// Доставка и подъём, которые оплатил клиент, по данным Ozon: delivery_price и prr_option.price отправления
// (/v3/posting/fbs/get; в списке /v4/posting/fbs/list их может не быть — тогда берём из кэша, заполненного запросом get).
function ozonLogistics(p, cache) {
  const prr = (p && p.prr_option) || {};
  const own = {delivery: parseFloat(p && p.delivery_price) || 0, lift: prr.code && prr.code !== "none" ? parseFloat(prr.price) || 0 : 0};
  const c = cache && p && cache[p.posting_number];
  const hasOwn = p && p.delivery_price != null && String(p.delivery_price) !== "";
  if (!hasOwn && c) return {delivery: Number(c.delivery) || 0, lift: own.lift || Number(c.lift) || 0, known: true};
  return Object.assign(own, {known: hasOwn || !!prr.code});
}
// Оплата Рашаду: вписанное вручную (> 0) всегда главнее; пусто или 0 — берём из Ozon и помечаем auto
function courierPay(row, oz) {
  const d = num(row && row.delivery), l = num(row && row.lift);
  return {delivery: d > 0 ? d : oz.delivery, lift: l > 0 ? l : oz.lift,
    deliveryAuto: !(d > 0) && oz.delivery > 0, liftAuto: !(l > 0) && oz.lift > 0};
}
// Деньги заказа: товар из Ozon, доставка и подъём клиента, оплата Рашаду, экономика товара и итоговая прибыль.
function orderMoney(p, row, prices, cache) {
  const goods = (p.products || []).reduce((s, x) => s + (parseFloat(x.price && x.price.amount != null ? x.price.amount : x.price) || 0) * (Number(x.quantity) || 0), 0);
  const oz = ozonLogistics(p, cache);
  const pay = courierPay(row, oz);
  const courier = pay.delivery + pay.lift;
  let t = null;
  try { t = calc(p, prices || {}, 0, 0)[1]; } catch { t = null; }
  const goodsProfit = t ? t.profit : null;
  const profit = t ? goodsProfit + oz.delivery + oz.lift - courier : null;
  return {goods, clientDelivery: oz.delivery, clientLift: oz.lift, client: goods + oz.delivery + oz.lift, ozKnown: oz.known,
    courierDelivery: pay.delivery, courierLift: pay.lift, courier, deliveryAuto: pay.deliveryAuto, liftAuto: pay.liftAuto,
    auto: pay.deliveryAuto || pay.liftAuto, planned: !row, t, goodsProfit, profit, perM2: t ? t.payout_m2 : null, floor: t ? t.floor : null,
    level: t ? t.status[0] : ""};
}
// Строки у Рашада (ещё в работе), где доставка или подъём не вписаны, а в Ozon сумма есть: что дописать в лист.
// keep — отправления, где менеджер сам поставил 0: их не трогаем.
function ozonPayFill(p, row, cache, keep) {
  if (!p || !row || isAlmalyFbs(p) || isFbsSheetRow(row) || (keep && keep[p.posting_number])) return null;
  if (row.status !== "Новый" && row.status !== "Согласован") return null;
  const pay = courierPay(row, ozonLogistics(p, cache));
  if (!pay.deliveryAuto && !pay.liftAuto) return null;
  const out = {};
  if (pay.deliveryAuto) out.delivery = String(pay.delivery);
  if (pay.liftAuto) out.lift = String(pay.lift);
  return out;
}
// Поле формы: пусто → значение из Ozon; число (в т. ч. 0) → как вписано
function payField(raw, ozValue) {
  const v = String(raw == null ? "" : raw).trim();
  if (v === "" || isNaN(Number(v.replace(/\s/g, "")))) return {value: Number(ozValue) || 0, auto: true};
  return {value: Number(v.replace(/\s/g, "")), auto: false};
}
function sumMoney(list, deliv, prices, cache) {
  const s = {n: 0, goods: 0, courier: 0, profit: 0, profitKnown: true};
  for (const [p] of list) {
    const m = orderMoney(p, deliv[p.posting_number], prices, cache);
    s.n++; s.goods += m.goods; s.courier += m.courier;
    if (m.profit == null) s.profitKnown = false; else s.profit += m.profit;
  }
  return s;
}

// Что поменял менеджер в карточке заказа: только изменённые поля листа «Доставки»
const EDIT_KEYS = ["cb", "address", "date", "phone", "ext", "packs", "unload", "delivery", "lift", "comment", "lat", "lon"];
function editPatch(row, next) {
  const patch = {};
  for (const k of EDIT_KEYS) {
    if (next[k] === undefined) continue;
    const a = String(row && row[k] != null ? row[k] : "").replace(/^'/, "").trim(), b = String(next[k]).trim();
    if (a !== b) patch[k] = b;
  }
  return patch;
}

if (typeof module !== "undefined") module.exports = {dayIso, isoToRu, addDaysIso, orderDay, dayBuckets, archiveRange, ozonLogistics, courierPay, orderMoney, ozonPayFill, payField, sumMoney, editPatch};

// Значки для новых кнопок карточки (остальные — в config.js)
if (typeof ICONS !== "undefined") Object.assign(ICONS, {
  swap: "M4 7h15l-3-3M19 7l-3 3M20 17H5l3 3M5 17l3-3",
  undo: "M9 14 4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11",
  ban: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM5.6 5.6l12.8 12.8",
});
