// Service worker курьера: принимает пуш без содержимого и сам собирает текст из таблицы.
// Ключ курьера приходит в адресе регистрации: sw.js?k=…
importScripts("config.js");
const KEY = new URL(self.location).searchParams.get("k");
const PAGE = `courier.html?k=${encodeURIComponent(KEY || "")}`;

self.addEventListener("push", e => e.waitUntil(notify()));

async function notify() {
  let title = "Новый заказ", body = "Откройте, чтобы посмотреть";
  try {
    const fresh = (await sheetApi({action: "list", key: KEY})).filter(r => r.status === "Новый").pop();
    if (fresh) {
      title = `Новый заказ ${fresh.cb}`;
      body = [fresh.packs, fresh.unload && fresh.unload !== "Нет" ? `разгрузка: ${fresh.unload}` : "",
        fresh.address].filter(Boolean).join(" · ");
    }
  } catch {}  // нет сети — всё равно показываем уведомление: iOS требует его на каждый пуш
  return self.registration.showNotification(title, {body, tag: "new-order", renotify: true, data: {url: PAGE}});
}

self.addEventListener("notificationclick", e => {
  e.notification.close();
  e.waitUntil(clients.matchAll({type: "window"}).then(ws =>
    ws.length ? ws[0].focus() : clients.openWindow(e.notification.data.url)));
});
