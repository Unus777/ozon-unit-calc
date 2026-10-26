// Service worker курьера: принимает пуш без содержимого и сам собирает текст из таблицы.
// Ключ курьера приходит в адресе регистрации: sw.js?k=…
importScripts("config.js");
const KEY = new URL(self.location).searchParams.get("k");
const PAGE = `courier.html?k=${encodeURIComponent(KEY || "")}`;

self.addEventListener("push", e => e.waitUntil(notify()));

async function notify() {
  let title = "Новый заказ", body = "Откройте, чтобы посмотреть", url = PAGE;
  try {
    const n = await sheetApi({action: "notice", key: KEY});  // что именно случилось: новый заказ или напоминание
    if (n) {
      const info = [n.packs, n.unload && n.unload !== "Нет" ? `разгрузка: ${n.unload}` : "", n.address].filter(Boolean).join(" · ");
      title = n.type === "remind" ? `🔔 Напоминание: ${n.cb}` : `Новый заказ ${n.cb}`;
      body = n.type === "remind" && n.text ? `${n.text}\n${info}` : info;
      url = `${PAGE}&o=${encodeURIComponent(n.posting)}`;
    }
  } catch {
    try {  // скрипт таблицы старой версии без «notice» — как раньше, по последнему новому заказу
      const fresh = (await sheetApi({action: "list", key: KEY})).filter(r => r.status === "Новый").pop();
      if (fresh) { title = `Новый заказ ${fresh.cb}`; body = [fresh.packs, fresh.address].filter(Boolean).join(" · "); }
    } catch {}  // нет сети — всё равно показываем уведомление: iOS требует его на каждый пуш
  }
  return self.registration.showNotification(title, {body, tag: "order", renotify: true, data: {url}});
}

self.addEventListener("notificationclick", e => {
  e.notification.close();
  e.waitUntil(clients.matchAll({type: "window"}).then(ws =>
    ws.length ? ws[0].navigate(e.notification.data.url).then(w => w && w.focus()) : clients.openWindow(e.notification.data.url)));
});
