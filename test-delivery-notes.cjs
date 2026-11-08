const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const read = file => fs.readFileSync(path.join(__dirname, file), 'utf8');
const context = {};
vm.createContext(context);
vm.runInContext(read('config.js'), context);
vm.runInContext(read('fbs.js'), context);
const details = {note: 'Позвонить за час\nВъезд со двора', time: 'с 14:00 до 16:00', foreman: '8 (900) 123-45-67'};
const encoded = context.deliveryComment(details);
assert.equal(context.deliveryDetails(encoded).note, details.note);
assert.equal(context.deliveryDetails(encoded).time, details.time);
assert.equal(context.deliveryDetails(encoded).foreman, '+79001234567');
assert.equal(context.deliveryDetails('Старый комментарий').note, 'Старый комментарий');
assert.equal(context.foremanPhone(''), '');
assert.throws(() => context.foremanPhone('123'), /Проверьте телефон/);
assert.equal(context.deliveryComment({note: 'Без времени'}), 'Без времени');
const owner = read('index.html');
vm.runInContext(owner.match(/^const e = .*;$/m)[0], context);
vm.runInContext(owner.slice(owner.indexOf('function deliveryFields('), owner.indexOf('\nfunction render(')), context);
const form = context.deliveryFields({date: '27.10.2026', comment: encoded});
assert.ok(form.includes('2026-10-27'));
assert.ok(form.includes('+79001234567'));
assert.ok(context.deliveryFields({comment: '<img src=x onerror=alert(1)>'}).includes('&lt;img'));
const input = {elements: {date: {value: '2026-10-27'}, time: {value: details.time}, foreman: {value: details.foreman}, note: {value: details.note}}};
assert.equal(context.readDeliveryFields(input).date, '27.10.2026');
const courier = read('courier.html');
vm.runInContext('const BADGE = {}; const FOCUS = null; const toIso = () => ""; const rub = x => String(x); const yandexMaps = () => "#"; const appleMaps = () => "#"; let OPEN = "demo"; const todayStr = () => "";', context);
vm.runInContext(courier.slice(courier.indexOf('function telOf('), courier.indexOf('\nfunction draw(')), context);
const card = context.card({posting: 'demo', cb: 'ЦБ-ТЕСТ', status: 'Новый', date: '27.10.2026', comment: encoded, phone: '', unload: ''});
assert.ok(card.includes('Позвонить прорабу'));
assert.ok(card.includes('href="tel:+79001234567"'));
assert.ok(card.includes('с 14:00 до 16:00'));
assert.ok(!context.card({posting: 'demo', comment: '', phone: '', unload: ''}).includes('Позвонить прорабу'));
console.log('Пометки, дата, время и телефон прораба: проверки пройдены');

