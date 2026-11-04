// Service worker курьера: принимает пуш без содержимого и сам собирает текст из таблицы.
// Ключ курьера приходит в адресе регистрации: sw.js?k=…
// Версия меняется вместе с дизайном и config.js — браузер видит новый sw.js и обновляет его (офлайн-кэша здесь нет).
const SW_VERSION = "v31-alarm";
importScripts("config.js?v=31");
const KEY = new URL(self.location).searchParams.get("k");
const PAGE = `courier.html?k=${encodeURIComponent(KEY || "")}`;

self.addEventListener("push", e => e.waitUntil(notify()));

// Новый заказ и повтор «примите заказ» — липкие: висят, пока не нажмут (requireInteraction; iOS это игнорирует),
// у каждого заказа свой tag, renotify — повтор снова звенит. Нажатие открывает экран тревоги: …#alert=<номер>.
const ALERT_VIBRATE = [500, 150, 500, 150, 900];
function courierNote(n) {
  const info = [n.packs, n.unload && n.unload !== "Нет" ? `разгрузка: ${n.unload}` : "", n.address].filter(Boolean).join(" · ");
  const alert = n.type === "new" || n.type === "repeat";
  const title = n.type === "remind" ? `🔔 Напоминание: ${n.cb}`
    : n.type === "repeat" ? `🚨 Примите заказ ${n.cb}${n.tries ? ` · ${n.tries}-й раз` : ""}` : `🚨 Новый заказ ${n.cb}`;
  const url = `${PAGE}&o=${encodeURIComponent(n.posting)}${alert ? `#alert=${encodeURIComponent(n.posting)}` : ""}`;
  return [title, {body: n.type === "remind" && n.text ? `${n.text}\n${info}` : alert ? `${info}\nНажмите, чтобы принять` : info,
    tag: `order-${n.posting}`, renotify: true, requireInteraction: alert, vibrate: ALERT_VIBRATE, data: {url}}];
}

async function notify() {
  let title = "Новый заказ", opts = {body: "Откройте, чтобы посмотреть", tag: "order", renotify: true, requireInteraction: true,
    vibrate: ALERT_VIBRATE, data: {url: PAGE}};
  try {
    const n = await sheetApi({action: "notice", key: KEY});  // что именно случилось: новый заказ, повтор или напоминание
    if (n && n.role === "owner") {  // для владельца: что сделал курьер
      title = n.title;
      opts = {body: n.text || "", tag: `owner-${n.type}-${n.posting || ""}`, renotify: true, data: {url: "./"}};
    } else if (n) {
      // повтор может касаться нескольких непринятых заказов — по уведомлению на каждый
      for (const m of n.more || []) await self.registration.showNotification(...courierNote(Object.assign({type: n.type}, m)));
      [title, opts] = courierNote(n);
    }
  } catch {
    try {  // скрипт таблицы старой версии без «notice» — как раньше, по последнему новому заказу
      const fresh = (await sheetApi({action: "list", key: KEY})).filter(r => r.status === "Новый").pop();
      if (fresh) [title, opts] = courierNote({type: "new", posting: fresh.posting, cb: fresh.cb, packs: fresh.packs, address: fresh.address});
    } catch {}  // нет сети — всё равно показываем уведомление: iOS требует его на каждый пуш
  }
  return self.registration.showNotification(title, opts);
}

self.addEventListener("notificationclick", e => {
  e.notification.close();
  const url = new URL(e.notification.data && e.notification.data.url || PAGE, self.registration.scope).href;
  const page = url.split("#")[0].split("?")[0];
  e.waitUntil(clients.matchAll({type: "window", includeUncontrolled: true}).then(async ws => {
    // уже открытое окно этой же страницы: фокус и переход на #alert — страница сама покажет экран тревоги
    const w = ws.find(x => x.url.split("#")[0].split("?")[0] === page) || ws[0];
    if (w) {
      try { await w.focus(); } catch {}
      try { return await w.navigate(url); } catch {}
    }
    return clients.openWindow(url);
  }));
});
