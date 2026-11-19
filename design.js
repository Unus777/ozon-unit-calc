const ICONS = {
  grid: '<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>',
  package: '<path d="m21 8-9-5-9 5 9 5 9-5Z"/><path d="m3 8 9 5 9-5v9l-9 5-9-5V8Z"/><path d="M12 13v9"/>',
  route: '<circle cx="6" cy="19" r="3"/><circle cx="18" cy="5" r="3"/><path d="M6 16V9a4 4 0 0 1 4-4h5M9 19h5a4 4 0 0 0 4-4V8"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  wallet: '<path d="M20 7V5a2 2 0 0 0-2-2H5a3 3 0 0 0 0 6h15v12H5a3 3 0 0 1-3-3V6"/><path d="M16 13h2"/>',
  truck: '<path d="M10 17h4V5H2v12h3M14 9h4l4 4v4h-3M14 17h3"/><circle cx="7.5" cy="17.5" r="2.5"/><circle cx="16.5" cy="17.5" r="2.5"/>',
  switch: '<path d="m17 3 4 4-4 4M3 7h18M7 21l-4-4 4-4M21 17H3"/>',
  "chevron-right": '<path d="m9 18 6-6-6-6"/>',
  "chevron-down": '<path d="m6 9 6 6 6-6"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
  refresh: '<path d="M20 6v5h-5M4 18v-5h5"/><path d="M18.5 9a7 7 0 0 0-12-3L4 8M5.5 15a7 7 0 0 0 12 3l2.5-2"/>',
  bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M10 21h4"/>',
  moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8Z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.66 6.34l1.41-1.41"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  download: '<path d="M12 3v12M7 10l5 5 5-5M4 21h16"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  alert: '<path d="M10.3 3.7 2.2 18a2 2 0 0 0 1.7 3h16.2a2 2 0 0 0 1.7-3L13.7 3.7a2 2 0 0 0-3.4 0ZM12 9v4M12 17h.01"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  "check-circle": '<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',
  pin: '<path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/>',
  phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2Z"/>',
  edit: '<path d="M12 20h9M16.5 3.5a2 2 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  navigation: '<path d="m3 11 19-9-9 19-2-8Z"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/>',
  home: '<path d="m3 11 9-8 9 8v10h-6v-6H9v6H3V11Z"/>',
  history: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5M12 7v5l3 2"/>',
  cash: '<rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="12" cy="12" r="3"/><path d="M7 10H6v1M17 14h1v-1"/>',
  scale: '<path d="M12 3v18M5 6h14M5 6l-3 7h6L5 6ZM19 6l-3 7h6l-3-7ZM8 21h8"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="m9 12 2 2 4-4"/>',
  play: '<path d="m8 5 11 7-11 7V5Z"/>',
  flag: '<path d="M5 22V4M5 4h12l-2 4 2 4H5"/>',
};

const icon = name => `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ICONS.package}</svg>`;
const esc = value => String(value ?? "").replace(/[&<>"']/g, char => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"})[char]);
const money = value => `${Math.round(Number(value) || 0).toLocaleString("ru-RU")} ₽`;
const plural = (n, one, few, many) => `${n} ${n % 10 === 1 && n % 100 !== 11 ? one : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? few : many}`;
const todayLabel = () => new Intl.DateTimeFormat("ru-RU", {day: "numeric", month: "long", weekday: "long"}).format(new Date());

let mapPoints = [];
const CONCEPT_DEPOT = {name: "квартал Щитниково, 3Ж", lat: 55.816013, lon: 37.844068};
let orders = [
  {id: "ЦБ-1048", posting: "04382190-0112-1", customer: "Алексей", phone: "+7 900 123-45-67", address: "Москва, ул. Зорге, 21", area: "Москва · 12,4 км от склада", product: "Миррор Вайт 60×120", packs: 12, weight: 336, pay: 3200, status: "in_transit", date: "Сегодня", time: "10:00–12:00", unload: "Лифт · 4 этаж", note: "Позвонить прорабу за 30 минут до приезда.", foreman: "+7 900 555-01-24", distance: 12.4, type: "rfbs"},
  {id: "ЦБ-1049", posting: "05129044-0084-1", customer: "Марина", phone: "+7 900 234-56-78", address: "Балашиха, проспект Ленина, 32", area: "Балашиха · 8,1 км от склада", product: "Георгия Полиш 60×60", packs: 16, weight: 448, pay: 1800, status: "assigned", date: "Сегодня", time: "12:30–14:30", unload: "Без подъёма", note: "Въезд со двора, шлагбаум откроет охрана.", foreman: "", distance: 8.1, type: "rfbs"},
  {id: "", posting: "06813305-0021-2", customer: "Дмитрий", phone: "+7 900 345-67-89", address: "Москва, ул. Кунцевская, 19", area: "Москва · 31,8 км от склада", product: "Патриция Стоун 60×60", packs: 8, weight: 224, pay: 2400, status: "waiting_cb", date: "Сегодня", time: "15:00–17:00", unload: "Лестница · 2 этаж", note: "Нужна накладная ЦБ перед передачей курьеру.", foreman: "+7 900 555-09-12", distance: 31.8, type: "rfbs"},
  {id: "ЦБ-1050", posting: "0221995810-0012", customer: "ППЗ Ozon", phone: "", address: "Балашиха, ул. Реутовская, 5", area: "ППЗ Ozon · 6,3 км от склада", product: "Арктик Карвинг 60×60", packs: 3, weight: 84, pay: 500, status: "assigned", date: "Сегодня", time: "12:00–18:00", unload: "Сдача в ППЗ", note: "Сдать по штрихкоду на коробке.", foreman: "", distance: 6.3, type: "fbs"},
  {id: "", posting: "07142218-0033-1", customer: "Ольга", phone: "+7 900 456-78-90", address: "Красногорск, бульвар Строителей, 7", area: "Красногорск · 44,2 км от склада", product: "Бетон Крем 60×120", packs: 20, weight: 560, pay: 4200, status: "waiting_cb", date: "Завтра", time: "10:00–13:00", unload: "Лифт · 7 этаж", note: "Предварительно согласовать пропуск для машины.", foreman: "+7 900 555-03-18", distance: 44.2, type: "rfbs"},
  {id: "ЦБ-1051", posting: "01930412-0017-1", customer: "Сергей", phone: "+7 900 567-89-01", address: "Дмитров, Советская площадь, 1", area: "Дмитров · 61,7 км от склада", product: "Томас Грей 60×120", packs: 4, weight: 112, pay: 3600, status: "assigned", date: "Завтра", time: "11:00–14:00", unload: "Без подъёма", note: "", foreman: "", distance: 61.7, type: "rfbs"},
  {id: "ЦБ-1047", posting: "50125266-0408-1", customer: "Игорь", phone: "+7 900 678-90-12", address: "Павловский Посад, ул. Герцена, 14", area: "Павловский Посад · 52 км", product: "Оникс Грей Мат 60×60", packs: 14, weight: 392, pay: 4500, status: "delivered", date: "Сегодня", time: "09:42", unload: "Лифт · 3 этаж", note: "", foreman: "", distance: 52, type: "rfbs"},
  {id: "ЦБ-1046", posting: "98310122-0341-1", customer: "Наталья", phone: "+7 900 789-01-23", address: "Химки, ул. Молодёжная, 8", area: "Химки · 39,5 км", product: "Лилия Беж 60×60", packs: 10, weight: 280, pay: 2500, status: "delivered", date: "Сегодня", time: "08:55", unload: "Без подъёма", note: "", foreman: "", distance: 39.5, type: "rfbs"},
];

