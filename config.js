// Общие настройки страниц и service worker. Здесь нет секретов: доступ проверяет скрипт таблицы по ключу.
const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzMzytUhF-uTuVUAAgZPrlDDj9pPAzBuyNCytb_gv5Jryb3JGPLlj7uZ4SRgnUXd-jr/exec";  // веб-приложение Apps Script таблицы «Заказы озон»
// Ключ JavaScript API Яндекс Карт (публичный, ограничен адресом сайта в кабинете Яндекса). Пусто — карта-виджет без ключа
const YANDEX_MAPS_KEY = "";
const VAPID_PUBLIC = "BLohqQumwjQWSNlNIYhhvMdPS-mKh26EDfLtB35KSQfhR6TivHQStDoRbTneMul52AAuOjekm7YuCNbtLNJ-6mA";

// text/plain — чтобы браузер не делал preflight-запрос: Apps Script на OPTIONS не отвечает
async function sheetApi(payload) {
  if (!SCRIPT_URL) throw new Error("Таблица ещё не подключена");
  const r = await fetch(SCRIPT_URL, {method: "POST", body: JSON.stringify(payload),
    headers: {"Content-Type": "text/plain;charset=utf-8"}});
  const out = await r.json();
  if (!out.ok) throw new Error(out.error);
  return out.result;
}

// Подробности хранятся читаемыми строками в существующем комментарии таблицы.
// «Согласовано: прораб · 05.11 14:05 · интервал 12–14» — отметка курьера «Согласовал доставку».
function deliveryDetails(comment) {
  const out = {note: [], time: "", foreman: "", agreed: null};
  for (const line of String(comment || "").split("\n")) {
    if (line.startsWith("Время доставки: ")) out.time = line.slice("Время доставки: ".length).trim();
    else if (line.startsWith("Телефон прораба: ")) out.foreman = line.slice("Телефон прораба: ".length).trim();
    else if (parseAgreement(line)) out.agreed = parseAgreement(line);
    else out.note.push(line);
  }
  out.note = out.note.join("\n").trim();
  return out;
}

// ---------- «Согласовал доставку» ----------
// Скрипт таблицы разрешает курьеру менять только date, status и courier_comment (COURIER_FIELDS в Code.gs),
// поэтому курьер пишет строку согласования в «Комментарий курьера»; его собственный текст сохраняется рядом.
const AGREED = "Согласовано: ";
const AGREED_WHO = ["прораб", "клиент"];
// Интервалы-подсказки для «Время доставки» и «Согласовал доставку»
const DELIVERY_SLOTS = ["10:00–12:00", "12:00–14:00", "14:00–16:00", "16:00–18:00", "18:00–20:00", "в течение дня"];
const slotLabel = x => String(x).replace(/:00/g, "").replace("в течение дня", "Весь день");
function agreementLine(a) {
  if (!a || !a.at) return "";
  return AGREED + [a.who || "прораб", a.at, a.slot ? "интервал " + String(a.slot).trim() : ""].filter(Boolean).join(" · ");
}
function parseAgreement(line) {
  const m = /^Согласовано: (прораб|клиент) · (\d\d)\.(\d\d) (\d\d:\d\d)(?: · интервал (.+))?$/.exec(String(line || "").trim());
  return m ? {who: m[1], day: `${m[2]}.${m[3]}`, time: m[4], at: `${m[2]}.${m[3]} ${m[4]}`, slot: (m[5] || "").trim()} : null;
}
function courierNotes(value) {  // «Комментарий курьера» → его текст + отметки «Согласовано:» и «Принял:»
  const text = [];
  let agreed = null, ack = null;
  for (const line of String(value || "").split("\n")) {
    const a = parseAgreement(line), k = parseAck(line);
    if (a) agreed = a; else if (k) ack = k; else text.push(line);
  }
  return {text: text.join("\n").trim(), agreed, ack};
}
function courierComment({text, agreed, ack}) {
  return [String(text || "").trim(), agreementLine(agreed), ackLine(ack)].filter(Boolean).join("\n");
}
// «Принял: 05.11 14:05» — курьер нажал «Принял» на экране тревоги нового заказа
function ackLine(a) {
  const at = typeof a === "string" ? a : a && a.at;
  return /^\d\d\.\d\d \d\d:\d\d$/.test(at || "") ? `Принял: ${at}` : "";
}
function parseAck(line) {
  const m = /^Принял: (\d\d)\.(\d\d) (\d\d:\d\d)$/.exec(String(line || "").trim());
  return m ? {day: `${m[1]}.${m[2]}`, time: m[3], at: `${m[1]}.${m[2]} ${m[3]}`} : null;
}
function ackOf(r) { return r ? courierNotes(r.courier_comment).ack : null; }
// Курьер уже видел заказ: нажал «Принял», согласовал доставку или заказ ушёл дальше «Нового»
function isAccepted(r) {
  return !!r && (r.status !== "Новый" || !!ackOf(r) || !!courierNotes(r.courier_comment).agreed);
}
function ackLabel(a, today = agreedNow()) {
  if (!a) return "Не принят курьером";
  return "Принял · " + (a.day === today.slice(0, 5) ? a.time : a.day);
}
// Отметка по строке листа: из комментария курьера, иначе из комментария владельца
const agreementOf = r => r ? (courierNotes(r.courier_comment).agreed || deliveryDetails(r.comment).agreed) : null;
function agreedNow(d = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("ru-RU", {timeZone: "Europe/Moscow", day: "2-digit", month: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false}).formatToParts(d).map(x => [x.type, x.value]));
  return `${p.day}.${p.month} ${p.hour}:${p.minute}`;
}
// «Согласовано · 14:05» (сегодня) или «Согласовано · 04.11»
function agreedLabel(a, today = agreedNow()) {
  if (!a) return "Не согласовано";
  return "Согласовано · " + (a.day === today.slice(0, 5) ? a.time : a.day);
}

