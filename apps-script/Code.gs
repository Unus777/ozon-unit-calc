// Правила статуса для веб-приложения таблицы «Заказы озон».
// В развёрнутом проекте Apps Script замените место, где сохранение даты
// само ставит статус «Согласован», на applyDeliveryPatch. Дата и согласие разделены:
// «Согласован» приходит только явной кнопкой курьера (поле status в запросе).
// «Отменён» допустим: страница менеджера пишет его, когда Ozon отменил заказ.
//
// После правки заново опубликуйте ту же веб-приложение:
// Развернуть → Управление развёртываниями → карандаш у текущего развёртывания →
// Версия: «Новая версия» → Развернуть. Адрес (URL) не меняется, SCRIPT_URL трогать не нужно.

var COURIER_FIELDS = ["date", "status", "courier_comment"];
var DELIVERY_STATUSES = ["Новый", "Согласован", "Доставлен", "Отменён"];

function applyDeliveryPatch(row, data, courier) {
  var next = {};
  var key;
  for (key in (row || {})) if (Object.prototype.hasOwnProperty.call(row, key)) next[key] = row[key];
  var keys = courier ? COURIER_FIELDS : Object.keys(data || {});
  for (var i = 0; i < keys.length; i++) {
    key = keys[i];
    if (!data || !Object.prototype.hasOwnProperty.call(data, key)) continue;
    if (key === "status" && DELIVERY_STATUSES.indexOf(data.status) < 0) throw new Error("Неизвестный статус: " + data.status);
    next[key] = data[key];
  }
  return next;
}

// Пульс курьера. Действие ping пишет только эту точку (лист «Курьер_гео»), where отдаёт её менеджеру.
// Не добавляйте ping в общие поля доставки и не расширяйте COURIER_FIELDS: курьер не должен менять заказ этим запросом.
var GEO_SHEET = "Курьер_гео";
var GEO_KEEP = 50;

function normalizeHeartbeat(data, now) {
  var src = data || {}, ts = Number(src.ts) || now || Date.now(), point = {ts: ts};
  var lat = Number(src.lat), lng = Number(src.lng);
  if (isFinite(lat) && isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
    point.lat = Math.round(lat * 1e6) / 1e6;
    point.lng = Math.round(lng * 1e6) / 1e6;
    var acc = Number(src.acc);
    if (isFinite(acc) && acc >= 0) point.acc = Math.round(acc);
  }
  var battery = Number(src.battery);
  if (src.battery != null && src.battery !== "" && isFinite(battery)) point.battery = Math.max(0, Math.min(1, battery));
  return point;
}
function appendGeo(rows, point) {
  var next = (rows || []).concat([point]);
  return next.slice(Math.max(0, next.length - GEO_KEEP));
}
function recordHeartbeat(rows, data, now) {
  return appendGeo(rows, normalizeHeartbeat(data, now || Date.now()));
}
function geoSheet_() {
  if (typeof SpreadsheetApp === "undefined") return null;
  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName(GEO_SHEET);
  if (!sh) {
    sh = ss.insertSheet(GEO_SHEET);
    sh.appendRow(["ts", "lat", "lng", "acc", "battery"]);
  }
  return sh;
}
function readGeoRows_() {
  var sh = geoSheet_();
  if (!sh || sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, 5).getValues().map(function (r) {
    var point = {ts: Number(r[0])};
    if (r[1] !== "" && r[2] !== "") { point.lat = Number(r[1]); point.lng = Number(r[2]); }
    if (r[3] !== "") point.acc = Number(r[3]);
    if (r[4] !== "") point.battery = Number(r[4]);
    return point;
  }).filter(function (p) { return p.ts; });
}
function writeGeoRows_(rows) {
  var sh = geoSheet_();
  if (!sh) return;
  if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, 5).clearContent();
  if (!rows.length) return;
  sh.getRange(2, 1, rows.length, 5).setValues(rows.map(function (p) {
    return [p.ts, p.lat != null ? p.lat : "", p.lng != null ? p.lng : "", p.acc != null ? p.acc : "", p.battery != null ? p.battery : ""];
  }));
}
// case "ping": только после ключа курьера. case "where": только после ключа менеджера.
function actionPing(data) {
  var rows = recordHeartbeat(readGeoRows_(), data, Date.now());
  writeGeoRows_(rows);
  return rows[rows.length - 1];
}
function actionWhere() {
  var rows = readGeoRows_();
  return {latest: rows.length ? rows[rows.length - 1] : null, track: rows.filter(function (p) { return p.lat != null; }).slice(-GEO_KEEP)};
}

// Возвраты (23.11.2026): отдельная строка листа «Доставки» с номером «<отправление>-R», статусы те же
// («Новый» → «Согласован» = клиент предупреждён → «Доставлен» = возврат забран). Признак и пометка — строка
// «Возврат: {...}» в «Комментарии»; цену курьер пишет в «Комментарий курьера» («Цена возврата: N»), менеджер
// принимает её в «Доставка, ₽» — тогда она идёт в выплаты. Новых столбцов и правок скрипта не нужно:
// create/update/remind работают как есть. В Ozon возврат ничего не отмечает.