const CONCEPT_LL = {
  "04382190-0112-1": [55.7755, 37.5045], "05129044-0084-1": [55.7965, 37.9382], "06813305-0021-2": [55.7308, 37.4455],
  "07142218-0033-1": [55.8204, 37.3298], "01930412-0017-1": [56.3445, 37.5204], "50125266-0408-1": [55.7812, 38.6504],
  "98310122-0341-1": [55.8974, 37.4502]
};
for (const order of orders) { const ll = CONCEPT_LL[order.posting]; if (ll) { order.lat = ll[0]; order.lon = ll[1]; } }
let finance = {accrued: 130357, paid: 102540};
let payments = [
  {id: 1, amount: 52540, date: "18 октября 2026", comment: "Выплата за 5–18 октября"},
  {id: 2, amount: 50000, date: "5 октября 2026", comment: "Перевод на карту"},
];

const state = {
  role: location.hash === "#courier" ? "courier" : "owner",
  view: location.hash === "#courier" ? "today" : "overview",
  filter: "all",
  query: "",
  routeStarted: false,
  optimized: false,
};

const NAV = {
  owner: [["overview", "grid", "Обзор"], ["orders", "package", "Заказы"], ["route", "route", "Маршрут"], ["couriers", "users", "Курьеры"], ["finance", "wallet", "Финансы"]],
  courier: [["today", "home", "Сегодня"], ["route", "route", "Маршрут"], ["history", "history", "Готово"], ["finance", "wallet", "Выплаты"]],
};

const activeOrders = () => orders.filter(order => !["delivered", "cancelled"].includes(order.status));
const waitingOrders = () => orders.filter(order => order.status === "waiting_cb");
const routeOrders = () => orders.filter(order => order.type !== "fbs" && ["assigned", "in_transit", "arrived"].includes(order.status));
const owed = () => Math.max(0, finance.accrued - finance.paid);
const sum = (list, key) => list.reduce((total, order) => total + order[key], 0);

function hydrateIcons(root = document) {
  root.querySelectorAll("[data-icon]").forEach(element => { element.innerHTML = icon(element.dataset.icon); });
}

function statusInfo(order) {
  if (order.status === "delivered") return ["delivered", order.type === "fbs" ? "Сдан в ППЗ" : "Доставлен"];
  if (order.status === "waiting_cb") return ["waiting_cb", "Ждёт ЦБ"];
  if (order.status === "arrived") return ["arrived", order.type === "fbs" ? "На месте · ППЗ" : "На месте"];
  if (order.type === "fbs") return ["fbs", order.status === "in_transit" ? "В пути в ППЗ" : "FBS · ППЗ"];
  if (order.status === "in_transit") return ["in_transit", "В пути"];
  return ["assigned", "Назначен"];
}

function statusPill(order) {
  const [className, label] = statusInfo(order);
  return `<span class="status-pill ${className}">${esc(label)}</span>`;
}

function pageHead(title, subtitle, actions = "", eyebrow = todayLabel()) {
  return `<div class="page-head"><div><div class="eyebrow">${esc(eyebrow)}</div><h1>${esc(title)}</h1><p>${esc(subtitle)}</p></div><div class="page-actions">${actions}</div></div>`;
}

function metricCard(label, value, foot, iconName, color = "", cardClass = "", suffix = "") {
  const numeric = typeof value === "number";
  return `<article class="metric-card ${cardClass}"><div class="metric-top"><span>${esc(label)}</span><span class="metric-icon ${color}">${icon(iconName)}</span></div><div class="metric-value" ${numeric ? `data-count="${value}" data-suffix="${esc(suffix)}"` : ""}>${numeric ? `0${esc(suffix)}` : value}</div><div class="metric-foot">${foot}</div></article>`;
}

function orderRows(list) {
  if (!list.length) return `<div class="empty-state"><div class="empty-icon">${icon("search")}</div><h3>Ничего не найдено</h3><p>Измените фильтр или поисковый запрос.</p></div>`;
  return `<div class="order-table-head"><span>Заказ</span><span>Адрес</span><span>Товар</span><span>Когда</span><span>Статус</span><span style="text-align:right">Курьеру</span><span></span></div>${list.map(order => {
    const cbClass = order.status === "waiting_cb" ? "waiting" : order.type === "fbs" ? "fbs" : "";
    return `<button class="order-row" data-open-order="${esc(order.posting)}"><span class="order-id"><span class="cb-tile ${cbClass}">${esc(order.id || "Нет ЦБ")}</span><span><strong>${esc(order.customer)}</strong><small>${esc(order.posting)}</small></span></span><span class="order-address"><strong>${esc(order.address)}</strong><span>${esc(order.area)}</span></span><span class="order-product"><strong>${esc(order.product)}</strong><span>${order.packs} уп · ${order.weight} кг</span></span><span class="order-time"><strong>${esc(order.date)}</strong><span>${esc(order.time)}</span></span>${statusPill(order)}<span class="order-pay">${money(order.pay)}</span><span class="row-chevron">${icon("chevron-right")}</span></button>`;
  }).join("")}`;
}

function filteredOrders() {
  const query = state.query.trim().toLowerCase();
  return orders.filter(order => {
    const matchesFilter = state.filter === "all" ||
      (state.filter === "active" && !["delivered", "cancelled"].includes(order.status)) ||
      state.filter === order.status || (state.filter === "fbs" && order.type === "fbs");
    const haystack = [order.id, order.posting, order.address, order.product, order.customer].join(" ").toLowerCase();
    return matchesFilter && (!query || haystack.includes(query));
  });
}

function mapMarkup(list) {
  mapPoints = list.filter(order => order.type !== "fbs" && order.lat && order.lon);
  return `<div class="map-canvas live-map" role="region" aria-label="Карта маршрута"></div>`;
}

function managerShiftCard() {
  const route = routeOrders();
  const weight = sum(route, "weight");
  const capacity = Math.min(100, Math.round(weight / 1500 * 100));
  const completed = orders.filter(order => order.status === "delivered").length;
  const total = route.length + completed;
  const progress = total ? Math.round(completed / total * 100) : 0;
  return `<article class="shift-card"><div class="shift-top"><div><span class="avatar driver-avatar">Р</span><span><strong>Смена Рашада</strong><small>На связи · 2 минуты назад</small></span></div><span class="shift-live">В пути</span></div><div class="shift-body"><div class="progress-ring" style="--progress:${progress}"><span>${progress}%</span></div><div class="shift-stats"><div class="shift-stat"><strong>${route.length}</strong><span>точек<br>осталось</span></div><div class="shift-stat"><strong>${sum(route, "packs")}</strong><span>упаковок<br>в машине</span></div><div class="shift-stat"><strong>${money(sum(route, "pay"))}</strong><span>за активные<br>рейсы</span></div></div></div><div class="capacity"><div class="capacity-head"><span>Загрузка автомобиля</span><strong>${weight.toLocaleString("ru-RU")} / 1 500 кг</strong></div><div class="progress-track"><span style="width:${capacity}%"></span></div></div></article>`;
}

function attentionCard() {
  const waiting = waitingOrders();
  return `<article class="card attention-card"><div class="card-head"><div><h2>Фокус менеджера</h2><p>Только то, что требует действия</p></div><span class="attention-count">3</span></div><div class="attention-list"><button class="attention-item" data-action="filter-waiting"><span class="attention-symbol">${icon("edit")}</span><span class="attention-copy"><strong>Заполнить ${plural(waiting.length, "номер ЦБ", "номера ЦБ", "номеров ЦБ")}</strong><span>Заказы не попадут курьеру без накладной</span></span>${icon("chevron-right")}</button><button class="attention-item" data-open-order="0221995810-0012"><span class="attention-symbol purple">${icon("clock")}</span><span class="attention-copy"><strong>FBS остаётся на складе</strong><span>ЦБ-1050 не уходит Рашаду</span></span>${icon("chevron-right")}</button><button class="attention-item" data-view="route"><span class="attention-symbol green">${icon("calendar")}</span><span class="attention-copy"><strong>Завтра запланированы 2 точки</strong><span>24 упаковки · 672 кг · выезд в 09:00</span></span>${icon("chevron-right")}</button></div></article>`;
}