function foremanPhone(value) {
  let phone = String(value || "").replace(/\D/g, "");
  if (!String(value || "").trim()) return "";
  if (phone.length === 10) phone = "7" + phone;
  if (phone.length === 11 && phone[0] === "8") phone = "7" + phone.slice(1);
  if (!/^\d{11,15}$/.test(phone)) throw new Error("Проверьте телефон прораба: укажите номер с кодом страны");
  return "+" + phone;
}

function deliveryComment({note, time, foreman, agreed}) {
  return [String(note || "").trim(), time && "Время доставки: " + String(time).trim(),
    foreman && "Телефон прораба: " + foremanPhone(foreman), agreementLine(agreed)].filter(Boolean).join("\n");
}

// Расчёт с курьером по строкам листа «Доставки»: доставленные — к выплате, «Новый»/«Согласован» — в работе.
const num = x => Number(String(x ?? "").replace(/[^\d.-]/g, "")) || 0;
const MONTHS = ["январь", "февраль", "март", "апрель", "май", "июнь", "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь"];

function deliveryReport(rows, payments) {
  const sum = list => ({n: list.length, delivery: list.reduce((a, r) => a + num(r.delivery), 0),
    lift: list.reduce((a, r) => a + num(r.lift), 0), pay: list.reduce((a, r) => a + num(r.pay), 0)});
  const done = rows.filter(r => r.status === "Доставлен");
  const byMonth = {};
  for (const r of done) {
    const m = /(\d\d)\.(\d{4})/.exec(r.delivered_at || r.sent);  // месяц доставки, у старых — месяц заказа
    const key = m ? `${m[2]}-${m[1]}` : "—";
    (byMonth[key] = byMonth[key] || []).push(r);
  }
  const paid = (payments || []).reduce((acc, p) => acc + num(p.amount), 0);
  return {
    paid, left: sum(done).pay - paid, payments: payments || [], hasPayments: Array.isArray(payments),
    done: sum(done),
    active: sum(rows.filter(r => r.status === "Новый" || r.status === "Согласован")),
    months: Object.keys(byMonth).sort().reverse().map(k => ({
      label: k === "—" ? "без даты" : `${MONTHS[+k.slice(5) - 1]} ${k.slice(0, 4)}`, ...sum(byMonth[k])})),
  };
}

const plural = (n, one, few, many) =>
  `${n} ${n % 10 === 1 && n % 100 !== 11 ? one : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? few : many}`;

