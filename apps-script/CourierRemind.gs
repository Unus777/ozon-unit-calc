/**
 * CourierRemind.gs — автоматические напоминания курьеру (Рашад) о доставках.
 *
 * Отдельный файл того же проекта Apps Script, что и Code.gs (таблица «Заказы озон»).
 * Code.gs НЕ меняется. Все глобальные имена здесь начинаются с CR_ / courierRemind.
 *
 * Что делает: каждые 10 минут (триггер по времени) читает лист «Доставки» через listRows()
 * и при необходимости шлёт пуш тем же путём, что действие «remind» / кнопка «Напомнить»:
 *   setNotice({type:"remind", ...})  и  push({})  — подпись VAPID ставит сам скрипт.
 * В тексте нет сумм и цен. Заказы склада FBS 1020005035230080 и строки «ППЗ» не берутся.
 *
 * По Москве (тихие часы 21:00–08:00 — пушей нет):
 *   • ~08:30  сводка «Сегодня N доставок (+M возвратов)» + короткий список (ЦБ, район, окно);
 *             сегодня и просроченные, ещё не доставленные / не отменённые.
 *   • за ~60 мин до начала окна: «Через час доставка ЦБ-… · адрес»;
 *             если не согласовано — «не забудьте согласовать».
 *   • с ~11:00 по сегодняшним несогласованным: «позвоните клиенту и согласуйте доставку».
 *   • окно закончилось, заказ не доставлен: один раз «Отметьте доставку ЦБ-… или сообщите о проблеме».
 *   • возврат (номер …-R, ещё не забран): раз в день, «сначала позвоните клиенту…».
 *
 * Каждый тип по заказу — не чаще одного раза (для возврата и сводки — раз в календарный день).
 * Память: свойства CR_SENT_* , старые ключи обрезаются.
 *
 * Запуск: один раз courierRemindInstall() (запоминает уже прошедшие окна БЕЗ отправки
 * и ставит триггер). Проверка: courierRemindTest() — сухой прогон, пуш не уходит.
 * Выключить: courierRemindUninstall().
 */

var CR_TICK_FN = "courierRemindTick";
var CR_TZ_NAME = "Europe/Moscow";
var CR_KEEP_DAYS = 21;
var CR_CHUNK = 8000;
var CR_TICK_MIN = 10;
var CR_FBS_WH = "1020005035230080";

function CR_tz_() { return (typeof TZ !== "undefined" && TZ) ? TZ : CR_TZ_NAME; }
function CR_props_() { return PropertiesService.getScriptProperties(); }

function CR_pad_(n) { return (n < 10 ? "0" : "") + n; }

/** Части даты/времени по Москве. */
function CR_msk_(now) {
  var d = now instanceof Date ? now : new Date(now || Date.now());
  var s;
  if (typeof Utilities !== "undefined" && Utilities.formatDate) {
    s = Utilities.formatDate(d, CR_tz_(), "yyyy-MM-dd HH:mm");
  } else {
    var x = new Date(d.getTime() + 3 * 3600 * 1000);
    s = x.getUTCFullYear() + "-" + CR_pad_(x.getUTCMonth() + 1) + "-" + CR_pad_(x.getUTCDate()) +
      " " + CR_pad_(x.getUTCHours()) + ":" + CR_pad_(x.getUTCMinutes());
  }
  var y = +s.slice(0, 4), mo = +s.slice(5, 7), day = +s.slice(8, 10);
  var H = +s.slice(11, 13), M = +s.slice(14, 16);
  return {
    date: d, y: y, mo: mo, d: day, H: H, M: M,
    iso: s.slice(0, 10),
    dmy: CR_pad_(day) + "." + CR_pad_(mo) + "." + y,
    hm: s.slice(11, 16),
    minutes: H * 60 + M
  };
}

function CR_isQuiet_(msk) { return msk.H >= 21 || msk.H < 8; }

function CR_plural_(n, one, few, many) {
  var n10 = Math.abs(n) % 10, n100 = Math.abs(n) % 100;
  if (n10 === 1 && n100 !== 11) return n + " " + one;
  if (n10 >= 2 && n10 <= 4 && (n100 < 10 || n100 >= 20)) return n + " " + few;
  return n + " " + many;
}

function CR_isoDate_(dmy) {
  var m = /^(\d\d)\.(\d\d)\.(\d{4})$/.exec(String(dmy || "").trim());
  return m ? m[3] + "-" + m[2] + "-" + m[1] : "";
}

