// Service worker курьера: принимает пуш без содержимого и сам собирает текст из таблицы.
// Ключ курьера приходит в адресе регистрации: sw.js?k=…
// Версия меняется вместе с дизайном и config.js — браузер видит новый sw.js и обновляет его (офлайн-кэша здесь нет).
const SW_VERSION = "v33-push";
importScripts("config.js?v=32");
const KEY = new URL(self.location).searchParams.get("k");
const PAGE = `courier.html?k=${encodeURIComponent(KEY || "")}`;

self.addEventListener("push", e => e.waitUntil(notify()));

// Новый заказ — максимально заметный пуш: крупный заголовок, баннер (Android/компьютер), кнопки «✅ Принял» / «Открыть»,
// липкий (requireInteraction; iOS игнорирует), свой tag на заказ, renotify, длинная вибрация.
// Ночью по Москве (NIGHT_FROM–NIGHT_TO) пуш обычный (не silent): звук или только вибрацию решают настройки телефона
// (беззвучный режим / фокус «Сон» — только вибрация). Экран тревоги в открытом приложении ночью — без звука, с вибрацией.
// Скрипт таблицы шлёт пуш без содержимого: поля берём из «notice» (type, posting, cb, packs, address, unload),
// время доставки и число непринятых — из списка, если он доступен. Любого поля может не быть.
const ALERT_VIBRATE = [500, 200, 500, 200, 800];
const ICON = "icons/courier-192.png", BADGE = "icons/badge-96.png", BANNER = "icons/push-new-order.png";
const when = r => {
  if (!r) return "";
  const t = deliveryDetails(r.comment).time;
  const d = r.date ? (r.date === new Intl.DateTimeFormat("ru-RU", {timeZone: "Europe/Moscow", day: "2-digit", month: "2-digit", year: "numeric"}).format(new Date()) ? "сегодня" : r.date.slice(0, 5)) : "";
  return [d, t].filter(Boolean).join(" ");
};
function courierNote(n, row, night = isNight()) {
  const alert = n.type === "new" || n.type === "repeat" || !n.type;
  const id = n.posting ? encodeURIComponent(n.posting) : "";
  const url = `${PAGE}${id ? `&o=${id}` : ""}${alert && id ? `#alert=${id}` : ""}`;
  if (!alert) {  // напоминание владельца — обычное уведомление
    const info = [n.packs, n.unload && n.unload !== "Нет" ? `разгрузка: ${n.unload}` : "", n.address].filter(Boolean).join(" · ");
    return [`🔔 Напоминание${n.cb ? ": " + n.cb : ""}`, {body: n.text ? `${n.text}\n${info}` : info, tag: `order-${n.posting || "remind"}`,
      renotify: true, icon: ICON, badge: BADGE, data: {url, posting: n.posting || ""}}];
  }
  const body = [n.address || (row && row.address), n.packs || (row && row.packs), when(row)].filter(Boolean).join(" · ") || "Откройте, чтобы посмотреть";
  const opts = {body: `${body}\n${night ? "🌙 Ночной режим · нажмите «✅ Принял»" : "Нажмите «✅ Принял»"}`,
    tag: `order-${n.posting || "new"}`, renotify: true, requireInteraction: true, vibrate: ALERT_VIBRATE,
    icon: ICON, badge: BADGE, image: BANNER, timestamp: Date.now(),
    actions: [{action: "accept", title: "✅ Принял"}, {action: "open", title: "Открыть"}],
    data: {url, posting: n.posting || ""}};
  return [`🚨 НОВЫЙ ЗАКАЗ${n.cb ? " · " + n.cb : ""}`, opts];
}

async function badgeCount(rows) {  // значок на иконке приложения: сколько заказов ждут «Принял» (iOS 16.4+, Android, компьютер)
  try {
    const nav = self.navigator;
    if (!nav || !nav.setAppBadge || !rows) return;
    const n = rows.filter(r => r.status === "Новый" && !isAccepted(r)).length;
    await (n ? nav.setAppBadge(n) : nav.clearAppBadge());
  } catch {}
}

async function notify() {
  let title = "🚨 НОВЫЙ ЗАКАЗ", opts = courierNote({type: "new"}, null)[1];
  let rows = null;
  try {
    const n = await sheetApi({action: "notice", key: KEY});  // что именно случилось: новый заказ или напоминание
    if (n && n.role === "owner") {  // для владельца: что сделал курьер
      title = n.title;
      opts = {body: n.text || "", tag: `owner-${n.type}-${n.posting || ""}`, renotify: true, icon: "icons/owner-192.png", badge: BADGE, data: {url: "./"}};
    } else if (n) {
      try { rows = await sheetApi({action: "list", key: KEY}); } catch {}
      const find = p => rows && rows.find(r => String(r.posting) === String(p));
      for (const m of n.more || []) await self.registration.showNotification(...courierNote(Object.assign({type: n.type}, m), find(m.posting)));
      [title, opts] = courierNote(n, find(n.posting));
    }
  } catch {
    try {  // скрипт таблицы старой версии без «notice» — как раньше, по последнему новому заказу
      rows = await sheetApi({action: "list", key: KEY});
      const fresh = rows.filter(r => r.status === "Новый").pop();
      if (fresh) [title, opts] = courierNote({type: "new", posting: fresh.posting, cb: fresh.cb, packs: fresh.packs, address: fresh.address}, fresh);
    } catch {}  // нет сети — всё равно показываем уведомление: iOS требует его на каждый пуш
  }
  await badgeCount(rows);
  return self.registration.showNotification(title, opts);
}

self.addEventListener("notificationclick", e => {
  e.notification.close();
  const data = e.notification.data || {};
  let link = data.url || PAGE;
  // «✅ Принял» прямо из уведомления: страница сама запишет «Принял: …», экран тревоги не покажется
  if (e.action === "accept" && data.posting) link = `${link.split("#")[0]}#alert=${encodeURIComponent(data.posting)}&accept=1`;
  const url = new URL(link, self.registration.scope).href;
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