function overviewView() {
  const active = activeOrders();
  const waiting = waitingOrders();
  const route = routeOrders();
  const deliveredToday = orders.filter(order => order.status === "delivered" && order.date === "Сегодня").length;
  const inTransit = orders.filter(order => order.status === "in_transit").length;
  const preview = [...active, ...orders.filter(order => order.status === "delivered")].slice(0, 5);
  return `${pageHead("Центр доставок", waiting.length ? `Смена идёт по плану. Есть ${plural(waiting.length, "задача", "задачи", "задач")} для вас.` : "Все заказы и курьер в одном окне.", `<button class="button secondary" data-action="export">${icon("download")}Отчёт</button><button class="button" data-action="new-order">${icon("plus")}Новая доставка</button>`)}
  <section class="stats-grid">
    ${metricCard("Заказы в работе", active.length, `${sum(active, "packs")} упаковки в текущей смене`, "package")}
    ${metricCard("В пути сейчас", inTransit, `<span class="live-mini">Рашад · едет на Зорге</span>`, "truck", "blue", "blue")}
    ${metricCard("Ждут номера ЦБ", waiting.length, waiting.length ? `<span class="warning">${icon("alert")}Нужно заполнить накладные</span>` : `<span class="positive">Все накладные готовы</span>`, "alert", "orange", "warning")}
    ${metricCard("Доставлено сегодня", `${deliveredToday} <span style="color:var(--muted);font-size:16px;font-weight:600">/ ${orders.length}</span>`, `<span class="positive">${icon("check")}Смена идёт по плану</span>`, "check-circle", "green", "success")}
  </section>
  <section class="overview-grid"><article class="card map-card"><div class="map-head"><div><h2>Маршрут смены</h2><p>${plural(route.length, "активная точка", "активные точки", "активных точек")} · ${sum(route, "packs")} упаковок · ${sum(route, "weight")} кг</p></div>${statusPill({status: "in_transit", type: "rfbs"})}</div>${mapMarkup(route)}<div class="route-footer"><span class="avatar driver-avatar">Р</span><div class="route-next"><strong>Следующая: ул. Зорге, 21</strong><span>10:00–12:00 · 12 упаковок · лифт</span></div><div class="route-progress-mini"><span>2 из 6 точек</span><div class="progress-track"><span style="width:33%"></span></div></div><button class="button small secondary" data-view="route">Маршрут ${icon("arrow")}</button></div></article><div class="focus-column">${managerShiftCard()}${attentionCard()}</div></section>
  <section class="card orders-card"><div class="card-head"><div><h2>Заказы сегодня</h2><p>Нажмите на строку, чтобы увидеть детали и действия</p></div><button class="text-button" data-view="orders">Все заказы ${icon("arrow")}</button></div><div>${orderRows(preview)}</div></section>`;
}

function ordersView() {
  const filters = [["all", "Все", orders.length], ["active", "Активные", activeOrders().length], ["waiting_cb", "Ждут ЦБ", waitingOrders().length], ["fbs", "FBS · ППЗ", orders.filter(order => order.type === "fbs").length], ["delivered", "Доставлены", orders.filter(order => order.status === "delivered").length]];
  const list = filteredOrders();
  return `${pageHead("Заказы", `${orders.length} заказов · поиск по ЦБ, отправлению, адресу и товару`, `<button class="button secondary" data-action="export">${icon("download")}Экспорт</button><button class="button" data-action="new-order">${icon("plus")}Добавить</button>`, "Диспетчерская")}
  <div class="toolbar"><div class="filter-chips">${filters.map(([key, label, count]) => `<button class="filter-chip ${state.filter === key ? "active" : ""}" data-filter="${key}">${label}<span>${count}</span></button>`).join("")}</div><span class="toolbar-note">Найдено: ${list.length}</span></div>
  <section class="card orders-card" style="margin-top:0">${orderRows(list)}</section>`;
}

function routeView() {
  let list = routeOrders();
  if (state.optimized) list = [...list].sort((a, b) => a.distance - b.distance);
  const distance = sum(list, "distance");
  const packs = sum(list, "packs");
  const weight = sum(list, "weight");
  return `${pageHead(state.role === "courier" ? "Мой маршрут" : "Маршрут смены", `${plural(list.length, "активная точка", "активные точки", "активных точек")} · порядок объезда можно оптимизировать`, `<button class="button secondary" data-action="optimize">${icon("route")}${state.optimized ? "Маршрут оптимален" : "Оптимизировать"}</button>`, "Навигация по смене")}
  <section class="route-layout"><article class="card map-card">${mapMarkup(list)}</article><article class="card route-side"><div class="route-summary"><div><strong>${Math.round(distance)} км</strong><span>дистанция</span></div><div><strong>${packs} уп</strong><span>${weight} кг</span></div><div><strong>~${Math.max(1, Math.round(distance / 28 + list.length * .35))} ч</strong><span>с разгрузкой</span></div></div><div class="route-stops">${list.map((order, index) => `<button class="route-stop" data-open-order="${esc(order.posting)}"><span class="stop-number">${index + 1}</span><span class="stop-copy"><strong>${esc(order.id)} · ${esc(order.address)}</strong><span>${esc(order.time)} · ${order.packs} уп · ${esc(order.unload)}</span></span><span class="stop-distance">${String(order.distance).replace(".", ",")} км</span></button>`).join("")}</div><div class="route-actions"><button class="button big full ${state.routeStarted ? "accent" : ""}" data-action="start-route">${icon("navigation")}${state.routeStarted ? "Маршрут построен" : "Построить весь маршрут"}</button><button class="button secondary full" data-action="copy-link">${icon("copy")}Скопировать ссылку курьеру</button></div></article></section>`;
}

function couriersView() {
  const route = routeOrders();
  const weight = sum(route, "weight");
  const capacity = Math.min(100, Math.round(weight / 1500 * 100));
  return `${pageHead("Курьеры", "Загрузка, смена и контакт в одном месте", `<button class="button secondary" data-action="copy-link">${icon("copy")}Ссылка курьеру</button>`, "Команда доставки")}
  <section class="courier-grid"><article class="card courier-profile"><div class="courier-profile-top"><div class="avatar driver-avatar">Р</div><div><h2>Рашад</h2><p>Основной курьер · автомобиль до 1,5 т</p></div><span class="status-pill delivered">На смене</span></div><div class="capacity"><div class="capacity-head"><strong>Загрузка автомобиля</strong><span>${weight} из 1 500 кг</span></div><div class="progress-track"><span style="width:${capacity}%"></span></div><div class="capacity-note">Свободно ещё ${Math.max(0, 1500 - weight)} кг · ограничение учитывается при добавлении заказов</div></div><div class="courier-metrics"><div class="courier-metric"><strong>${route.length}</strong><span>активных заказов</span></div><div class="courier-metric"><strong>${sum(route, "packs")}</strong><span>упаковок в работе</span></div><div class="courier-metric"><strong>${money(owed())}</strong><span>осталось выплатить</span></div></div></article><article class="card"><div class="card-head"><h3>Быстрые действия</h3></div><div class="quick-actions"><button class="quick-action" data-view="route"><span>${icon("route")}</span><strong>Маршрут смены</strong></button><button class="quick-action" data-action="call"><span>${icon("phone")}</span><strong>Позвонить</strong></button><button class="quick-action" data-action="new-order"><span>${icon("plus")}</span><strong>Дать заказ</strong></button><button class="quick-action" data-view="finance"><span>${icon("wallet")}</span><strong>Выплаты</strong></button></div></article></section>
  <section class="card orders-card"><div class="card-head"><div><h2>Заказы Рашада</h2><p>Только активные доставки текущей смены</p></div><button class="text-button" data-view="orders">Все заказы ${icon("arrow")}</button></div>${orderRows(route)}</section>`;
}