function CR_area_(address) {
  var s = String(address || "").trim();
  if (!s) return "";
  var parts = s.split(",").map(function (x) { return x.trim(); }).filter(Boolean);
  var skip = /^(россия|russia|рф|\d{5,6}|московская область|московская обл\.?)$/i;
  for (var i = 0; i < parts.length; i++) if (!skip.test(parts[i])) return parts[i];
  return parts[0] || "";
}

function CR_isCourier_(r) {
  var c = String(r && r.courier || "").trim();
  return !c || /^рашад$/i.test(c);
}

function CR_isFbs_(r) {
  if (!r) return false;
  if (/ППЗ/i.test(String(r.address || "")) || /ППЗ/i.test(String(r.unload || ""))) return true;
  var blob = [r.comment, r.address, r.unload, r.posting].join(" ");
  return blob.indexOf(CR_FBS_WH) >= 0 || /FBS Алмалы/i.test(blob);
}

function CR_isReturn_(r) {
  if (!r) return false;
  if (/-R\d*$/.test(String(r.posting || ""))) return true;
  return /(^|\n)Возврат: /.test(String(r.comment || ""));
}

function CR_isActive_(r) {
  return r && r.status !== "Доставлен" && r.status !== "Отменён";
}

function CR_isAgreed_(r) {
  if (!r) return false;
  if (r.status === "Согласован") return true;
  var all = String(r.courier_comment || "").split("\n").concat(String(r.comment || "").split("\n"));
  for (var i = 0; i < all.length; i++) {
    if (/^Согласовано: (прораб|клиент) · /.test(all[i].trim())) return true;
  }
  return false;
}

function CR_parseClock_(s) {
  var m = /^(\d{1,2})(?::(\d{2}))?$/.exec(String(s || "").trim());
  if (!m) return null;
  var h = +m[1], min = m[2] ? +m[2] : 0;
  if (h > 23 || min > 59) return null;
  return {h: h, m: min};
}

function CR_parseSpan_(s) {
  s = String(s || "").trim();
  if (!s) return null;
  if (/в течение дня/i.test(s)) return {from: {h: 10, m: 0}, to: {h: 20, m: 0}, label: "в течение дня"};
  var m = /(?:с\s+)?(\d{1,2}(?::\d{2})?)\s*(?:[–\-—]|до)\s*(\d{1,2}(?::\d{2})?)/i.exec(s);
  if (!m) return null;
  var a = CR_parseClock_(m[1]), b = CR_parseClock_(m[2]);
  if (!a || !b) return null;
  var lab = CR_pad_(a.h) + ":" + CR_pad_(a.m) + "–" + CR_pad_(b.h) + ":" + CR_pad_(b.m);
  return {from: a, to: b, label: lab};
}

function CR_timeText_(r) {
  var lines = String(r && r.comment || "").split("\n"), i, a;
  for (i = 0; i < lines.length; i++) {
    if (lines[i].indexOf("Время доставки: ") === 0) return lines[i].slice("Время доставки: ".length).trim();
  }
  lines = String(r && r.courier_comment || "").split("\n");
  for (i = 0; i < lines.length; i++) {
    a = /^Согласовано: (прораб|клиент) · \d\d\.\d\d \d\d:\d\d(?: · интервал (.+))?$/.exec(lines[i].trim());
    if (a && a[2]) return a[2].trim();
  }
  return "";
}

/** Окно доставки по Москве: {start, end, label, hasStart}. Без даты — null. */
function CR_window_(r) {
  var iso = CR_isoDate_(r && r.date);
  if (!iso) return null;
  var y = +iso.slice(0, 4), mo = +iso.slice(5, 7), d = +iso.slice(8, 10);
  var span = CR_parseSpan_(CR_timeText_(r));
  var at = function (clock) {
    return new Date(Date.UTC(y, mo - 1, d, clock.h - 3, clock.m, 0, 0));
  };
  var to = span ? span.to : {h: 20, m: 0};
  return {
    start: span ? at(span.from) : null,
    end: at(to),
    label: span ? span.label : "",
    hasStart: !!span
  };
}

function CR_eligible_(r) {
  return !!(r && r.posting && CR_isCourier_(r) && CR_isActive_(r) && !CR_isFbs_(r));
}

function CR_todayOrOverdue_(r, msk) {
  var iso = CR_isoDate_(r.date);
  if (!iso) return true;  // без даты — в сегодняшней сводке, пока не доставлен
  return iso <= msk.iso;
}