// opts: {title, leftLabel, admin} — admin показывает форму записи выплаты и кнопки удаления
function reportHtml(rep, opts) {
  const rub = x => Math.round(x).toLocaleString("ru-RU").replace(/\u00a0/g, " ") + " ₽";
  const esc = x => String(x ?? "").replace(/[&<>"']/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"})[c]);
  const months = rep.months.map(m => `<tr><td>${m.label}<div class="mut">${plural(m.n, "доставка", "доставки", "доставок")} · доставка ${rub(m.delivery)} · разгрузка ${rub(m.lift)}</div></td><td>${rub(m.pay)}</td></tr>`).join("");
  const pays = [...rep.payments].reverse().map(p => `<tr><td>${esc(p.date)}${p.comment ? `<div class="mut">${esc(p.comment)}</div>` : ""}</td>` +
    `<td>${rub(num(p.amount))}${opts.admin && p.id ? ` <button class="text" data-unpay="${esc(p.id)}" aria-label="Удалить выплату">✕</button>` : ""}</td></tr>`).join("");
  const today = new Date().toISOString().slice(0, 10);
  const form = opts.admin && rep.hasPayments ? `<form class="payform" data-pay>
<input name="amount" inputmode="numeric" placeholder="Сумма, ₽" aria-label="Сумма выплаты" required>
<input name="date" type="date" value="${today}" aria-label="Дата выплаты">
<input name="comment" placeholder="Комментарий (необязательно)" aria-label="Комментарий">
<button>Записать выплату</button></form>` : "";
  const big = rep.hasPayments ? rep.left : rep.done.pay;
  // свёрнуто — одна строка: сколько осталось + «Расчёт ›»; всё остальное — по нажатию
  return `<details class="card report"><summary><span class="rsum"><span class="mut">${opts.title}</span>
<span class="v num ${rep.hasPayments && big === 0 ? "green" : ""}">${big < 0 ? rub(-big) + ' <small class="mut">переплата</small>' : rub(big)}</span></span><span class="more">Расчёт ›</span></summary>
<div class="mut rdet">${rep.hasPayments ? `Начислено ${rub(rep.done.pay)} · выплачено ${rub(rep.paid)}<br>` : ""}` +
`${plural(rep.done.n, "доставка", "доставки", "доставок")}: доставка ${rub(rep.done.delivery)} · разгрузка ${rub(rep.done.lift)}` +
`${rep.active.n ? `<br>В работе: ${plural(rep.active.n, "заказ", "заказа", "заказов")} на ${rub(rep.active.pay)}` : ""}</div>
${rep.hasPayments ? `<h3>Выплаты</h3>${form}${pays ? `<table>${pays}</table>` : '<p class="mut">Выплат пока не записано</p>'}`
    : opts.admin ? '<p class="mut">Чтобы учитывать выплаты, обновите скрипт таблицы.</p>' : ""}
<h3>По месяцам</h3><table>${months}</table></details>`;
}

// ---------- нижнее меню и всплывающие подсказки (общие для обеих страниц) ----------
// Меню выезжает снизу; закрывается фоном, «Закрыть» или свайпом вниз
function sheetShow() {
  const s = document.getElementById("sheet");
  if (s.classList.contains("show")) return;  // уже открыто — только обновили содержимое
  s.hidden = false;
  document.body.classList.add("noscroll");
  requestAnimationFrame(() => requestAnimationFrame(() => s.classList.add("show")));
  buzz();
}
function sheetHide() {
  const s = document.getElementById("sheet");
  if (!s || s.hidden) return;
  s.classList.remove("show");
  s.querySelector(".sheet-panel").style.transform = "";
  document.body.classList.remove("noscroll");
  setTimeout(() => { if (!s.classList.contains("show")) s.hidden = true; }, 300);
}
(() => {
  // config.js подключает и sw.js: там нет страницы, и ошибка здесь сломала бы пуши
  if (typeof document === "undefined") return;
  const p = document.querySelector("#sheet .sheet-panel");
  if (!p) return;
  let y0 = null, dy = 0;
  p.addEventListener("touchstart", ev => { y0 = p.scrollTop > 0 ? null : ev.touches[0].clientY; dy = 0; }, {passive: true});
  p.addEventListener("touchmove", ev => {
    if (y0 === null) return;
    dy = Math.max(0, ev.touches[0].clientY - y0);
    p.style.transition = "none"; p.style.transform = `translateY(${dy}px)`;
  }, {passive: true});
  p.addEventListener("touchend", () => {
    if (y0 === null) return;
    y0 = null; p.style.transition = "";
    if (dy > 90) sheetHide(); else p.style.transform = "";
  });
})();
function toast(msg, bad) {
  let t = document.getElementById("toast");
  if (!t) { t = document.createElement("div"); t.id = "toast"; t.setAttribute("aria-live", "polite"); document.body.append(t); }
  t.textContent = msg;
  t.className = "toast show" + (bad ? " bad" : "");
  buzz(bad ? [30, 60, 30] : 15);
  clearTimeout(t.timer);
  t.timer = setTimeout(() => t.classList.remove("show"), bad ? 5000 : 2500);
}