const agreementOf = vm.runInContext('agreementOf', context);
// «Согласовал доставку»: строка «Согласовано: …» в комментарии курьера, старые комментарии не ломаются
const line = context.agreementLine({who: 'прораб', at: '05.11 14:05', slot: '12–14'});
assert.equal(line, 'Согласовано: прораб · 05.11 14:05 · интервал 12–14');
const ag = context.parseAgreement(line);
assert.equal(ag.who, 'прораб'); assert.equal(ag.day, '05.11'); assert.equal(ag.time, '14:05'); assert.equal(ag.slot, '12–14');
assert.equal(context.parseAgreement('Согласовано: клиент · 06.11 09:30').slot, '');
assert.equal(context.parseAgreement('Согласовано: завтра после обеда'), null);
assert.equal(context.parseAgreement('Позвонить за час'), null);
const cc = context.courierComment({text: 'Клиент просил позвонить\nЗаезд с торца', agreed: ag});
assert.equal(cc, 'Клиент просил позвонить\nЗаезд с торца\n' + line);
assert.equal(context.courierNotes(cc).text, 'Клиент просил позвонить\nЗаезд с торца');
assert.equal(context.courierNotes(cc).agreed.at, '05.11 14:05');
assert.deepEqual({...context.courierNotes('Старый комментарий курьера')}, {text: 'Старый комментарий курьера', agreed: null, ack: null});
assert.equal(context.courierNotes('').agreed, null);
assert.equal(context.courierComment({text: '', agreed: null}), '');
// повторное согласование заменяет прежнюю отметку, а не добавляет вторую
const again = context.courierComment({text: context.courierNotes(cc).text, agreed: {who: 'клиент', at: '06.11 10:00', slot: ''}});
assert.equal(again.split('\n').filter(x => x.startsWith('Согласовано:')).length, 1);
assert.equal(context.courierNotes(again).agreed.who, 'клиент');
// в комментарии владельца строка тоже распознаётся и не попадает в пометку; покупательский текст сохраняется
const ownerComment = context.deliveryComment({...details, agreed: ag});
assert.equal(context.deliveryDetails(ownerComment).note, details.note);
assert.equal(context.deliveryDetails(ownerComment).time, details.time);
assert.equal(context.deliveryDetails(ownerComment).agreed.slot, '12–14');
assert.equal(context.deliveryDetails(encoded).agreed, null);
assert.equal(context.deliveryDetails('Согласовано: завтра после обеда').note, 'Согласовано: завтра после обеда');
assert.equal(agreementOf({courier_comment: cc, comment: ''}).who, 'прораб');
assert.equal(agreementOf({courier_comment: '', comment: ownerComment}).who, 'прораб');
assert.equal(agreementOf({courier_comment: 'просто текст', comment: 'Старый комментарий'}), null);
assert.equal(context.agreedLabel(ag, '05.11 18:00'), 'Согласовано · 14:05');
assert.equal(context.agreedLabel(ag, '06.11 09:00'), 'Согласовано · 05.11');
assert.equal(context.agreedLabel(null), 'Не согласовано');
assert.match(context.agreedNow(new Date('2026-11-05T11:05:00Z')), /^05\.11 14:05$/);
assert.ok(form.includes('data-slot='));
assert.ok(context.deliveryFields({}, null, true).includes('name="cb"'));
const agreedCard = context.card({posting: 'demo', cb: 'ЦБ-1', status: 'Согласован', date: '27.10.2026', comment: encoded, courier_comment: cc, phone: '', unload: ''});
assert.ok(agreedCard.includes('Согласовано с прорабом') && agreedCard.includes('интервал 12–14'));
assert.ok(agreedCard.includes('Изменить согласование'));
const pendingCard = context.card({posting: 'demo', cb: 'ЦБ-2', status: 'Новый', comment: '', courier_comment: 'Старый комментарий', phone: '+79990000000', unload: 'Нет'});
assert.ok(pendingCard.includes('Не согласовано'));
assert.ok(pendingCard.includes('data-agree="demo"'));
assert.ok(pendingCard.includes('Согласовал доставку'));
assert.ok(pendingCard.indexOf('data-agree') < pendingCard.indexOf('Маршрут') && pendingCard.indexOf('Маршрут') < pendingCard.indexOf('data-done'));
assert.ok(!context.card({posting: 'demo', cb: 'ЦБ-3', status: 'Доставлен', comment: '', phone: '', unload: ''}).includes('data-agree'));
console.log('«Согласовал доставку»: проверки пройдены');

// Значки подключены к обеим страницам и доступны для установки приложения.
for (const file of ['manifest.webmanifest', 'owner.webmanifest']) {
  for (const icon of JSON.parse(read(file)).icons) {
    const png = fs.readFileSync(path.join(__dirname, icon.src.split('?')[0]));
    assert.equal(`${png.readUInt32BE(16)}x${png.readUInt32BE(20)}`, icon.sizes);
  }
}
for (const file of ['index.html', 'courier.html']) assert.ok(read(file).includes('rel="apple-touch-icon"'));