/* ---------- Память отправленных (свойства скрипта, кусками) ---------- */

function CR_loadSent_() {
  var p = CR_props_();
  var n = parseInt(p.getProperty("CR_SENT_N") || "0", 10) || 0;
  var s = "", i;
  for (i = 0; i < n; i++) s += p.getProperty("CR_SENT_" + i) || "";
  if (!s) return {};
  try { return JSON.parse(s); } catch (e) { console.error("CourierRemind: битая память, сброс: " + e); return {}; }
}

function CR_saveSent_(map, nowMs) {
  var today = Math.floor(nowMs / 86400000);
  var clean = {}, k;
  for (k in map) if (map.hasOwnProperty(k) && today - map[k] <= CR_KEEP_DAYS) clean[k] = map[k];
  var s = JSON.stringify(clean);
  var p = CR_props_();
  var oldN = parseInt(p.getProperty("CR_SENT_N") || "0", 10) || 0;
  var vals = {}, n = 0, off;
  for (off = 0; off < s.length; off += CR_CHUNK) vals["CR_SENT_" + (n++)] = s.slice(off, off + CR_CHUNK);
  vals.CR_SENT_N = String(n);
  p.setProperties(vals, false);
  for (var j = n; j < oldN; j++) p.deleteProperty("CR_SENT_" + j);
  return clean;
}

/* ---------- Планирование ---------- */

function CR_line_(r, w) {
  var area = CR_area_(r.address) || (r.address || "");
  var bits = [r.cb || r.posting, area];
  if (w && w.label) bits.push(w.label);
  return bits.filter(Boolean).join(" · ");
}

function CR_notice_(r, text, extra) {
  var n = {type: "remind", text: String(text || "").slice(0, 300)};
  if (r) {
    n.posting = r.posting;
    n.cb = r.cb || "";
    n.packs = r.packs || "";
    n.address = r.address || "";
    n.unload = r.unload || "";
  }
  if (extra) for (var k in extra) if (extra.hasOwnProperty(k)) n[k] = extra[k];
  return n;
}

/**
 * Возвращает список запланированных напоминаний (ещё не отмечая их отправленными).
 * seedPast — ключи, которые установка должна запомнить без отправки (уже прошедшие окна/слоты).
 */
