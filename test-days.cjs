// Раскладка заказов менеджера по дням, расчёт по заказу и правка карточки
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const read = file => fs.readFileSync(path.join(__dirname, file), 'utf8');
const ctx = {};
vm.createContext(ctx);
for (const f of ['calc.js', 'config.js', 'fbs.js', 'days.js']) vm.runInContext(read(f), ctx);
const today = '2026-11-21';
const post = (n, status, extra = {}) => Object.assign({posting_number: n, status, in_process_at: '2026-11-21T07:00:00Z',
  products: [{offer_id: 'ALM-600-JOZ', name: 'Керамогранит 60х60', quantity: 10, price: {amount: '3000'}}],
  delivery_price: '2500', prr_option: {code: 'lift', price: '1500'}, delivery_method: {warehouse_id: 1}}, extra);
const row = (n, status, date, extra = {}) => Object.assign({posting: n, status, date, delivery: '3000', lift: '1000', address: 'Москва'}, extra);

// даты
assert.equal(ctx.dayIso('21.11.2026'), '2026-11-21');
assert.equal(ctx.dayIso('21.11.2026 09:40'), '2026-11-21');
assert.equal(ctx.dayIso(''), '');
assert.equal(ctx.addDaysIso('2026-11-30', 1), '2026-12-01');
assert.equal(ctx.addDaysIso('2026-01-01', -1), '2025-12-31');
assert.equal(ctx.isoToRu('2026-11-21'), '21.11.2026');

const P = [
  post('A', 'delivering'),                       // сегодня в работе
  post('B', 'delivering'),                       // завтра
  post('C', 'delivering'),                       // без даты
  post('D', 'awaiting_deliver'),                 // новый, не отправлен
  post('E', 'delivered'),                        // доставлен сегодня
  post('F', 'delivered'),                        // доставлен 3 дня назад
  post('G', 'delivering'),                       // отменён вручную сегодня
  post('H', 'cancelled', {in_process_at: '2026-11-10T07:00:00Z'}),  // отменён Ozon давно, без строки
  post('I', 'delivering'),                       // дата прошла — в «Сегодня» с пометкой
  post('FBS', 'awaiting_deliver', {delivery_method: {warehouse_id: 1020005035230080}}),
];
const D = {
  A: row('A', 'Согласован', '21.11.2026'),
  B: row('B', 'Новый', '22.11.2026'),
  C: row('C', 'Новый', ''),
  E: row('E', 'Доставлен', '21.11.2026', {delivered_at: '21.11.2026 10:15'}),
  F: row('F', 'Доставлен', '18.11.2026', {delivered_at: '18.11.2026 15:00'}),
  G: row('G', 'Отменён', '21.11.2026'),
  I: row('I', 'Новый', '19.11.2026'),
};
const b = ctx.dayBuckets(P.map((p, i) => [p, i]), D, today);
const ids = list => list.map(x => x[0].posting_number).join(',');
assert.equal(ids(b.today.work), 'A,I');
assert.equal(b.today.work[1][2].late, true);
assert.equal(b.today.work[0][2].late, false);
assert.equal(ids(b.today.done), 'E');          // «Доставлено сегодня» отдельно от старых
assert.equal(ids(b.today.cancel), 'G');
assert.equal(ids(b.fresh.send), 'D');
assert.equal(ids(b.fresh.nodate), 'C');
assert.deepEqual(Object.keys(b.upcoming), ['2026-11-22']);
assert.equal(ids(b.upcoming['2026-11-22']), 'B');
assert.equal(ids(b.archive), 'F,H');          // старые не смешиваются с сегодняшними
assert.equal(b.fbs, 1);                        // FBS не попадает ни в один раздел Рашада
for (const list of [b.today.work, b.today.done, b.today.cancel, b.fresh.send, b.fresh.nodate, b.archive])
  assert.ok(!list.some(x => x[0].posting_number === 'FBS'));
// архив за период
assert.equal(ids(ctx.archiveRange(b.archive, '2026-11-14', '2026-11-20')), 'F');
assert.equal(ids(ctx.archiveRange(b.archive, '', '')), 'F,H');
assert.equal(ids(ctx.archiveRange(b.archive, '2026-11-18', '2026-11-18')), 'F');

// расчёт по заказу: товар, доставка клиента, оплата Рашаду, прибыль
const prices = {'ALM-600-JOZ': {commissions: {sales_percent_rfbs: 30}}};
const m = ctx.orderMoney(P[0], D.A, prices);
assert.equal(m.goods, 30000);
assert.equal(m.clientDelivery, 2500);
assert.equal(m.clientLift, 1500);
assert.equal(m.client, 34000);
assert.equal(m.courier, 4000);                 // из строки листа: доставка 3000 + подъём 1000
assert.equal(m.planned, false);
const [, t] = ctx.calc(P[0], prices, 0, 0);
assert.ok(Math.abs(m.profit - (t.profit + 2500 + 1500 - 4000)) < 1e-6);
const plan = ctx.orderMoney(P[3], undefined, prices);
assert.equal(plan.planned, true);
assert.equal(plan.courier, 4000);              // до отправки — из заказа Ozon
const noTile = ctx.orderMoney(post('X', 'delivering', {products: [{offer_id: 'ZZZ', name: 'Клей', quantity: 1, price: '500'}]}), null, {});
assert.equal(noTile.goods, 500);
assert.equal(noTile.profit, null);             // не плитка — прибыль не выдумываем
const s = ctx.sumMoney(b.today.work.concat(b.today.done), D, prices);
assert.equal(s.n, 3);
assert.equal(s.goods, 90000);
assert.equal(s.courier, 12000);