function financeView() {
  const doneCount = orders.filter(order => order.status === "delivered").length;
  return `${pageHead(state.role === "courier" ? "Мои выплаты" : "Финансы курьера", "Начисления за доставку, разгрузку и история выплат", state.role === "owner" ? `<button class="button secondary" data-action="export">${icon("download")}Скачать отчёт</button><button class="button" data-action="payment">${icon("plus")}Записать выплату</button>` : "", "Прозрачные расчёты")}
  <section class="finance-hero"><div class="finance-balance primary-balance"><span>${state.role === "courier" ? "К выплате за смены" : "Осталось выплатить Рашаду"}</span><strong>${money(owed())}</strong><small>Остаток обновляется после каждой выплаты</small></div><div class="finance-balance"><span>Начислено всего</span><strong>${money(finance.accrued)}</strong><small>Доставка + подъём + FBS</small></div><div class="finance-balance"><span>Выплачено</span><strong>${money(finance.paid)}</strong><small>${payments.length} записанные выплаты</small></div></section>
  <section class="finance-layout"><article class="card"><div class="card-head"><div><h2>История выплат</h2><p>Все операции сохраняются в общем журнале</p></div></div>${payments.map(payment => `<div class="payment-row"><span class="payment-icon">${icon("cash")}</span><div class="payment-copy"><strong>${esc(payment.comment)}</strong><span>${esc(payment.date)} · Рашад</span></div><span class="payment-amount">−${money(payment.amount)}</span></div>`).join("")}</article><article class="card finance-info"><h3>Сводка за ноябрь</h3><div class="info-row"><span>Доставлено в прототипе</span><strong>${doneCount} заказа</strong></div><div class="info-row"><span>Доставка</span><strong>${money(92540)}</strong></div><div class="info-row"><span>Подъём и разгрузка</span><strong>${money(28400)}</strong></div><div class="info-row"><span>Доставки в ППЗ</span><strong>${money(9417)}</strong></div><div class="info-row"><span>Средний чек рейса</span><strong>${money(3150)}</strong></div><p class="form-hint">В боевой версии суммы берутся из листов «Доставки» и «Выплаты» Google Таблицы.</p></article></section>`;
}

function deliveryStepper(order) {
  const steps = ["Получен", "В пути", "На месте", order.type === "fbs" ? "Сдан" : "Вручён"];
  const current = {assigned: 0, in_transit: 1, arrived: 2, delivered: 3}[order.status] ?? 0;
  return `<div class="delivery-stepper">${steps.map((label, index) => `<div class="delivery-step ${index < current || order.status === "delivered" ? "done" : index === current ? "current" : ""}"><span class="step-dot">${index < current || order.status === "delivered" ? icon("check") : `<span style="font-size:8px">${index + 1}</span>`}</span><span>${label}</span></div>`).join("")}</div>`;
}

function stageButton(order) {
  if (order.status === "assigned") return `<button class="button accent big stage-button" data-action="start-delivery" data-id="${esc(order.posting)}">${icon("navigation")}Начать движение</button>`;
  if (order.status === "in_transit") return `<button class="button big stage-button" data-action="arrive" data-id="${esc(order.posting)}">${icon("pin")}Я на месте</button>`;
  return `<button class="button success big stage-button" data-action="mark-delivered" data-id="${esc(order.posting)}">${icon("check")}${order.type === "fbs" ? "Подтвердить сдачу в ППЗ" : "Подтвердить вручение"}</button>`;
}

function nextDeliveryCard(order) {
  if (!order) return `<div class="card empty-state"><div class="empty-icon">${icon("check-circle")}</div><h3>Все доставки завершены</h3><p>Отличная смена. Новых активных заказов нет.</p></div>`;
  return `<article class="next-delivery"><div class="next-label"><span>Следующая доставка</span><span>${esc(order.date)} · ${esc(order.time)}</span></div><div class="next-body"><div class="next-order-head"><div class="order-identity"><span class="cb-tile ${order.type === "fbs" ? "fbs" : ""}">${esc(order.id)}</span><span>${esc(order.posting)}</span></div>${statusPill(order)}</div><div class="next-address">${esc(order.address)}</div><div class="next-area">${icon("pin")}${esc(order.area)}</div>${deliveryStepper(order)}<div class="delivery-facts"><div class="delivery-fact"><span>${icon("package")}Заказ</span><strong>${order.packs} уп · ${order.weight} кг</strong></div><div class="delivery-fact"><span>${icon("users")}Разгрузка</span><strong>${esc(order.unload)}</strong></div><div class="delivery-fact pay"><span>${icon("wallet")}Оплата</span><strong>${money(order.pay)}</strong></div></div>${order.note ? `<div class="note-box">${icon("alert")}<span><strong>Важно для этой точки</strong>${esc(order.note)}</span></div>` : ""}<div class="courier-actions"><button class="button secondary big" data-action="route-order" data-id="${esc(order.posting)}">${icon("navigation")}Маршрут</button><button class="button secondary big" data-action="call">${icon("phone")}${order.phone ? "Клиенту" : "Диспетчеру"}</button><button class="button secondary" data-action="${order.foreman ? "call-foreman" : "open-order"}" ${order.foreman ? "" : `data-id="${esc(order.posting)}"`}>${icon(order.foreman ? "users" : "package")}${order.foreman ? "Прорабу" : "Детали заказа"}</button><button class="button secondary" data-open-order="${esc(order.posting)}">${icon("edit")}Все детали</button>${stageButton(order)}</div></div></article>`;
}

function courierTodayView() {
  const active = routeOrders();
  const next = active.find(order => order.status === "arrived") || active.find(order => order.status === "in_transit") || active[0];
  const rest = active.filter(order => order !== next);
  const weight = sum(active, "weight");
  const capacity = Math.min(100, Math.round(weight / 1500 * 100));
  const done = orders.filter(order => order.status === "delivered").length;
  const progress = Math.round(done / (done + active.length) * 100) || 0;
  return `<section class="courier-welcome"><div><div class="eyebrow">${esc(todayLabel())}</div><h1>Рашад, хорошей смены</h1><p>Главное действие и следующая точка всегда на первом экране.</p></div><div class="day-progress"><div><strong>${done} из ${done + active.length}</strong><span>${progress}%</span></div><div class="progress-track"><span style="width:${progress}%"></span></div></div></section><section class="courier-shift"><div class="shift-greeting"><span>Смена активна</span><h2>Всё по плану. Безопасной дороги.</h2><p>Данные обновлены только что</p></div><div class="courier-shift-stats"><div><strong>${active.length}</strong><span>точек осталось</span></div><div><strong>${sum(active, "packs")}</strong><span>упаковок</span></div><div><strong>${money(sum(active, "pay"))}</strong><span>за активные</span></div></div><div class="capacity"><div class="capacity-head"><span>Загрузка автомобиля</span><strong>${weight} / 1 500 кг</strong></div><div class="progress-track"><span style="width:${capacity}%"></span></div></div></section>${nextDeliveryCard(next)}<div class="card-title-row" style="margin:22px 2px 0"><h2>Дальше по маршруту</h2><button class="text-button" data-view="route">Вся карта ${icon("arrow")}</button></div><section class="courier-order-list">${rest.map((order, index) => `<button class="courier-order-card" data-open-order="${esc(order.posting)}"><span class="stop-index">${index + 2}</span><span class="cb-tile ${order.type === "fbs" ? "fbs" : ""}">${esc(order.id)}</span><span class="courier-order-copy"><strong>${esc(order.address)}</strong><span>${esc(order.date)} · ${esc(order.time)} · ${order.packs} уп</span></span><span class="courier-order-meta"><strong>${money(order.pay)}</strong><span>${esc(order.unload)}</span></span><span class="row-chevron">${icon("chevron-right")}</span></button>`).join("")}</section>`;
}