function CR_plan_(rows, now, opt) {
  opt = opt || {};
  var msk = CR_msk_(now);
  var out = { quiet: CR_isQuiet_(msk), items: [], seed: [], msk: msk };
  if (!rows) rows = [];
  var active = [], i, r, w, key;
  for (i = 0; i < rows.length; i++) {
    if (CR_eligible_(rows[i])) active.push(rows[i]);
  }

  var deliveries = [], returns = [], dueDeliv = [];
  for (i = 0; i < active.length; i++) {
    r = active[i];
    if (CR_isReturn_(r)) returns.push(r);
    else {
      deliveries.push(r);
      if (CR_todayOrOverdue_(r, msk)) dueDeliv.push(r);
    }
  }

  function add(type, key, notice, past) {
    var item = {type: type, key: key, posting: (notice && notice.posting) || "", cb: (notice && notice.cb) || "", notice: notice};
    if (past) out.seed.push(item);
    else out.items.push(item);
  }

  // --- сводка ---
  var digestKey = "digest:" + msk.iso;
  var afterDigest = msk.minutes >= 8 * 60 + 30;
  var inDigest = msk.H === 8 && msk.M >= 30;
  if ((dueDeliv.length || returns.length) && afterDigest) {
    var head = dueDeliv.length
      ? ("Сегодня " + CR_plural_(dueDeliv.length, "доставка", "доставки", "доставок") +
        (returns.length ? " (+" + CR_plural_(returns.length, "возврат", "возврата", "возвратов") + ")" : ""))
      : ("Сегодня " + CR_plural_(returns.length, "возврат", "возврата", "возвратов"));
    var lines = [head];
    for (i = 0; i < dueDeliv.length; i++) lines.push(CR_line_(dueDeliv[i], CR_window_(dueDeliv[i])));
    for (i = 0; i < returns.length; i++) lines.push("↩️ " + CR_line_(returns[i], CR_window_(returns[i])) + " · сначала позвоните клиенту");
    var digestNotice = CR_notice_(null, lines.join("\n"), {cb: "сегодня"});
    add("digest", digestKey, digestNotice, !inDigest && afterDigest);
  }

  // --- по заказам-доставкам ---
  for (i = 0; i < deliveries.length; i++) {
    r = deliveries[i];
    w = CR_window_(r);
    var iso = CR_isoDate_(r.date) || msk.iso;

    if (w && w.hasStart && w.start) {
      key = "pre:" + r.posting + ":" + iso;
      var t = msk.date.getTime(), start = w.start.getTime();
      var inPre = t >= start - 60 * 60 * 1000 && t < start;
      var pastPre = t >= start;
      if (inPre) add("pre", key, CR_notice_(r, "Через час доставка " + (r.cb || r.posting) +
        (r.address ? " · " + r.address : "") + (CR_isAgreed_(r) ? "" : ". Не забудьте согласовать")), false);
      else if (pastPre) add("pre", key, null, true);
    }

    if (w && w.end) {
      key = "overdue:" + r.posting + ":" + iso;
      if (msk.date.getTime() >= w.end.getTime()) {
        add("overdue", key, CR_notice_(r, "Отметьте доставку " + (r.cb || r.posting) + " или сообщите о проблеме"),
          opt.seedPast || false);
      }
    }

    if (iso === msk.iso && !CR_isAgreed_(r)) {
      key = "agree:" + r.posting + ":" + msk.iso;
      if (msk.H >= 11) {
        add("agree", key, CR_notice_(r, "Не согласовано: " + (r.cb || r.posting) + " · позвоните клиенту и согласуйте доставку"),
          msk.H >= 11 && opt.seedPast && opt.install);
      }
    }
  }

  // На установке просроченные окна не шлём — только запоминаем.
  if (opt.install) {
    var filtered = [], seeded = out.seed.slice();
    for (i = 0; i < out.items.length; i++) {
      if (out.items[i].type === "overdue" || out.items[i].type === "agree" || out.items[i].type === "digest") {
        // digest/agree: если слот уже не тот (обработано выше для digest); overdue всегда seed на install
        if (out.items[i].type === "overdue") { seeded.push(out.items[i]); continue; }
        if (out.items[i].type === "agree" && opt.install) { seeded.push(out.items[i]); continue; }
        if (out.items[i].type === "digest" && !inDigest) { seeded.push(out.items[i]); continue; }
      }
      filtered.push(out.items[i]);
    }
    // возвраты: в день установки не шлём
    out.items = filtered.filter(function (it) { return it.type !== "return"; });
    out.seed = seeded;
  }

  // --- возвраты: раз в день после 08:30 ---
  if (afterDigest) {
    for (i = 0; i < returns.length; i++) {
      r = returns[i];
      key = "return:" + r.posting + ":" + msk.iso;
      add("return", key, CR_notice_(r, "Возврат " + (r.cb || r.posting) +
        ": сначала позвоните клиенту и предупредите, что заберёте плитку"), !!opt.install);
    }
  }

  return out;
}

function CR_hasMoney_(s) {
  return /[₽]|оплат|доставк\w*,\s*₽|подъ[её]м/i.test(String(s || "")) && /\d/.test(String(s || "")) && /₽/.test(String(s || ""));
}

function CR_send_(notice) {
  var text = notice && notice.text || "";
  if (/₽/.test(text)) throw new Error("CourierRemind: в тексте напоминания не должно быть сумм");
  setNotice(notice);
  return push({});
}

/* ---------- Публичные функции ---------- */

function CR_eventToNow_(arg) {
  if (arg instanceof Date) return arg;
  if (typeof arg === "number" && isFinite(arg)) return new Date(arg);
  return new Date();
}

/** Тик триггера: планирует и при необходимости шлёт пуш курьеру. */
function courierRemindTick(arg) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) { console.log("CourierRemind: предыдущий тик ещё идёт, пропуск"); return {ok: false, error: "busy"}; }
  try {
    return CR_run_(CR_eventToNow_(arg), {send: true});
  } finally {
    lock.releaseLock();
  }
}

/**
 * Сухой прогон: что ушло бы сейчас, без пуша и без записи в память.
 * В редакторе Apps Script: выбрать courierRemindTest и «Выполнить», смотреть журнал / возвращаемое значение.
 */
function courierRemindTest(arg) {
  return CR_run_(CR_eventToNow_(arg), {send: false});
}