// Короткая вибрация на Android (iPhone вибрацию с сайтов не поддерживает — там просто ничего не произойдёт)
function buzz(ms = 10) { try { navigator.vibrate?.(ms); } catch {} }

// «Потянуть вниз» в самом верху страницы — обновить список
function pullToRefresh(onRefresh) {
  const ind = document.createElement("div");
  ind.className = "ptr";
  ind.setAttribute("aria-hidden", "true");
  ind.innerHTML = "<span>↓</span>";
  document.body.prepend(ind);
  const READY = 70;
  let y0 = null, h = 0, busy = false;
  const set = v => {
    h = v;
    ind.style.transform = `translateY(${v - 48}px)`;
    ind.style.opacity = Math.min(1, v / READY);
    ind.classList.toggle("ready", v >= READY);
  };
  addEventListener("touchstart", ev => {
    const sheet = document.getElementById("sheet");
    y0 = !busy && scrollY <= 0 && (!sheet || sheet.hidden) && !ev.target.closest("#map") ? ev.touches[0].clientY : null;
  }, {passive: true});
  addEventListener("touchmove", ev => {
    if (y0 === null) return;
    const v = Math.min(110, Math.max(0, ev.touches[0].clientY - y0) * 0.5);
    if (v >= READY && h < READY) buzz();
    ind.style.transition = "none";
    set(v);
  }, {passive: true});
  addEventListener("touchend", () => {
    if (y0 === null) return;
    y0 = null;
    ind.style.transition = "";
    if (h < READY) { set(0); return; }
    busy = true;
    ind.classList.add("spin");
    set(READY);
    Promise.resolve(onRefresh()).finally(() => { busy = false; ind.classList.remove("spin"); set(0); });
  });
}

