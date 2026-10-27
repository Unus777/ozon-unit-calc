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
  clearTimeout(t.timer);
  t.timer = setTimeout(() => t.classList.remove("show"), bad ? 5000 : 2500);
}
