/**
 * OzonWatch.gs — сигнал «новый заказ Ozon» → макс агент (вебхук).
 *
 * Отдельный файл для того же проекта Apps Script, что и Code.gs (таблица «Заказы озон»).
 * Code.gs НЕ меняется. Все глобальные имена здесь начинаются с OW_ / ozonWatch.
 *
 * Что делает: каждые 5 минут (триггер по времени, без открытой вкладки менеджера)
 * ТОЛЬКО ЧИТАЕТ POST https://api-seller.ozon.ru/v4/posting/fbs/list за последние 14 дней
 * по статусам awaiting_registration, acceptance_in_progress, awaiting_approve,
 * awaiting_packaging, awaiting_deliver, not_accepted. Для новых номеров отправлений
 * шлёт ОДИН POST на MAXBOT_WEBHOOK_URL:
 *   {"posting_numbers":["…","…"],"posting_number":"<первый>"}
 * В сигнал кладутся только номера отправлений, никаких сумм. В Ozon ничего не пишется.
 * Номер считается «увиденным» только после ответа 2xx; при ошибке повтор на следующем тике.
 *
 * Свойства скрипта (Настройки проекта → Свойства скрипта):
 *   OZON_CLIENT_ID             — Client-Id Seller API
 *   OZON_API_KEY               — Api-Key Seller API (достаточно ключа только на чтение)
 *   MAXBOT_WEBHOOK_URL         — ссылка приёмника сигналов макс агента
 *   MAXBOT_WEBHOOK_KEY         — ключ отправителя (может быть пустым)
 *   MAXBOT_WEBHOOK_KEY_HEADER  — НЕОБЯЗАТЕЛЬНО. Как передаётся ключ:
 *       не задано  → два заголовка: «Authorization: Bearer <ключ>» и «X-Webhook-Key: <ключ>»
 *       задано     → только этот один заголовок с «сырым» ключом, напр.
 *                    MAXBOT_WEBHOOK_KEY_HEADER = X-Api-Key  →  «X-Api-Key: <ключ>»
 *   Тело всегда JSON (Content-Type: application/json).
 *
 * Служебные свойства (создаются сами): OW_SEEDED, OW_SEEN_N, OW_SEEN_0..N-1.
 *
 * Запуск: один раз ozonWatchInstall() (запомнит текущие заказы БЕЗ отправки и создаст
 * триггер), затем ozonWatchTest() — проверка вебхука. Выключить: ozonWatchUninstall().
 */

var OW_OZON_URL = "https://api-seller.ozon.ru/v4/posting/fbs/list";
var OW_STATUSES = ["awaiting_registration", "acceptance_in_progress", "awaiting_approve",
                   "awaiting_packaging", "awaiting_deliver", "not_accepted"];
var OW_WINDOW_DAYS = 14;     // окно выборки Ozon
var OW_KEEP_DAYS = 30;       // сколько дней помнить увиденные номера
var OW_PAGE_LIMIT = 100;     // максимум Ozon для v4
var OW_MAX_PAGES = 50;       // защита от бесконечной пагинации
var OW_CHUNK = 8000;         // длина одного свойства (лимит Google ~9 КБ на значение)
var OW_TICK_FN = "ozonWatchTick";
var OW_DAY_MS = 86400000;

function OW_props_() { return PropertiesService.getScriptProperties(); }

function OW_cfg_() {
  var p = OW_props_();
  return {
    clientId: String(p.getProperty("OZON_CLIENT_ID") || "").trim(),
    apiKey: String(p.getProperty("OZON_API_KEY") || "").trim(),
    url: String(p.getProperty("MAXBOT_WEBHOOK_URL") || "").trim(),
    key: String(p.getProperty("MAXBOT_WEBHOOK_KEY") || "").trim(),
    keyHeader: String(p.getProperty("MAXBOT_WEBHOOK_KEY_HEADER") || "").trim()
  };
}

/* ---------- Ozon (только чтение) ---------- */