// ---------- «Принял»: отметка курьера, экран тревоги, липкий пуш ----------
const ackOf = vm.runInContext('ackOf', context);
assert.equal(context.ackLine({at: '05.11 14:05'}), 'Принял: 05.11 14:05');
assert.equal(context.ackLine('05.11 14:05'), 'Принял: 05.11 14:05');
assert.equal(context.ackLine({at: 'вчера'}), '');
assert.equal(context.parseAck('Принял: 05.11 14:05').time, '14:05');
assert.equal(context.parseAck('Принял: позже'), null);
const full = context.courierComment({text: 'Заезд с торца', agreed: ag, ack: {at: '05.11 13:58'}});
assert.equal(full, 'Заезд с торца\nСогласовано: прораб · 05.11 14:05 · интервал 12–14\nПринял: 05.11 13:58');
const parsed = context.courierNotes(full);
assert.equal(parsed.text, 'Заезд с торца');
assert.equal(parsed.agreed.at, '05.11 14:05');
assert.equal(parsed.ack.at, '05.11 13:58');
assert.equal(context.courierComment({...parsed, agreed: null}), 'Заезд с торца\nПринял: 05.11 13:58');  // смена согласования не теряет «Принял»
assert.equal(context.courierComment({...parsed, text: 'новый текст'}).split('\n').length, 3);
assert.equal(context.isAccepted({status: 'Новый', courier_comment: ''}), false);
assert.equal(context.isAccepted({status: 'Новый', courier_comment: 'Старый текст'}), false);
assert.equal(context.isAccepted({status: 'Новый', courier_comment: 'Принял: 05.11 13:58'}), true);
assert.equal(context.isAccepted({status: 'Новый', courier_comment: cc}), true);                // согласовал — значит видел
assert.equal(context.isAccepted({status: 'Согласован', courier_comment: ''}), true);
assert.equal(ackOf({courier_comment: 'x\nПринял: 05.11 13:58'}).at, '05.11 13:58');
assert.equal(context.ackLabel(context.parseAck('Принял: 05.11 13:58'), '05.11 18:00'), 'Принял · 13:58');
assert.equal(context.ackLabel(context.parseAck('Принял: 04.11 13:58'), '05.11 18:00'), 'Принял · 04.11');
assert.equal(context.ackLabel(null), 'Не принят курьером');
// карточка курьера с «Принял» по-прежнему показывает текст курьера без служебных строк
assert.ok(!context.card({posting: 'demo', cb: 'ЦБ-3', status: 'Новый', comment: '', courier_comment: 'Принял: 05.11 13:58', phone: '', unload: ''}).includes('Принял:'));
// содержимое экрана тревоги курьера
vm.runInContext(courier.slice(courier.indexOf('function alarmItem('), courier.indexOf('\nasync function sendAck(')), context);
const al = context.alarmItem({posting: '1-1-1', cb: 'ЦБ-7', status: 'Новый', address: 'Химки, ул. Тестовая, 2', packs: '8 уп 60×60', unload: 'Лифт, эт. 5', pay: '1500', date: '', comment: 'Время доставки: 14:00–16:00'});
assert.equal(al.id, '1-1-1');
assert.equal(al.kicker, 'Новый заказ · ЦБ-7');
assert.equal(al.title, 'Химки, ул. Тестовая, 2');
assert.equal(JSON.stringify(al.chips.map(c => c.v)), JSON.stringify(['8 уп 60×60', '~280 кг', '14:00–16:00', 'Лифт, эт. 5']));
assert.equal(al.okText, 'Принял');
// alarm.js и страницы подключают одинаковую версию
for (const f of ['index.html', 'courier.html', 'alarm-test.html']) assert.match(read(f), /alarm\.js\?v=39/);
assert.match(read('sw.js'), /SW_VERSION = "v41-fbs"/);
assert.match(read('sw.js'), /config\.js\?v=39/);
assert.match(read('style.css'), /@media \(min-width: 1100px\)/);
assert.match(read('index.html'), /desk-split/);
assert.match(read('courier.html'), /min-width: 1100px/);
assert.match(read("courier.html"), /maplibre-gl@5\.24\.0\/dist\/maplibre-gl\.js/);
assert.doesNotMatch(read("courier.html"), /map-widget|api-maps\.yandex/);  // карта без виджета Яндекса и рекламы
assert.doesNotThrow(() => new vm.Script(read('alarm.js')));

