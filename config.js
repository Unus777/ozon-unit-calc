// Общие настройки страниц и service worker. Здесь нет секретов: доступ проверяет скрипт таблицы по ключу.
const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzMzytUhF-uTuVUAAgZPrlDDj9pPAzBuyNCytb_gv5Jryb3JGPLlj7uZ4SRgnUXd-jr/exec";  // веб-приложение Apps Script таблицы «Заказы озон»
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
  return `<details class="card report"><summary><span class="mut">${icon("wallet")} ${opts.title}</span>
<div class="v num ${rep.hasPayments && big <= 0 ? "green" : ""}">${rub(big)}</div>
<div class="mut">${rep.hasPayments ? `${opts.leftLabel} · начислено ${rub(rep.done.pay)} · выплачено ${rub(rep.paid)}` : "начислено за всё время"}</div>
<div class="mut">${plural(rep.done.n, "доставка", "доставки", "доставок")} · доставка ${rub(rep.done.delivery)} · разгрузка ${rub(rep.done.lift)}</div>
${rep.active.n ? `<div class="mut">В работе: ${plural(rep.active.n, "заказ", "заказа", "заказов")} на ${rub(rep.active.pay)}</div>` : ""}
<div class="more">Подробнее ▾</div></summary>
${rep.hasPayments ? `<h3>${icon("wallet")} Выплаты</h3>${form}${pays ? `<table>${pays}</table>` : '<p class="mut">Выплат пока не записано</p>'}`
    : opts.admin ? '<p class="mut">Чтобы учитывать выплаты, обновите скрипт таблицы.</p>' : ""}
<h3>По месяцам</h3><table>${months}</table></details>`;
}

// Декоративные иконки: текст рядом остаётся доступным для чтения.
function icon(name) {
  const shapes = {
    "phone": "<path d=\"M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3.1-8.7A2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 2 .7 2.9a2 2 0 0 1-.5 2.1L8 10a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.5c.9.3 1.9.6 2.9.7a2 2 0 0 1 1.7 2Z\"/>",
    "calendar": "<rect x=\"3\" y=\"5\" width=\"18\" height=\"16\" rx=\"2\"/><path d=\"M16 3v4M8 3v4M3 11h18m-13 5h2m4 0h2\"/>",
    "clock": "<circle cx=\"12\" cy=\"12\" r=\"9\"/><path d=\"M12 7v5l3 2\"/>",
    "note": "<path d=\"M14 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-9M9 15l1-4 9-9 3 3-9 9-4 1Z\"/>",
    "pin": "<path d=\"M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z\"/><circle cx=\"12\" cy=\"10\" r=\"2.5\"/>",
    "route": "<path d=\"m3 11 18-8-8 18-2-8-8-2Z\"/>",
    "check": "<circle cx=\"12\" cy=\"12\" r=\"9\"/><path d=\"m8 12 3 3 5-6\"/>",
    "wallet": "<path d=\"M20 8V5a2 2 0 0 0-2-2H6a3 3 0 0 0 0 6h14v12H6a3 3 0 0 1-3-3V6m17 6h-5v5h5\"/><path d=\"M17 14.5h.01\"/>",
    "refresh": "<path d=\"M20 7v5h-5M4 17v-5h5M6.1 7a7 7 0 0 1 11.6-1L20 9M4 15l2.3 3A7 7 0 0 0 18 17\"/>",
    "settings": "<path d=\"M12 3v3m0 12v3M3 12h3m12 0h3M5.6 5.6l2.1 2.1m8.6 8.6 2.1 2.1M5.6 18.4l2.1-2.1m8.6-8.6 2.1-2.1\"/><circle cx=\"12\" cy=\"12\" r=\"6\"/><circle cx=\"12\" cy=\"12\" r=\"2\"/>",
    "box": "<path d=\"m12 3 9 5v9l-9 5-9-5V8l9-5Zm0 9v10M3 8l9 4 9-4M7.5 5.5l9 5\"/>",
    "truck": "<path d=\"M1 4h13v13H1zM14 9h4l4 4v4h-8\"/><circle cx=\"5\" cy=\"19\" r=\"2\"/><circle cx=\"18\" cy=\"19\" r=\"2\"/>",
    "bell": "<path d=\"M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4\"/>"
};
  return `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${shapes[name] || ""}</svg>`;
}