/** Возвращает массив номеров отправлений или бросает ошибку. */
function OW_fetchPostings_(cfg, nowMs) {
  if (!cfg.clientId || !cfg.apiKey) throw new Error("OzonWatch: не заданы OZON_CLIENT_ID / OZON_API_KEY");
  var to = new Date(nowMs + OW_DAY_MS).toISOString();          // +1 день на расхождение часов
  var since = new Date(nowMs - OW_WINDOW_DAYS * OW_DAY_MS).toISOString();
  var out = [], seen = {}, cursor = "";
  for (var page = 0; page < OW_MAX_PAGES; page++) {
    var body = {
      filter: { since: since, to: to, statuses: OW_STATUSES },
      limit: OW_PAGE_LIMIT,
      sort_dir: "asc"
    };
    if (cursor) body.cursor = cursor;
    var res = UrlFetchApp.fetch(OW_OZON_URL, {
      method: "post",
      contentType: "application/json",
      headers: { "Client-Id": cfg.clientId, "Api-Key": cfg.apiKey },
      payload: JSON.stringify(body),
      muteHttpExceptions: true
    });
    var code = res.getResponseCode();
    if (code < 200 || code >= 300) {
      throw new Error("OzonWatch: Ozon HTTP " + code + " " + String(res.getContentText()).slice(0, 300));
    }
    var data = JSON.parse(res.getContentText() || "{}");
    var list = data.postings || (data.result && data.result.postings) || [];
    for (var i = 0; i < list.length; i++) {
      var n = list[i] && list[i].posting_number;
      if (n && !seen[n]) { seen[n] = 1; out.push(String(n)); }
    }
    cursor = data.cursor || "";
    if (!data.has_next || !cursor) return out;
  }
  console.warn("OzonWatch: достигнут лимит страниц " + OW_MAX_PAGES);
  return out;
}

/* ---------- Память увиденных номеров (в свойствах скрипта, кусками) ---------- */

/** Возвращает {posting_number: dayNumber}. */
function OW_loadSeen_() {
  var p = OW_props_();
  var n = parseInt(p.getProperty("OW_SEEN_N") || "0", 10) || 0;
  var s = "";
  for (var i = 0; i < n; i++) s += p.getProperty("OW_SEEN_" + i) || "";
  if (!s) return {};
  try { return JSON.parse(s); } catch (e) { console.error("OzonWatch: битая память, сброс: " + e); return {}; }
}

function OW_saveSeen_(map, nowMs) {
  var today = Math.floor(nowMs / OW_DAY_MS);
  var clean = {};
  for (var k in map) if (map.hasOwnProperty(k) && today - map[k] <= OW_KEEP_DAYS) clean[k] = map[k];
  var s = JSON.stringify(clean);
  var p = OW_props_();
  var oldN = parseInt(p.getProperty("OW_SEEN_N") || "0", 10) || 0;
  var vals = {}, n = 0;
  for (var off = 0; off < s.length; off += OW_CHUNK) vals["OW_SEEN_" + (n++)] = s.slice(off, off + OW_CHUNK);
  vals.OW_SEEN_N = String(n);
  p.setProperties(vals, false);
  for (var j = n; j < oldN; j++) p.deleteProperty("OW_SEEN_" + j);
  return clean;
}

/* ---------- Вебхук макс агента ---------- */

function OW_webhookHeaders_(cfg) {
  var h = {};
  if (!cfg.key) return h;
  if (cfg.keyHeader) { h[cfg.keyHeader] = cfg.key; return h; }
  h["Authorization"] = "Bearer " + cfg.key;
  h["X-Webhook-Key"] = cfg.key;
  return h;
}

/** Возвращает HTTP-код (0 при сетевой ошибке). */
function OW_post_(cfg, obj) {
  if (!cfg.url) throw new Error("OzonWatch: не задан MAXBOT_WEBHOOK_URL");
  try {
    var res = UrlFetchApp.fetch(cfg.url, {
      method: "post",
      contentType: "application/json",
      headers: OW_webhookHeaders_(cfg),
      payload: JSON.stringify(obj),
      muteHttpExceptions: true
    });
    var code = res.getResponseCode();
    if (code < 200 || code >= 300) {
      console.error("OzonWatch: вебхук HTTP " + code + " " + String(res.getContentText()).slice(0, 300));
    }
    return code;
  } catch (e) {
    console.error("OzonWatch: вебхук недоступен: " + e);
    return 0;
  }
}