// ключ уведомлений: base64url без «=» и «+», который ссылка превратила в пробел
const {b64urlToBytes, ownerKey, KEY_BROKEN} = require('./push.js');
const jwkObj = {kty: 'EC', crv: 'P-256', d: 'd+d/d', x: 'xx', y: 'yy'};
const jwkB64 = Buffer.from(JSON.stringify(jwkObj)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
assert.equal(jwkB64.includes('='), false);
assert.equal(JSON.parse(Buffer.from(b64urlToBytes(jwkB64)).toString()).d, 'd+d/d');
const spaced = Buffer.from(JSON.stringify(jwkObj)).toString('base64').replace(/\+/g, ' ');
assert.equal(JSON.parse(Buffer.from(b64urlToBytes(spaced)).toString()).d, 'd+d/d');
assert.throws(() => b64urlToBytes('abcde'), new RegExp(KEY_BROKEN));
assert.equal(ownerKey(jwkB64).d, 'd+d/d');
const link = 'https://unus777.github.io/ozon-unit-calc/#admin=K&vk=' + Buffer.from(JSON.stringify(jwkObj)).toString('base64');
const kept = new URLSearchParams(link.replace(/^.*?#/, '').replace(/\+/g, '%2B')).get('vk');
const lost = new URLSearchParams(link.replace(/^.*?#/, '')).get('vk');
assert.equal(JSON.parse(Buffer.from(b64urlToBytes(kept)).toString()).d, 'd+d/d');
assert.equal(JSON.parse(Buffer.from(b64urlToBytes(lost)).toString()).d, 'd+d/d');
assert.ok(read('index.html').includes('q.replace(/\\+/g, "%2B")'));
assert.doesNotMatch(read('index.html'), /atob\(/);
assert.doesNotMatch(read('push.js'), /atob\(raw/);

// Ночной режим по Москве: 23:00–07:59, независимо от часового пояса телефона
assert.equal(vm.runInContext('NIGHT_FROM', context), 23);
assert.equal(vm.runInContext('NIGHT_TO', context), 8);
const night = iso => context.isNight(new Date(iso));
assert.equal(night('2026-11-05T19:59:00Z'), false);   // 22:59 МСК
assert.equal(night('2026-11-05T20:00:00Z'), true);    // 23:00 МСК
assert.equal(night('2026-11-05T02:30:00Z'), true);    // 05:30 МСК
assert.equal(night('2026-11-05T04:59:00Z'), true);    // 07:59 МСК
assert.equal(night('2026-11-05T05:00:00Z'), false);   // 08:00 МСК
assert.equal(night('2026-11-05T11:05:00Z'), false);   // 14:05 МСК
assert.equal(context.mskHour(new Date('2026-11-05T21:30:00Z')), 0);  // 00:30 МСК

// sw.js: один, но максимально заметный пуш нового заказа; без повторов с сервера
const ROW = {posting: '1-1-1', cb: 'ЦБ-7', status: 'Новый', address: 'Химки', packs: '8 уп', date: '', comment: 'Время доставки: 14:00–16:00', courier_comment: ''};
async function swRun(notice, {list = [ROW], hour = '2026-11-05T11:05:00Z', badge = true} = {}) {
  const shown = [], handlers = {}, badges = [];
  const RealDate = Date;
  class FakeDate extends RealDate { constructor(...a) { super(...(a.length ? a : [hour])); } static now() { return new RealDate(hour).getTime(); } }
  const sw = {importScripts() {}, URL, console, encodeURIComponent, Intl, Date: FakeDate,
    sheetApi: async req => { if (req.action === 'notice') { if (notice instanceof Error) throw notice; return notice; } if (list instanceof Error) throw list; return list; },
    clients: {matchAll: async () => [], openWindow: async url => { sw.opened = url; }},
    self: {location: 'https://unus777.github.io/ozon-unit-calc/sw.js?k=K', addEventListener: (n, f) => { handlers[n] = f; },
      navigator: badge ? {setAppBadge: async n => badges.push(n), clearAppBadge: async () => badges.push(0)} : {},
      registration: {scope: 'https://unus777.github.io/ozon-unit-calc/', showNotification: async (t, o) => { shown.push([t, o]); }}}};
  sw.addEventListener = sw.self.addEventListener; sw.registration = sw.self.registration;
  vm.createContext(sw);
  const stub = sw.sheetApi;
  vm.runInContext(read('config.js'), sw);
  vm.runInContext(read('fbs.js'), sw);
  vm.runInContext('sheetApi = undefined', sw); sw.sheetApi = stub;   // config.js объявляет настоящий sheetApi
  vm.runInContext(read('sw.js'), sw);
  let wait;
  handlers.push({waitUntil: p => { wait = p; }});
  await wait;
  const click = async (n, action = '') => { let w; handlers.notificationclick({action, notification: {close() {}, data: n[1].data}, waitUntil: p => { w = p; }}); await w; return sw.opened; };
  return {shown, sw, handlers, badges, click};
}
(async () => {
  // днём: крупный заголовок, адрес · упаковки · время, звук и длинная вибрация, баннер, кнопки
  let {shown, badges, click} = await swRun({type: 'new', posting: '1-1-1', cb: 'ЦБ-7', packs: '8 уп', address: 'Химки', unload: 'Нет'});
  assert.equal(shown.length, 1);
  const [title, o] = shown[0];
  assert.equal(title, '🚨 НОВЫЙ ЗАКАЗ · ЦБ-7');
  assert.equal(o.body, 'Химки · 8 уп · 14:00–16:00\nНажмите «✅ Принял»');
  assert.equal(o.tag, 'order-1-1-1');
  assert.equal(o.requireInteraction, true);
  assert.equal(o.renotify, true);
  assert.equal(o.silent, undefined);                                   // обычный пуш: звук решает телефон
  assert.equal(JSON.stringify(o.vibrate), '[500,200,500,200,800]');
  assert.equal(o.icon, 'icons/courier-192.png');
  assert.equal(o.badge, 'icons/badge-96.png');
  assert.equal(o.image, 'icons/push-new-order.png');
  assert.equal(JSON.stringify(o.actions.map(a => a.action)), '["accept","open"]');
  assert.equal(o.actions[0].title, '✅ Принял');
  assert.equal(o.data.url, 'courier.html?k=K&o=1-1-1#alert=1-1-1');
  assert.equal(JSON.stringify(badges), '[1]');                              // значок на иконке: 1 непринятый
  assert.equal(await click(shown[0]), 'https://unus777.github.io/ozon-unit-calc/courier.html?k=K&o=1-1-1#alert=1-1-1');
  assert.equal(await click(shown[0], 'open'), 'https://unus777.github.io/ozon-unit-calc/courier.html?k=K&o=1-1-1#alert=1-1-1');
  assert.equal(await click(shown[0], 'accept'), 'https://unus777.github.io/ozon-unit-calc/courier.html?k=K&o=1-1-1#alert=1-1-1&accept=1');
  for (const f of ['icons/badge-96.png', 'icons/push-new-order.png']) assert.ok(fs.statSync(path.join(__dirname, f)).size > 500, f);
  // ночью по Москве пуш тоже обычный (не silent): звук решает телефон, вибрация в пуше остаётся
  ({shown} = await swRun({type: 'new', posting: '1-1-1', cb: 'ЦБ-7', packs: '8 уп', address: 'Химки'}, {hour: '2026-11-05T21:30:00Z'}));
  assert.equal(shown[0][1].silent, undefined);
  assert.equal(JSON.stringify(shown[0][1].vibrate), '[500,200,500,200,800]');
  assert.equal(shown[0][1].requireInteraction, true);
  assert.match(shown[0][1].body, /Ночной режим · нажмите «✅ Принял»/);
  // нет списка и полей в notice — всё равно понятный пуш
  ({shown, badges} = await swRun({type: 'new', posting: '9-9-9'}, {list: new Error('нет сети')}));
  assert.equal(shown[0][0], '🚨 НОВЫЙ ЗАКАЗ');
  assert.match(shown[0][1].body, /^Откройте, чтобы посмотреть/);
  assert.equal(shown[0][1].tag, 'order-9-9-9');
  assert.equal(badges.length, 0);
  // скрипт без «notice» — по последнему новому заказу из списка
  ({shown} = await swRun(new Error('old script')));
  assert.equal(shown[0][0], '🚨 НОВЫЙ ЗАКАЗ · ЦБ-7');
  assert.equal(shown[0][1].tag, 'order-1-1-1');
  // ничего не доступно — всё равно показываем (iOS требует уведомление на каждый пуш), без setAppBadge — не падаем
  ({shown} = await swRun(new Error('x'), {list: new Error('x'), badge: false}));
  assert.equal(shown.length, 1);
  assert.equal(shown[0][0], '🚨 НОВЫЙ ЗАКАЗ');
  // принятый заказ не считается в значке
  ({badges} = await swRun({type: 'new', posting: '1-1-1', cb: 'ЦБ-7'}, {list: [{...ROW, courier_comment: 'Принял: 05.11 14:00'}]}));
  assert.equal(JSON.stringify(badges), '[0]');
  // напоминание — обычное, без кнопок и баннера
  ({shown} = await swRun({type: 'remind', posting: '1-1-1', cb: 'ЦБ-7', text: 'позвони'}));
  assert.ok(!shown[0][1].requireInteraction);
  assert.equal(shown[0][1].actions, undefined);
  assert.ok(!shown[0][1].data.url.includes('#alert'));
  // FBS/ППЗ не становится пушем и значком Рашада, даже если строка лежит в общем списке
  const ppzRow = {posting: 'ppz-1', status: 'Новый', address: 'ППЗ Ozon (Балашиха, ул. Реутовская, 5)', unload: 'Сдача в ППЗ', cb: 'ЦБ-9', comment: '', courier_comment: '', packs: '1 уп'};
  ({shown, badges} = await swRun({type: 'new', posting: 'ppz-1', cb: 'ЦБ-9', address: ppzRow.address, unload: ppzRow.unload, packs: '1 уп'}, {list: [ppzRow, ROW]}));
  assert.equal(shown.length, 0);
  assert.equal(JSON.stringify(badges), '[1]');
  ({shown} = await swRun({type: 'new', posting: '1-1-1', cb: 'ЦБ-7', packs: '8 уп', address: 'Химки', unload: 'Нет', more: [{posting: 'ppz-1', cb: 'ЦБ-9', address: ppzRow.address, unload: ppzRow.unload}]}));
  assert.equal(shown.length, 1);
  assert.equal(shown[0][0], '🚨 НОВЫЙ ЗАКАЗ · ЦБ-7');
  assert.ok(!/ППЗ|ЦБ-9/.test(shown.map(x => x[0] + x[1].body).join('\n')));
  ({shown} = await swRun(new Error('old script'), {list: [ppzRow]}));
  assert.equal(shown.length, 0);
  // владельцу — как раньше
  ({shown} = await swRun({role: 'owner', type: 'accepted', posting: '1-1-1', title: '👍 Рашад принял ЦБ-7', text: 'Химки'}));
  assert.equal(shown[0][0], '👍 Рашад принял ЦБ-7');
  assert.equal(shown[0][1].data.url, './');
  // страница: «✅ Принял» из уведомления обрабатывается; экран тревоги без звука в любой час, ночью — с плашкой
  assert.match(courier, /accept=1/);
  const alarmSrc = read('alarm.js');
  assert.match(alarmSrc, /Ночной режим · без звука/);
  assert.match(alarmSrc, /Вибрация повторяется/);
  assert.match(alarmSrc, /data-alok/);
  assert.doesNotMatch(alarmSrc, /AudioContext|webkitAudioContext|createOscillator|createGain|\.resume\(|HTMLAudioElement|new Audio|soundOn|Коснитесь экрана, чтобы включить звук/);
  assert.doesNotMatch(read('alarm-test.html'), /со звуком|AudioContext|new Audio/);
  for (const nightOn of [false, true]) {
    const calls = [];
    const el = {setAttribute() {}, addEventListener() {}, querySelector() { return {focus() {}}; }, remove() {}};
    const vibrated = [];
    const sandbox = {
      document: {title: 'Алмалы', body: {appendChild() {}}, documentElement: {classList: {add() {}, remove() {}}}, createElement() { return el; }},
      navigator: {vibrate(p) { vibrated.push(p); }, userActivation: {hasBeenActive: true}},
      location: {hash: '', pathname: '/courier.html', search: ''},
      history: {replaceState() {}},
      setInterval() { return 1; }, clearInterval() {}, setTimeout(fn) { fn(); return 0; },
      AudioContext: function () { calls.push('AudioContext'); },
      webkitAudioContext: function () { calls.push('webkitAudioContext'); },
      isNight: () => nightOn, ic: () => ''
    };
    sandbox.window = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(alarmSrc, sandbox);
    const Alarm = vm.runInContext('Alarm', sandbox);
    Alarm.unlock();
    Alarm.show([{id: nightOn ? 'n' : 'd', title: 'Химки', okText: 'Принял'}]);
    assert.equal(JSON.stringify(calls), '[]');
    assert.equal(JSON.stringify(vibrated), '[[500,200,500,200,800]]');
    assert.match(el.innerHTML, /data-alok="(d|n)"/);
    assert.match(el.innerHTML, /Принял/);
    assert.match(el.innerHTML, /Вибрация повторяется/);
    assert.doesNotMatch(el.innerHTML, /включить звук|Сигнал/);
    if (nightOn) assert.match(el.innerHTML, /Ночной режим · без звука/);
    else assert.doesNotMatch(el.innerHTML, /al-night/);
  }
  console.log('Пуш нового заказа, «✅ Принял» и ночной режим: проверки пройдены');
})().catch(err => { console.error(err); process.exit(1); });