function courierHistoryView() {
  const done = orders.filter(order => order.status === "delivered");
  return `${pageHead("Завершённые доставки", `${done.length} заказа в этой демонстрационной смене`, `<button class="button secondary" data-action="export">${icon("download")}Отчёт</button>`, "История смены")}<section class="stats-grid">${metricCard("Доставлено", done.length, "Без отмен и повторных рейсов", "check-circle", "green", "success")}${metricCard("Упаковок", sum(done, "packs"), "Все переданы клиентам", "package")}${metricCard("Заработано", sum(done, "pay"), "За показанные заказы", "wallet", "purple", "", " ₽")}${metricCard("Время в рейсе", "1 ч 17 мин", "По двум завершённым точкам", "clock", "orange")}</section><section class="card orders-card" style="margin-top:0">${orderRows(done)}</section>`;
}

let conceptMap = null, conceptLib = null;
function ensureConceptLib() {
  if (window.maplibregl) return Promise.resolve();
  if (conceptLib) return conceptLib;
  conceptLib = new Promise((ok, fail) => {
    const css = Object.assign(document.createElement("link"), {rel: "stylesheet", href: "https://unpkg.com/maplibre-gl@5.24.0/dist/maplibre-gl.css", integrity: "sha384-uTttxo/aOKbdE5RlD/SPzSDoDmNvGlUYPjONi2MN/b7c9HPSvW07OIuyP7uL6jxK", crossOrigin: "anonymous"});
    const js = Object.assign(document.createElement("script"), {src: "https://unpkg.com/maplibre-gl@5.24.0/dist/maplibre-gl.js", integrity: "sha384-5+cfbwT0iiub6VsQAdn6yz16nr6sDiQoHx6tm4O8OVYXHYOxcffFmCJBL0dgdvGp", crossOrigin: "anonymous"});
    js.onload = ok; js.onerror = () => fail(new Error("map"));
    document.head.append(css, js);
  });
  return conceptLib;
}
function conceptStyle() {
  return `https://tiles.openfreemap.org/styles/${document.documentElement.dataset.theme === "dark" ? "dark" : "positron"}`;
}
async function mountConceptMap() {
  const el = document.querySelector(".live-map");
  if (!el) { if (conceptMap) { conceptMap.remove(); conceptMap = null; } return; }
  try { await ensureConceptLib(); } catch { el.textContent = "Карта не загрузилась"; return; }
  if (conceptMap) { conceptMap.remove(); conceptMap = null; }
  const stops = mapPoints.slice();
  conceptMap = new maplibregl.Map({container: el, style: conceptStyle(), center: [CONCEPT_DEPOT.lon, CONCEPT_DEPOT.lat], zoom: 9,
    attributionControl: false, dragRotate: false, pitchWithRotate: false, fadeDuration: matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 150});
  conceptMap.addControl(new maplibregl.NavigationControl({showCompass: false}), "top-right");
  conceptMap.on("load", () => {
    const depot = document.createElement("div");
    depot.className = "concept-pin depot"; depot.textContent = "С"; depot.title = CONCEPT_DEPOT.name;
    new maplibregl.Marker({element: depot, anchor: "center"}).setLngLat([CONCEPT_DEPOT.lon, CONCEPT_DEPOT.lat]).addTo(conceptMap);
    const lls = [[CONCEPT_DEPOT.lon, CONCEPT_DEPOT.lat]];
    stops.forEach((order, i) => {
      const pin = document.createElement("button");
      pin.type = "button"; pin.className = "concept-pin"; pin.textContent = String(i + 1); pin.title = order.address;
      pin.addEventListener("click", () => openOrder(order.posting));
      new maplibregl.Marker({element: pin, anchor: "center"}).setLngLat([order.lon, order.lat]).addTo(conceptMap);
      lls.push([order.lon, order.lat]);
    });
    if (stops.length) lls.push([CONCEPT_DEPOT.lon, CONCEPT_DEPOT.lat]);
    conceptMap.addSource("route", {type: "geojson", data: {type: "Feature", geometry: {type: "LineString", coordinates: lls}}});
    conceptMap.addLayer({id: "route", type: "line", source: "route", layout: {"line-cap": "round", "line-join": "round"}, paint: {"line-color": "#2451D6", "line-width": 4}});
    const b = new maplibregl.LngLatBounds();
    lls.forEach(p => b.extend(p));
    conceptMap.fitBounds(b, {padding: 36, maxZoom: 11, duration: 0});
    if (stops.length) {
      const path = [[CONCEPT_DEPOT.lat, CONCEPT_DEPOT.lon]].concat(stops.map(o => [o.lat, o.lon]), [[CONCEPT_DEPOT.lat, CONCEPT_DEPOT.lon]])
        .map(p => `${(+p[1]).toFixed(6)},${(+p[0]).toFixed(6)}`).join(";");
      fetch("https://router.project-osrm.org/route/v1/driving/" + path + "?overview=full&geometries=geojson").then(r => r.json()).then(j => {
        const g = j && j.routes && j.routes[0] && j.routes[0].geometry;
        if (g && conceptMap && conceptMap.getSource("route")) conceptMap.getSource("route").setData({type: "Feature", geometry: g});
      }).catch(() => {});
    }
  });
}
function renderNavigation() {
  const html = NAV[state.role].map(([view, iconName, label]) => {
    const count = view === "orders" ? activeOrders().length : view === "today" ? routeOrders().length : 0;
    return `<button class="nav-button ${state.view === view ? "active" : ""}" data-view="${view}" aria-current="${state.view === view ? "page" : "false"}">${icon(iconName)}<span>${label}</span>${count ? `<span class="nav-count">${count}</span>` : ""}</button>`;
  }).join("");
  document.getElementById("sideNav").innerHTML = html;
  document.getElementById("bottomNav").innerHTML = html;
}

function render() {
  renderNavigation();
  document.getElementById("profileAvatar").textContent = state.role === "owner" ? "Ю" : "Р";
  document.getElementById("profileName").textContent = state.role === "owner" ? "Юнус" : "Рашад";
  document.getElementById("profileRole").textContent = state.role === "owner" ? "Менеджер" : "Курьер";
  document.getElementById("driverMini").hidden = state.role !== "owner";
  document.querySelector(".global-search").hidden = state.role !== "owner";
  document.getElementById("globalSearch").value = state.query;
  document.querySelectorAll("[data-role]").forEach(button => button.classList.toggle("active", button.dataset.role === state.role));
  let content;
  if (state.role === "courier") {
    content = state.view === "route" ? routeView() : state.view === "history" ? courierHistoryView() : state.view === "finance" ? financeView() : courierTodayView();
  } else {
    content = state.view === "orders" ? ordersView() : state.view === "route" ? routeView() : state.view === "couriers" ? couriersView() : state.view === "finance" ? financeView() : overviewView();
  }
  const main = document.getElementById("main");
  main.classList.toggle("courier-mode", state.role === "courier");
  main.innerHTML = content;
  hydrateIcons();
  animateCounters();
  mountConceptMap();
}

function navigate(view) {
  if (!NAV[state.role].some(item => item[0] === view)) view = state.role === "owner" ? "overview" : "today";
  state.view = view;
  closeDrawer();
  closeModal();
  render();
  window.scrollTo({top: 0, behavior: "smooth"});
}