function CR_run_(now, opt) {
  opt = opt || {};
  var msk = CR_msk_(now);
  var rows;
  try { rows = listRows(); }
  catch (e) {
    console.error("CourierRemind: не прочиталась таблица: " + e);
    return {ok: false, error: "list", message: String(e && e.message || e)};
  }
  var plan = CR_plan_(rows, now, opt);
  if (plan.quiet && opt.send) {
    console.log("CourierRemind: тихие часы " + msk.hm + " МСК, пушей нет");
    return {ok: true, quiet: true, sent: 0, at: msk.dmy + " " + msk.hm};
  }
  var sentMap = opt.send ? CR_loadSent_() : {};
  var today = Math.floor((now instanceof Date ? now : new Date(now)).getTime() / 86400000);
  var i, it;
  // Первый запуск без Install: запоминаем прошедшие окна, ничего ретроактивно не шлём.
  if (opt.send && CR_props_().getProperty("CR_SEEDED") !== "1") {
    var seedPlan = CR_plan_(rows, now, {install: true, seedPast: true});
    for (i = 0; i < seedPlan.seed.length; i++) {
      it = seedPlan.seed[i];
      if (it && it.key && sentMap[it.key] == null) sentMap[it.key] = today;
    }
    CR_saveSent_(sentMap, (now instanceof Date ? now : new Date(now)).getTime());
    CR_props_().setProperty("CR_SEEDED", "1");
    console.log("CourierRemind: первый запуск, запомнено прошедших слотов без отправки");
    plan = CR_plan_(rows, now, {});
  }
  var planned = [];
  var source = plan.quiet ? [] : plan.items;
  for (i = 0; i < source.length; i++) {
    it = source[i];
    if (sentMap[it.key] != null) continue;
    if (CR_hasMoney_(it.notice && it.notice.text)) continue;
    planned.push(it);
  }
  if (!opt.send) {
    return {
      ok: true, dry: true, quiet: plan.quiet, at: msk.dmy + " " + msk.hm,
      count: planned.length,
      items: planned.map(function (x) {
        return {type: x.type, posting: x.posting, cb: x.cb, key: x.key, text: x.notice && x.notice.text || ""};
      })
    };
  }
  var sent = 0, errors = 0;
  for (i = 0; i < planned.length; i++) {
    it = planned[i];
    try {
      CR_send_(it.notice);
      sentMap[it.key] = today;
      sent++;
    } catch (err) {
      errors++;
      console.error("CourierRemind: не ушло " + it.key + ": " + err);
    }
  }
  CR_saveSent_(sentMap, (now instanceof Date ? now : new Date(now)).getTime());
  console.log("CourierRemind: отправлено " + sent + (errors ? ", ошибок " + errors : "") + " · " + msk.dmy + " " + msk.hm);
  return {ok: true, quiet: false, sent: sent, errors: errors, at: msk.dmy + " " + msk.hm};
}

/** Запустить один раз: запоминает прошедшие окна БЕЗ отправки и ставит триггер раз в 10 минут. */
function courierRemindInstall(arg) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  var now = CR_eventToNow_(arg), seeded = 0;
  try {
    var rows = listRows();
    var plan = CR_plan_(rows, now, {install: true, seedPast: true});
    var sentMap = CR_loadSent_();
    var today = Math.floor(now.getTime() / 86400000);
    var i, it, keys = {};
    for (i = 0; i < plan.seed.length; i++) {
      it = plan.seed[i];
      if (it && it.key && sentMap[it.key] == null) { sentMap[it.key] = today; seeded++; }
      if (it && it.key) keys[it.key] = 1;
    }
    // На установке не отправляем текущие слоты сразу — ближайший тик сам решит (кроме уже прошедших).
    CR_saveSent_(sentMap, now.getTime());
    CR_props_().setProperty("CR_SEEDED", "1");
  } finally {
    lock.releaseLock();
  }
  CR_removeTriggers_();
  ScriptApp.newTrigger(CR_TICK_FN).timeBased().everyMinutes(CR_TICK_MIN).create();
  console.log("CourierRemind: установлено. Запомнено прошедших слотов: " + seeded + ". Триггер: каждые " + CR_TICK_MIN + " мин.");
  return {ok: true, seeded: seeded, everyMinutes: CR_TICK_MIN};
}

/** Выключить: удаляет триггер (память отправленных сохраняется). */
function courierRemindUninstall() {
  var n = CR_removeTriggers_();
  console.log("CourierRemind: удалено триггеров: " + n);
  return {ok: true, removed: n};
}

function CR_removeTriggers_() {
  var all = ScriptApp.getProjectTriggers(), n = 0, i;
  for (i = 0; i < all.length; i++) {
    if (all[i].getHandlerFunction() === CR_TICK_FN) { ScriptApp.deleteTrigger(all[i]); n++; }
  }
  return n;
}
