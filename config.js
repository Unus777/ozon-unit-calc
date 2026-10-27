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
function deliveryDetails(comment) {
  const out = {note: [], time: "", foreman: ""};
  for (const line of String(comment || "").split("\n")) {
    if (line.startsWith("Время доставки: ")) out.time = line.slice("Время доставки: ".length).trim();
    else if (line.startsWith("Телефон прораба: ")) out.foreman = line.slice("Телефон прораба: ".length).trim();
    else out.note.push(line);
  }
  out.note = out.note.join("\n").trim();
  return out;
}

function foremanPhone(value) {
  let phone = String(value || "").replace(/\D/g, "");
  if (!String(value || "").trim()) return "";
  if (phone.length === 10) phone = "7" + phone;
  if (phone.length === 11 && phone[0] === "8") phone = "7" + phone.slice(1);
  if (!/^\d{11,15}$/.test(phone)) throw new Error("Проверьте телефон прораба: укажите номер с кодом страны");
  return "+" + phone;
}

function deliveryComment({note, time, foreman}) {
  return [String(note || "").trim(), time && "Время доставки: " + String(time).trim(),
    foreman && "Телефон прораба: " + foremanPhone(foreman)].filter(Boolean).join("\n");
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
<span class="v num ${rep.hasPayments && big <= 0 ? "green" : ""}">${rub(big)}</span></span><span class="more">Расчёт ›</span></summary>
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
  phone: "M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z",
  bell: "M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.9 1.9 0 0 0 3.4 0",
  edit: "M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z",
  chart: "M3 3v18h18M7 15l4-4 3 3 5-6",
  copy: "M10 8h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-8a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2zM16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2",
  nav: "M3 11l19-9-9 19-2-8z",
  map: "M9 4L3 6v14l6-2 6 2 6-2V4l-6 2zM9 4v14M15 6v14",
  clock: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 6v6l4 2",
  user: "M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
  pin: "M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0zM12 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
  truck: "M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2M15 18H9M19 18h2a1 1 0 0 0 1-1v-3.6a1 1 0 0 0-.2-.6l-3.5-4.4a1 1 0 0 0-.8-.4H14M7 20a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM17 20a2 2 0 1 0 0-4 2 2 0 0 0 0 4z",
  settings: "M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6",
  theme: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 3v18",
  check: "M22 11.1V12a10 10 0 1 1-5.9-9.1M22 4L12 14l-3-3",
  wait: "M5 22h14M5 2h14M17 22v-4.2a2 2 0 0 0-.6-1.4L12 12l-4.4 4.4a2 2 0 0 0-.6 1.4V22M7 2v4.2a2 2 0 0 0 .6 1.4L12 12l4.4-4.4a2 2 0 0 0 .6-1.4V2",
  alert: "M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01",
};
const ic = name => `<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="${ICONS[name]}"/></svg>`;

// История заказа: этапы по порядку; первый незавершённый подсвечен как текущий
const shortDate = s => String(s || "").replace(/\.20\d\d/, "");
function timelineHtml(steps) {
  const esc = x => String(x ?? "").replace(/[&<>"']/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"})[c]);
  const cur = steps.findIndex(x => !x.done);
  return `<ol class="tl" aria-label="История заказа">${steps.map((x, i) =>
    `<li class="${x.done ? "done" : i === cur ? "now" : ""}${x.warn ? " warn" : ""}"><b>${esc(x.label)}</b>` +
    `${x.when ? `<span class="mut num">${esc(shortDate(x.when))}</span>` : ""}</li>`).join("")}</ol>`;
}