function switchRole(role) {
  if (!NAV[role] || role === state.role) return;
  state.role = role;
  state.view = role === "owner" ? "overview" : "today";
  state.filter = "all";
  state.query = "";
  history.replaceState(null, "", role === "courier" ? "#courier" : "#manager");
  closeDrawer();
  closeModal();
  render();
  window.scrollTo({top: 0, behavior: "smooth"});
  toast(role === "courier" ? "Интерфейс курьера · только его смена и действия" : "Интерфейс менеджера · контроль всей доставки");
}

function closeDrawer() {
  document.getElementById("drawerRoot").innerHTML = "";
  if (!document.getElementById("modalRoot").innerHTML) document.body.style.overflow = "";
}

function closeModal() {
  document.getElementById("modalRoot").innerHTML = "";
  if (!document.getElementById("drawerRoot").innerHTML) document.body.style.overflow = "";
}

function orderTimeline(order) {
  const steps = [
    [true, "Заказ получен из Ozon", "Сегодня, 08:14"],
    [order.status !== "waiting_cb", order.status === "waiting_cb" ? "Ожидает номер ЦБ" : "Передан Рашаду", order.status === "waiting_cb" ? "Нужно действие менеджера" : "Сегодня, 08:32"],
    [["in_transit", "arrived", "delivered"].includes(order.status), order.status === "arrived" || order.status === "delivered" ? "Курьер на месте" : order.status === "in_transit" ? "Курьер в пути" : "Ожидает выезда", `${order.date}, ${order.time}`],
    [order.status === "delivered", order.status === "delivered" ? "Доставлен и принят" : "Ожидает вручения", order.status === "delivered" ? `Сегодня, ${order.time}` : "Следующий этап"],
  ];
  const firstOpen = steps.findIndex(step => !step[0]);
  return `<ol class="timeline">${steps.map((step, index) => `<li class="${step[0] ? "done" : index === firstOpen ? "current" : ""}"><div>${esc(step[1])}<time>${esc(step[2])}</time></div></li>`).join("")}</ol>`;
}

function drawerFooter(order) {
  if (order.status === "delivered") return `<button class="button secondary full" data-action="close-drawer">Закрыть</button>`;
  if (order.status === "waiting_cb") return `<button class="button full" data-action="edit-order" data-id="${esc(order.posting)}">${icon("edit")}Заполнить ЦБ и передать</button>`;
  if (state.role === "courier") return stageButton(order);
  return `<button class="button secondary" data-action="route-order" data-id="${esc(order.posting)}">${icon("navigation")}Маршрут</button><button class="button success" data-action="mark-delivered" data-id="${esc(order.posting)}">${icon("check")}Доставлено</button>`;
}

function openOrder(posting) {
  const order = orders.find(item => item.posting === posting);
  if (!order) return;
  document.getElementById("drawerRoot").innerHTML = `<div class="overlay" data-action="close-drawer"></div><aside class="drawer" role="dialog" aria-modal="true" aria-labelledby="drawerTitle"><div class="drawer-head"><div><h2 id="drawerTitle">${esc(order.id || "Новый заказ")}</h2><p>${esc(order.posting)}</p></div>${statusPill(order)}<button class="icon-button" data-action="close-drawer" aria-label="Закрыть">${icon("x")}</button></div><div class="drawer-body"><section class="drawer-section"><div class="detail-address">${esc(order.address)}</div><p style="margin:6px 0 0;color:var(--muted);font-size:9px">${esc(order.area)}</p></section><section class="drawer-section"><div class="detail-grid"><div class="detail-cell"><span>Дата и время</span><strong>${esc(order.date)} · ${esc(order.time)}</strong></div><div class="detail-cell"><span>Оплата курьеру</span><strong>${money(order.pay)}</strong></div><div class="detail-cell"><span>Товар</span><strong>${esc(order.product)}</strong></div><div class="detail-cell"><span>Количество и вес</span><strong>${order.packs} уп · ${order.weight} кг</strong></div><div class="detail-cell"><span>Разгрузка</span><strong>${esc(order.unload)}</strong></div><div class="detail-cell"><span>Схема доставки</span><strong>${order.type === "fbs" ? "FBS · сдача в ППЗ" : "RealFBS · клиенту"}</strong></div></div>${order.note ? `<div class="note-box">${icon("alert")}<span><strong>Пометка для курьера</strong>${esc(order.note)}</span></div>` : ""}</section><section class="drawer-section"><h3>Контакты</h3><div class="contact-row"><span>${icon("user")}</span><div><strong>${esc(order.customer)}</strong><span>${esc(order.phone || "Телефон не требуется для ППЗ")}</span></div>${order.phone ? `<button class="icon-button" data-action="call" aria-label="Позвонить клиенту">${icon("phone")}</button>` : ""}</div>${order.foreman ? `<div class="contact-row"><span>${icon("users")}</span><div><strong>Прораб на объекте</strong><span>${esc(order.foreman)}</span></div><button class="icon-button" data-action="call-foreman" aria-label="Позвонить прорабу">${icon("phone")}</button></div>` : ""}</section><section class="drawer-section"><h3>История заказа</h3>${orderTimeline(order)}</section><button class="button secondary full" data-action="edit-order" data-id="${esc(order.posting)}">${icon("edit")}Изменить детали доставки</button></div><div class="drawer-footer">${drawerFooter(order)}</div></aside>`;
  document.body.style.overflow = "hidden";
}

function openNotifications() {
  document.getElementById("drawerRoot").innerHTML = `<div class="overlay" data-action="close-drawer"></div><aside class="drawer" role="dialog" aria-modal="true" aria-labelledby="notificationsTitle"><div class="drawer-head"><div><h2 id="notificationsTitle">Уведомления</h2><p>3 новых события по смене</p></div><button class="icon-button" data-action="close-drawer" aria-label="Закрыть">${icon("x")}</button></div><div class="drawer-body"><div class="notification-list"><div class="notification-item"><span class="attention-symbol green">${icon("check")}</span><div><strong>ЦБ-1047 доставлен</strong><p>Рашад подтвердил вручение 14 упаковок клиенту.</p><time>12 минут назад</time></div></div><div class="notification-item"><span class="attention-symbol blue">${icon("clock")}</span><div><strong>Изменилось время доставки</strong><p>ЦБ-1049 перенесён на интервал 12:30–14:30.</p><time>28 минут назад</time></div></div><div class="notification-item"><span class="attention-symbol purple">${icon("package")}</span><div><strong>Новый заказ FBS</strong><p>ЦБ-1050 добавлен в маршрут: сдача в ППЗ до 18:00.</p><time>46 минут назад</time></div></div></div></div></aside>`;
  document.body.style.overflow = "hidden";
}

function openModal(title, subtitle, body, footer) {
  document.getElementById("modalRoot").innerHTML = `<div class="modal-wrap"><div class="overlay" data-action="close-modal"></div><section class="modal" role="dialog" aria-modal="true" aria-labelledby="modalTitle"><div class="modal-head"><div><h2 id="modalTitle">${esc(title)}</h2><p>${esc(subtitle)}</p></div><button class="icon-button" data-action="close-modal" aria-label="Закрыть">${icon("x")}</button></div><div class="modal-body">${body}</div><div class="modal-footer">${footer}</div></section></div>`;
  document.body.style.overflow = "hidden";
  setTimeout(() => document.querySelector(".modal input:not([type=checkbox]), .modal select")?.focus(), 80);
}

