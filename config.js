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

// Расчёт с курьером по строкам листа «Доставки»: доставленные — к выплате, «Новый»/«Согласован» — в работе.
const num = x => Number(String(x ?? "").replace(/[^\d.-]/g, "")) || 0;
const MONTHS = ["январь", "февраль", "март", "апрель", "май", "июнь", "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь"];

function deliveryReport(rows) {
  const sum = list => ({n: list.length, delivery: list.reduce((a, r) => a + num(r.delivery), 0),
    lift: list.reduce((a, r) => a + num(r.lift), 0), pay: list.reduce((a, r) => a + num(r.pay), 0)});
  const done = rows.filter(r => r.status === "Доставлен");
  const byMonth = {};
  for (const r of done) {
    const m = /(\d\d)\.(\d{4})/.exec(r.delivered_at || r.sent);  // месяц доставки, у старых — месяц заказа
    const key = m ? `${m[2]}-${m[1]}` : "—";
    (byMonth[key] = byMonth[key] || []).push(r);
  }
  return {
    done: sum(done),
    active: sum(rows.filter(r => r.status === "Новый" || r.status === "Согласован")),
    months: Object.keys(byMonth).sort().reverse().map(k => ({
      label: k === "—" ? "без даты" : `${MONTHS[+k.slice(5) - 1]} ${k.slice(0, 4)}`, ...sum(byMonth[k])})),
  };
}

const plural = (n, one, few, many) =>
  `${n} ${n % 10 === 1 && n % 100 !== 11 ? one : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? few : many}`;

function reportHtml(rep, title) {
  const rub = x => Math.round(x).toLocaleString("ru-RU").replace(/ /g, " ") + " ₽";
  const months = rep.months.map(m => `<tr><td>${m.label}<div class="mut">${plural(m.n, "доставка", "доставки", "доставок")} · доставка ${rub(m.delivery)} · разгрузка ${rub(m.lift)}</div></td><td>${rub(m.pay)}</td></tr>`).join("");
  return `<details class="card report"><summary><span class="mut">${title}</span>
<div class="v num">${rub(rep.done.pay)}</div>
<div class="mut">${plural(rep.done.n, "доставка", "доставки", "доставок")} · доставка ${rub(rep.done.delivery)} · разгрузка ${rub(rep.done.lift)}</div>
${rep.active.n ? `<div class="mut">В работе: ${plural(rep.active.n, "заказ", "заказа", "заказов")} на ${rub(rep.active.pay)}</div>` : ""}
<div class="more">По месяцам ▾</div></summary><table>${months}</table></details>`;
}