// доставка и подъём из Ozon, если не вписаны вручную
const ozP = post('O', 'delivering');
assert.deepEqual(JSON.parse(JSON.stringify(ctx.ozonLogistics(ozP))), {delivery: 2500, lift: 1500, known: true});
assert.equal(ctx.ozonLogistics(post('N', 'delivering', {prr_option: {code: 'none', price: '900'}})).lift, 0);   // подъём не заказан
const bare = post('L', 'delivering', {delivery_price: undefined, prr_option: undefined});
assert.equal(ctx.ozonLogistics(bare).delivery, 0);
assert.equal(ctx.ozonLogistics(bare, {L: {delivery: 1800, lift: 600}}).delivery, 1800);   // из кэша /v3/posting/fbs/get
const emptyRow = row('O', 'Новый', '21.11.2026', {delivery: '', lift: '0'});
const auto = ctx.orderMoney(ozP, emptyRow, prices);
assert.equal(auto.courier, 4000);                // пусто/0 в листе → 2500 + 1500 из Ozon
assert.equal(auto.deliveryAuto, true); assert.equal(auto.liftAuto, true); assert.equal(auto.auto, true);
assert.ok(Math.abs(auto.profit - t.profit) < 1e-6);   // клиент заплатил ровно столько, сколько ушло Рашаду
const manual = ctx.orderMoney(ozP, row('O', 'Новый', '', {delivery: '3200', lift: ''}), prices);
assert.equal(manual.courierDelivery, 3200);      // вписанное вручную главнее
assert.equal(manual.courierLift, 1500);
assert.equal(manual.deliveryAuto, false); assert.equal(manual.liftAuto, true);
assert.deepEqual(JSON.parse(JSON.stringify(ctx.ozonPayFill(ozP, emptyRow, null, {}))), {delivery: '2500', lift: '1500'});
assert.equal(ctx.ozonPayFill(ozP, emptyRow, null, {O: 1}), null);                              // менеджер сам поставил 0
assert.equal(ctx.ozonPayFill(ozP, row('O', 'Доставлен', '', {delivery: ''}), null, {}), null);  // старые выплаты не трогаем
assert.equal(ctx.ozonPayFill(ozP, row('O', 'Новый', '', {delivery: '3000', lift: '900'}), null, {}), null);
assert.equal(ctx.ozonPayFill(P[9], row('FBS', 'Новый', '', {delivery: ''}), null, {}), null);  // FBS не трогаем
assert.deepEqual(JSON.parse(JSON.stringify(ctx.payField('', 2500))), {value: 2500, auto: true});
assert.deepEqual(JSON.parse(JSON.stringify(ctx.payField('0', 2500))), {value: 0, auto: false});
assert.deepEqual(JSON.parse(JSON.stringify(ctx.payField(' 1 800 ', 2500))), {value: 1800, auto: false});
assert.match(read('index.html'), /payField\(details\.delivery_pay/);

// правка карточки: только изменённые поля, служебные не уходят
const patch = ctx.editPatch({cb: 'ЦБ-1', address: 'Москва', phone: "'+79160000000", date: '21.11.2026', delivery: '3000', lift: '0', status: 'Новый', pay: '3000'},
  {cb: 'ЦБ-1', address: 'Химки, ул. Мира, 1', phone: '+79160000000', date: '22.11.2026', delivery: '3000', lift: '500', status: 'Доставлен', pay: '1'});
assert.deepEqual(JSON.parse(JSON.stringify(patch)), {address: 'Химки, ул. Мира, 1', date: '22.11.2026', lift: '500'});
assert.deepEqual(JSON.parse(JSON.stringify(ctx.editPatch({address: 'a'}, {address: ' a '}))), {});

// Code.gs: менеджер может менять адрес, дату, телефон и ставить «Отменён»; курьер — нет
const gvm = {};
vm.createContext(gvm);
vm.runInContext(read('apps-script/Code.gs'), gvm);
const base = {status: 'Новый', address: 'Москва', date: '', phone: '', courier_comment: ''};
const adm = gvm.applyDeliveryPatch(base, {address: 'Химки', date: '22.11.2026', phone: '+7916', status: 'Отменён'}, false);
assert.equal(adm.address, 'Химки'); assert.equal(adm.status, 'Отменён'); assert.equal(adm.phone, '+7916');
const cour = gvm.applyDeliveryPatch(base, {address: 'Химки', delivery: '99999'}, true);
assert.equal(cour.address, 'Москва'); assert.equal(cour.delivery, undefined);
assert.throws(() => gvm.applyDeliveryPatch(base, {status: 'Удалён'}, false));
const page = read('index.html');
assert.match(page, /data-cancelorder/);
assert.match(page, /status: "Отменён"/);
assert.match(page, /data-editform/);
assert.match(page, /days\.js\?v=/);
assert.doesNotMatch(page, /data-view="calc"><span data-ic="calc">/);   // отдельной вкладки «Расчёт» в меню нет
assert.doesNotMatch(read('courier.html'), /менеджер видит|видит ваше местоположение|Местоположение передаётся/i);
console.log('Разделы по дням, расчёт в карточке, правка и отмена: проверки пройдены');