function openNewOrder() {
  const body = `<form id="newOrderForm"><div class="form-grid"><div class="form-field"><label for="newCb">Номер ЦБ · можно позже</label><input id="newCb" name="cb" inputmode="numeric" placeholder="1052"></div><div class="form-field"><label for="newPosting">Отправление Ozon</label><input id="newPosting" name="posting" placeholder="00000000-0000-1" required></div><div class="form-field full"><label for="newAddress">Адрес доставки</label><input id="newAddress" name="address" placeholder="Город, улица, дом" required></div><div class="form-field"><label for="newCustomer">Получатель</label><input id="newCustomer" name="customer" placeholder="Имя или ППЗ Ozon" required></div><div class="form-field"><label for="newProduct">Товар</label><input id="newProduct" name="product" placeholder="Название и формат" required></div><div class="form-field"><label for="newPacks">Упаковок</label><input id="newPacks" name="packs" type="number" min="1" value="1" required></div><div class="form-field"><label for="newPay">Оплата курьеру, ₽</label><input id="newPay" name="pay" type="number" min="0" placeholder="2400" required></div><div class="form-field"><label for="newDate">Дата</label><select id="newDate" name="date"><option>Сегодня</option><option>Завтра</option></select></div><div class="form-field"><label for="newTime">Интервал</label><input id="newTime" name="time" placeholder="14:00–16:00" required></div><div class="form-field"><label for="newUnload">Разгрузка</label><select id="newUnload" name="unload"><option>Без подъёма</option><option>Лифт</option><option>Лестница</option><option>Сдача в ППЗ</option></select></div><div class="form-field"><label for="newType">Схема</label><select id="newType" name="type"><option value="rfbs">RealFBS · клиенту</option><option value="fbs">FBS · в ППЗ</option></select></div><div class="form-field full"><label for="newNote">Пометка курьеру</label><textarea id="newNote" name="note" placeholder="Въезд, пропуск, прораб, особенности разгрузки"></textarea></div></div><p class="form-hint">Демо: заказ появится только в этом прототипе, без отправки в Ozon или Google Таблицу.</p></form>`;
  openModal("Новая доставка", "Добавьте заказ и сразу передайте его Рашаду", body, `<button class="button secondary" data-action="close-modal">Отмена</button><button class="button" type="submit" form="newOrderForm">${icon("plus")}Добавить доставку</button>`);
}

function openEditOrder(posting) {
  const order = orders.find(item => item.posting === posting);
  if (!order) return;
  const body = `<form id="editOrderForm" data-posting="${esc(order.posting)}"><div class="form-grid"><div class="form-field"><label for="editCb">Номер ЦБ</label><input id="editCb" name="cb" value="${esc(order.id.replace("ЦБ-", ""))}" inputmode="numeric" placeholder="1052"></div><div class="form-field"><label for="editPay">Оплата курьеру, ₽</label><input id="editPay" name="pay" type="number" min="0" value="${order.pay}" required></div><div class="form-field"><label for="editDate">Дата</label><select id="editDate" name="date"><option ${order.date === "Сегодня" ? "selected" : ""}>Сегодня</option><option ${order.date === "Завтра" ? "selected" : ""}>Завтра</option></select></div><div class="form-field"><label for="editTime">Интервал</label><input id="editTime" name="time" value="${esc(order.time)}" required></div><div class="form-field full"><label for="editAddress">Адрес</label><input id="editAddress" name="address" value="${esc(order.address)}" required></div><div class="form-field"><label for="editUnload">Разгрузка</label><input id="editUnload" name="unload" value="${esc(order.unload)}"></div><div class="form-field"><label for="editForeman">Телефон прораба</label><input id="editForeman" name="foreman" value="${esc(order.foreman)}" placeholder="+7 900 000-00-00"></div><div class="form-field full"><label for="editNote">Пометка курьеру</label><textarea id="editNote" name="note">${esc(order.note)}</textarea></div></div><p class="form-hint">Если у заказа появится ЦБ, он автоматически будет отмечен как переданный курьеру.</p></form>`;
  openModal(`Изменить ${order.id || "заказ"}`, order.posting, body, `<button class="button secondary" data-action="close-modal">Отмена</button><button class="button" type="submit" form="editOrderForm">${icon("check")}Сохранить</button>`);
}

function openDeliveryConfirmation(posting) {
  const order = orders.find(item => item.posting === posting);
  if (!order) return;
  const isFbs = order.type === "fbs";
  const body = `<form id="deliveryConfirmForm" data-posting="${esc(order.posting)}"><p style="margin:0 0 15px;color:var(--muted);font-size:10px">${esc(order.id)} · ${esc(order.address)}</p><div class="checklist"><label class="check-item"><input type="checkbox" required checked><span>${isFbs ? "Все коробки переданы сотруднику ППЗ" : "Плитка проверена, повреждённых коробок нет"}</span></label><label class="check-item"><input type="checkbox" required checked><span>${isFbs ? "Сдача по штрихкоду подтверждена" : "Подъём и разгрузка выполнены полностью"}</span></label><label class="check-item"><input type="checkbox" required checked><span>${isFbs ? "Подтверждение приёма получено" : "Получатель принял весь заказ"}</span></label></div><p class="form-hint">После подтверждения заказ перейдёт в «Доставленные», а менеджер увидит обновление.</p></form>`;
  openModal(isFbs ? "Подтвердить сдачу в ППЗ" : "Подтвердить вручение", "Короткая проверка перед завершением заказа", body, `<button class="button secondary" data-action="close-modal">Отмена</button><button class="button success" type="submit" form="deliveryConfirmForm">${icon("check")}Подтвердить</button>`);
}

function openPayment() {
  const body = `<form id="paymentForm"><div class="form-grid"><div class="form-field full"><label for="paymentAmount">Сумма выплаты, ₽</label><input id="paymentAmount" name="amount" type="number" min="1" max="${owed()}" placeholder="${owed()}" required></div><div class="form-field full"><label for="paymentComment">Комментарий</label><input id="paymentComment" name="comment" placeholder="Например: выплата за смену" value="Выплата Рашаду"></div></div><p class="form-hint">Доступно к выплате: ${money(owed())}. В прототипе меняется только демонстрационный баланс.</p></form>`;
  openModal("Записать выплату", "Сумма вычтется из остатка курьеру", body, `<button class="button secondary" data-action="close-modal">Отмена</button><button class="button" type="submit" form="paymentForm">${icon("check")}Сохранить выплату</button>`);
}

let toastTimer;
function toast(message) {
  const element = document.getElementById("toast");
  element.textContent = message;
  element.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => element.classList.remove("show"), 3200);
}

function showSuccess(order) {
  const colors = ["#c9f277", "#72d6aa", "#ffffff", "#edb477"];
  const confetti = Array.from({length: 18}, (_, index) => {
    const angle = Math.PI * 2 * index / 18;
    const distance = 120 + index % 4 * 24;
    const x = Math.round(Math.cos(angle) * distance);
    const y = Math.round(Math.sin(angle) * distance);
    return `<i class="confetti" style="--x:${x}px;--y:${y}px;--r:${180 + index * 39}deg;background:${colors[index % colors.length]};animation-delay:${index % 3 * 35}ms"></i>`;
  }).join("");
  document.getElementById("successRoot").innerHTML = `${confetti}<div class="success-pop"><span class="success-check">${icon("check")}</span><strong>${order.type === "fbs" ? "Заказ сдан" : "Заказ доставлен"}</strong><span>${esc(order.id)} · менеджер уже видит обновление</span></div>`;
  setTimeout(() => { document.getElementById("successRoot").innerHTML = ""; }, 1700);
}