// ---------- единые линейные иконки (вместо эмодзи: одинаково выглядят на iPhone и Android) ----------
const ICONS = {
  phone: "M20.5 16.4v2.7a1.8 1.8 0 0 1-2 1.8 17.8 17.8 0 0 1-7.8-2.8 17.5 17.5 0 0 1-5.4-5.4A17.8 17.8 0 0 1 2.5 4.9a1.8 1.8 0 0 1 1.8-2h2.7a1.8 1.8 0 0 1 1.8 1.6c.1.9.3 1.7.6 2.5a1.8 1.8 0 0 1-.4 1.9L7.9 10a14.4 14.4 0 0 0 5.4 5.4l1.1-1.1a1.8 1.8 0 0 1 1.9-.4c.8.3 1.6.5 2.5.6a1.8 1.8 0 0 1 1.6 1.9z",
  bell: "M6.5 9a5.5 5.5 0 0 1 11 0c0 6 2.5 7.5 2.5 7.5H4s2.5-1.5 2.5-7.5M10.2 20a2 2 0 0 0 3.6 0",
  edit: "M4 20h4L18.5 9.5a2.1 2.1 0 0 0-3-3L5 17v3zM14 8l2 2",
  chart: "M3 3v18h18M7 15l4-4 3 3 5-6",
  calc: "M7 3h10a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM8.5 7h7v3h-7zM8.5 14h.01M12 14h.01M15.5 14h.01M8.5 17.5h.01M12 17.5h.01M15.5 17.5h.01",
  orders: "M7 3.5h10a1.5 1.5 0 0 1 1.5 1.5v15.5l-2.2-1.5-2.1 1.5-2.2-1.5-2.2 1.5-2.1-1.5-2.2 1.5V5A1.5 1.5 0 0 1 7 3.5zM9 8.5h6M9 12.5h4",
  copy: "M9 9h9.5A1.5 1.5 0 0 1 20 10.5V19a1.5 1.5 0 0 1-1.5 1.5H10A1.5 1.5 0 0 1 8.5 19V9.5M15.5 9V5.5A1.5 1.5 0 0 0 14 4H5.5A1.5 1.5 0 0 0 4 5.5V14a1.5 1.5 0 0 0 1.5 1.5h3",
  nav: "M4 11.2l16-7.2-7.2 16-1.9-6.9z",
  map: "M9 4.5l-5 2v13l5-2 6 2 5-2v-13l-5 2zM9 4.5v13M15 6.5v13",
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7.5V12l3 2",
  user: "M18.5 20v-1.5a3.5 3.5 0 0 0-3.5-3.5H9a3.5 3.5 0 0 0-3.5 3.5V20M12 11.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z",
  pin: "M19 10c0 5.5-7 11-7 11s-7-5.5-7-11a7 7 0 0 1 14 0zM12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z",
  truck: "M3 6.5A1.5 1.5 0 0 1 4.5 5h8A1.5 1.5 0 0 1 14 6.5V16H3zM14 9h3.6a1 1 0 0 1 .8.4l2.4 3.1a1 1 0 0 1 .2.6V16h-7M7.5 18.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM16.5 18.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4z",
  settings: "M4 7h9M17 7h3M4 17h3M11 17h9M15 5v4M9 15v4",
  theme: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 3v18",
  sun: "M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4L6 18M18 6l1.4-1.4",
  moon: "M19.5 14.5A7.5 7.5 0 0 1 9.5 4.5a7.5 7.5 0 1 0 10 10z",
  check: "M5 12.5l4.5 4.5L19 7.5",
  checkc: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM8.3 12.3l2.6 2.6 5-5.2",
  cal: "M5.5 5h13A1.5 1.5 0 0 1 20 6.5v12a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5v-12A1.5 1.5 0 0 1 5.5 5zM4 10h16M8.5 3v4M15.5 3v4",
  calcheck: "M5.5 5h13A1.5 1.5 0 0 1 20 6.5v12a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5v-12A1.5 1.5 0 0 1 5.5 5zM4 10h16M8.5 3v4M15.5 3v4M9 15l2 2 4-4",
  today: "M5.5 5h13A1.5 1.5 0 0 1 20 6.5v12a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5v-12A1.5 1.5 0 0 1 5.5 5zM4 10h16M8.5 3v4M15.5 3v4M8 14h3v3H8z",
  box: "M20 7.5l-8-4.5-8 4.5 8 4.5 8-4.5zM4 7.5v9l8 4.5 8-4.5v-9M12 12v9",
  lift: "M6 3.5h12A1.5 1.5 0 0 1 19.5 5v14a1.5 1.5 0 0 1-1.5 1.5H6A1.5 1.5 0 0 1 4.5 19V5A1.5 1.5 0 0 1 6 3.5zM9 9.5l3-3 3 3M9 14.5l3 3 3-3",
  note: "M6 3.5h8.5l4 4V19a1.5 1.5 0 0 1-1.5 1.5H6A1.5 1.5 0 0 1 4.5 19V5A1.5 1.5 0 0 1 6 3.5zM14 3.5V8h4.5M8 12.5h8M8 16h5",
  send: "M20.5 3.5L10 14M20.5 3.5l-6.5 17-4-6.5-6.5-4z",
  search: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-3.5-3.5",
  refresh: "M19.5 12a7.5 7.5 0 1 1-2.2-5.3M19.5 4.5v4h-4",
  link: "M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1",
  key: "M15 13.5a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9zM11.8 12.2L4 20M6.5 17.5l2 2M9 15l1.5 1.5",
  x: "M6.5 6.5l11 11M17.5 6.5l-11 11",
  more: "M5.5 12h.01M12 12h.01M18.5 12h.01",
  back: "M14.5 18l-6-6 6-6",
  chev: "M9.5 6l6 6-6 6",
  spark: "M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M6 18l2.5-2.5M15.5 8.5L18 6",
  wait: "M6 3h12M6 21h12M7 3v3.5a5 5 0 0 0 10 0V3M7 21v-3.5a5 5 0 0 1 10 0V21",
  alert: "M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01",
};
const ic = (name, cls = "") => `<svg class="ic${cls ? " " + cls : ""}" viewBox="0 0 24 24" aria-hidden="true"><path d="${ICONS[name] || ""}"/></svg>`;

// История заказа: этапы по порядку; первый незавершённый подсвечен как текущий
const shortDate = s => String(s || "").replace(/\.20\d\d/, "");
function timelineHtml(steps) {
  const esc = x => String(x ?? "").replace(/[&<>"']/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"})[c]);
  const cur = steps.findIndex(x => !x.done);
  return `<ol class="tl" aria-label="История заказа">${steps.map((x, i) =>
    `<li class="${x.done ? "done" : i === cur ? "now" : ""}${x.warn ? " warn" : ""}"><b>${esc(x.label)}</b>` +
    `${x.when ? `<span class="mut num">${esc(shortDate(x.when))}</span>` : ""}</li>`).join("")}</ol>`;
}
