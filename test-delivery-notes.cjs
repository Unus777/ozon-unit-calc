const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const read = file => fs.readFileSync(path.join(__dirname, file), 'utf8');
const context = {};
vm.createContext(context);
vm.runInContext(read('config.js'), context);
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
assert.equal(JSON.stringify(al.chips.map(c => c.v)), JSON.stringify(['8 уп 60×60', '~224 кг', '14:00–16:00', 'Лифт, эт. 5']));
assert.equal(al.okText, 'Принял');
// alarm.js и страницы подключают одинаковую версию
for (const f of ['index.html', 'courier.html']) assert.match(read(f), /alarm\.js\?v=31/);
assert.match(read('sw.js'), /SW_VERSION = "v31-alarm"/);
assert.doesNotThrow(() => new vm.Script(read('alarm.js')));

// sw.js: новый заказ и повтор — липкие, свой tag на заказ, переход на #alert=<номер>
async function swRun(notice) {
  const shown = [], handlers = {};
  const sw = {importScripts() {}, URL, console, encodeURIComponent,
    sheetApi: async () => notice,
    clients: {matchAll: async () => [], openWindow: async url => { sw.opened = url; }},
    self: {location: 'https://unus777.github.io/ozon-unit-calc/sw.js?k=K', addEventListener: (n, f) => { handlers[n] = f; },
      registration: {scope: 'https://unus777.github.io/ozon-unit-calc/', showNotification: async (t, o) => { shown.push([t, o]); }}}};
  sw.addEventListener = sw.self.addEventListener; sw.registration = sw.self.registration;
  vm.createContext(sw);
  vm.runInContext(read('sw.js'), sw);
  let wait;
  handlers.push({waitUntil: p => { wait = p; }});
  await wait;
  return {shown, sw, handlers};
}
(async () => {
  let {shown, sw, handlers} = await swRun({type: 'new', posting: '1-1-1', cb: 'ЦБ-7', packs: '8 уп', address: 'Химки', unload: 'Нет'});
  assert.equal(shown.length, 1);
  assert.match(shown[0][0], /Новый заказ ЦБ-7/);
  assert.equal(shown[0][1].tag, 'order-1-1-1');
  assert.equal(shown[0][1].requireInteraction, true);
  assert.equal(shown[0][1].renotify, true);
  assert.ok(shown[0][1].vibrate.length > 2);
  assert.equal(shown[0][1].data.url, 'courier.html?k=K&o=1-1-1#alert=1-1-1');
  let wait; handlers.notificationclick({notification: {close() {}, data: shown[0][1].data}, waitUntil: p => { wait = p; }});
  await wait;
  assert.equal(sw.opened, 'https://unus777.github.io/ozon-unit-calc/courier.html?k=K&o=1-1-1#alert=1-1-1');
  ({shown} = await swRun({type: 'repeat', posting: '1-1-1', cb: 'ЦБ-7', tries: 3, more: [{posting: '2-2-2', cb: 'ЦБ-8', tries: 2}]}));
  assert.equal(shown.map(x => x[1].tag).sort().join(), 'order-1-1-1,order-2-2-2');
  assert.ok(shown.every(x => x[1].requireInteraction && /#alert=/.test(x[1].data.url)));
  assert.match(shown.find(x => x[1].tag === 'order-1-1-1')[0], /Примите заказ ЦБ-7 · 3-й раз/);
  ({shown} = await swRun({type: 'remind', posting: '1-1-1', cb: 'ЦБ-7', text: 'позвони'}));
  assert.equal(shown[0][1].requireInteraction, false);                    // напоминание — обычное
  assert.ok(!shown[0][1].data.url.includes('#alert'));
  ({shown} = await swRun({role: 'owner', type: 'accepted', posting: '1-1-1', title: '👍 Рашад принял ЦБ-7', text: 'Химки'}));
  assert.equal(shown[0][0], '👍 Рашад принял ЦБ-7');
  assert.equal(shown[0][1].data.url, './');
  console.log('«Принял» и экран тревоги: проверки пройдены');
})().catch(err => { console.error(err); process.exit(1); });