function animateCounters() {
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  document.querySelectorAll("#main [data-count]").forEach(element => {
    const target = Number(element.dataset.count) || 0;
    const suffix = element.dataset.suffix || "";
    if (reduced) { element.textContent = `${target.toLocaleString("ru-RU")}${suffix}`; return; }
    const start = performance.now();
    const duration = 620;
    const tick = now => {
      const progress = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      const value = Math.round(target * eased);
      element.textContent = `${value.toLocaleString("ru-RU")}${suffix}`;
      if (progress < 1 && element.isConnected) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

function exportOrders() {
  const header = ["ЦБ", "Отправление", "Адрес", "Товар", "Упаковок", "Вес кг", "Оплата", "Статус"];
  const rows = filteredOrders().map(order => [order.id, order.posting, order.address, order.product, order.packs, order.weight, order.pay, statusInfo(order)[1]]);
  const csv = [header, ...rows].map(row => row.map(value => `"${String(value).replace(/"/g, '""')}"`).join(";")).join("\n");
  const url = URL.createObjectURL(new Blob(["\ufeff" + csv], {type: "text/csv;charset=utf-8"}));
  const link = document.createElement("a");
  link.href = url;
  link.download = "almaly-delivery-demo.csv";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast("Отчёт сформирован из демонстрационных данных");
}

async function copyCourierLink() {
  const link = `${location.href.split("#")[0]}#courier`;
  try { await navigator.clipboard.writeText(link); } catch {}
  toast("Ссылка на режим курьера скопирована");
}

function updateOrderStatus(posting, status) {
  const order = orders.find(item => item.posting === posting);
  if (!order) return;
  order.status = status;
  closeDrawer();
  render();
  toast(status === "in_transit" ? `${order.id} · статус обновлён: в пути` : `${order.id} · курьер отметил прибытие`);
}

document.addEventListener("click", event => {
  const role = event.target.closest("[data-role]");
  if (role) { switchRole(role.dataset.role); return; }
  const open = event.target.closest("[data-open-order]");
  if (open) { openOrder(open.dataset.openOrder); return; }
  const view = event.target.closest("[data-view]");
  if (view) { navigate(view.dataset.view); return; }
  const filter = event.target.closest("[data-filter]");
  if (filter) { state.filter = filter.dataset.filter; render(); return; }
  const button = event.target.closest("[data-action]");
  if (!button) return;
  const action = button.dataset.action;
  if (action === "toggle-role") switchRole(state.role === "owner" ? "courier" : "owner");
  else if (action === "theme") {
    const dark = document.documentElement.dataset.theme !== "dark";
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    try { localStorage.setItem("almaly-prototype-theme-v2", dark ? "dark" : "light"); } catch {}
    document.querySelectorAll('[data-action="theme"]').forEach(item => { item.innerHTML = icon(dark ? "sun" : "moon"); });
    mountConceptMap();
  } else if (action === "refresh") {
    button.classList.add("spinning");
    document.body.classList.add("is-syncing");
    document.getElementById("main").classList.add("is-refreshing");
    setTimeout(() => {
      button.classList.remove("spinning");
      document.body.classList.remove("is-syncing");
      document.getElementById("main").classList.remove("is-refreshing");
      toast("Данные обновлены · всё актуально");
    }, 800);
  } else if (action === "notifications") openNotifications();
  else if (action === "close-drawer") closeDrawer();
  else if (action === "close-modal") closeModal();
  else if (action === "new-order") openNewOrder();
  else if (action === "edit-order") openEditOrder(button.dataset.id);
  else if (action === "open-order") openOrder(button.dataset.id);
  else if (action === "start-delivery") updateOrderStatus(button.dataset.id, "in_transit");
  else if (action === "arrive") updateOrderStatus(button.dataset.id, "arrived");
  else if (action === "mark-delivered") openDeliveryConfirmation(button.dataset.id);
  else if (action === "payment") openPayment();
  else if (action === "export") exportOrders();
  else if (action === "filter-waiting") { state.filter = "waiting_cb"; state.role = "owner"; navigate("orders"); }
  else if (action === "optimize") { state.optimized = true; render(); toast("Маршрут выстроен от ближайшей точки"); }
  else if (action === "start-route") { state.routeStarted = !state.routeStarted; render(); toast(state.routeStarted ? "Маршрут готов · можно начинать движение" : "Построение маршрута отменено"); }
  else if (action === "route-order") { state.routeStarted = true; closeDrawer(); navigate("route"); toast("Точка выбрана на схеме маршрута"); }
  else if (action === "copy-link") copyCourierLink();
  else if (action === "call") toast("В рабочей версии откроется звонок контакту");
  else if (action === "call-foreman") toast("В рабочей версии откроется звонок прорабу");
});

document.addEventListener("submit", event => {
  event.preventDefault();
  const form = event.target;
  if (form.id === "globalSearchForm") {
    state.role = "owner";
    state.query = document.getElementById("globalSearch").value;
    state.filter = "all";
    navigate("orders");
    return;
  }
  const data = Object.fromEntries(new FormData(form));
  if (form.id === "newOrderForm") {
    if (orders.some(order => order.posting === data.posting.trim())) { toast("Заказ с таким отправлением уже есть"); return; }
    const packs = Number(data.packs);
    const id = data.cb.trim() ? `ЦБ-${data.cb.trim().replace(/^ЦБ-?/i, "")}` : "";
    orders.unshift({id, posting: data.posting.trim(), customer: data.customer.trim(), phone: "", address: data.address.trim(), area: "Новый адрес · расстояние уточняется", product: data.product.trim(), packs, weight: packs * 28, pay: Number(data.pay), status: id ? "assigned" : "waiting_cb", date: data.date, time: data.time.trim(), unload: data.unload, note: data.note.trim(), foreman: "", distance: 20, type: data.type});
    closeModal(); state.filter = "all"; state.query = ""; state.role = "owner"; state.view = "orders"; render(); toast(id ? `${id} передан Рашаду` : "Заказ добавлен · заполните номер ЦБ");
  } else if (form.id === "editOrderForm") {
    const order = orders.find(item => item.posting === form.dataset.posting);
    if (!order) return;
    order.id = data.cb.trim() ? `ЦБ-${data.cb.trim().replace(/^ЦБ-?/i, "")}` : "";
    order.pay = Number(data.pay);
    order.date = data.date;
    order.time = data.time.trim();
    order.address = data.address.trim();
    order.unload = data.unload.trim();
    order.foreman = data.foreman.trim();
    order.note = data.note.trim();
    if (order.id && order.status === "waiting_cb") order.status = "assigned";
    closeModal(); closeDrawer(); render(); toast(order.id ? `${order.id} сохранён и передан курьеру` : "Детали доставки сохранены");
  } else if (form.id === "deliveryConfirmForm") {
    const order = orders.find(item => item.posting === form.dataset.posting);
    if (!order) return;
    order.status = "delivered";
    order.date = "Сегодня";
    finance.accrued += order.pay;
    closeModal(); closeDrawer(); render(); showSuccess(order);
  } else if (form.id === "paymentForm") {
    const amount = Number(data.amount);
    if (!amount || amount > owed()) { toast("Проверьте сумму выплаты"); return; }
    finance.paid += amount;
    payments.unshift({id: Date.now(), amount, date: new Intl.DateTimeFormat("ru-RU", {day: "numeric", month: "long", year: "numeric"}).format(new Date()), comment: data.comment.trim() || "Выплата Рашаду"});
    closeModal(); render(); toast(`Выплата ${money(amount)} записана`);
  }
});

document.addEventListener("keydown", event => {
  if (event.key === "Escape") { closeModal(); closeDrawer(); }
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k" && state.role === "owner") {
    event.preventDefault();
    document.getElementById("globalSearch").focus();
  }
});

try {
  const theme = localStorage.getItem("almaly-prototype-theme-v2");
  if (theme) document.documentElement.dataset.theme = theme;
} catch {}
hydrateIcons();
document.querySelectorAll('[data-action="theme"]').forEach(item => { item.innerHTML = icon(document.documentElement.dataset.theme === "dark" ? "sun" : "moon"); });
render();
