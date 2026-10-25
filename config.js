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