/* ---------- Публичные функции ---------- */

/** Тик триггера: ищет новые отправления и будит макс агента. */
function ozonWatchTick() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) { console.log("OzonWatch: предыдущий тик ещё идёт, пропуск"); return; }
  try {
    var now = Date.now();
    var cfg = OW_cfg_();
    var postings;
    try { postings = OW_fetchPostings_(cfg, now); }
    catch (e) { console.error(String(e && e.message || e)); return { ok: false, error: "ozon" }; }

    var seen = OW_loadSeen_();
    var today = Math.floor(now / OW_DAY_MS);
    if (OW_props_().getProperty("OW_SEEDED") !== "1") {
      // Защита: без предварительной установки не заваливаем агента старыми заказами.
      for (var i = 0; i < postings.length; i++) seen[postings[i]] = today;
      OW_saveSeen_(seen, now);
      OW_props_().setProperty("OW_SEEDED", "1");
      console.log("OzonWatch: первый запуск, запомнено " + postings.length + " без отправки");
      return { ok: true, seeded: postings.length, sent: 0 };
    }

    var fresh = [];
    for (var j = 0; j < postings.length; j++) if (!seen.hasOwnProperty(postings[j])) fresh.push(postings[j]);
    if (!fresh.length) { OW_saveSeen_(seen, now); return { ok: true, sent: 0 }; }

    var code = OW_post_(cfg, { posting_numbers: fresh, posting_number: fresh[0] });
    if (code >= 200 && code < 300) {
      for (var k = 0; k < fresh.length; k++) seen[fresh[k]] = today;
      OW_saveSeen_(seen, now);
      console.log("OzonWatch: отправлено " + fresh.length + ": " + fresh.join(", "));
      return { ok: true, sent: fresh.length, code: code };
    }
    console.error("OzonWatch: не доставлено (" + code + "), повтор на следующем тике: " + fresh.join(", "));
    return { ok: false, error: "webhook", code: code, pending: fresh.length };
  } finally {
    lock.releaseLock();
  }
}

/** Запустить один раз: запоминает текущие заказы БЕЗ отправки и ставит триггер раз в 5 минут. */
function ozonWatchInstall() {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var now = Date.now();
    var postings = OW_fetchPostings_(OW_cfg_(), now);   // при ошибке Ozon — исключение, триггер не создаётся
    var seen = OW_loadSeen_();
    var today = Math.floor(now / OW_DAY_MS);
    for (var i = 0; i < postings.length; i++) seen[postings[i]] = today;
    OW_saveSeen_(seen, now);
    OW_props_().setProperty("OW_SEEDED", "1");
  } finally {
    lock.releaseLock();
  }
  OW_removeTriggers_();
  ScriptApp.newTrigger(OW_TICK_FN).timeBased().everyMinutes(5).create();
  console.log("OzonWatch: установлено. Запомнено текущих отправлений: " + postings.length + ". Триггер: каждые 5 минут.");
  return { ok: true, seeded: postings.length };
}

/** Выключить: удаляет триггер (память увиденных номеров сохраняется). */
function ozonWatchUninstall() {
  var n = OW_removeTriggers_();
  console.log("OzonWatch: удалено триггеров: " + n);
  return { ok: true, removed: n };
}

/** Проверка вебхука: шлёт {"test":true} и пишет HTTP-код в журнал. */
function ozonWatchTest() {
  var code = OW_post_(OW_cfg_(), { test: true });
  console.log("OzonWatch: тестовый POST → HTTP " + code + (code >= 200 && code < 300 ? " (ОК)" : " (ошибка)"));
  return code;
}

function OW_removeTriggers_() {
  var all = ScriptApp.getProjectTriggers(), n = 0;
  for (var i = 0; i < all.length; i++) {
    if (all[i].getHandlerFunction() === OW_TICK_FN) { ScriptApp.deleteTrigger(all[i]); n++; }
  }
  return n;
}

