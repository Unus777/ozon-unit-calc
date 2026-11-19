// Правила статуса для веб-приложения таблицы «Заказы озон».
// В развёрнутом проекте Apps Script замените место, где сохранение даты
// само ставит статус «Согласован», на applyDeliveryPatch. Дата и согласие разделены:
// «Согласован» приходит только явной кнопкой курьера (поле status в запросе).
// «Отменён» допустим: страница менеджера пишет его, когда Ozon отменил заказ.
//
// После правки заново опубликуйте ту же веб-приложение:
// Развернуть → Управление развёртываниями → карандаш у текущего развёртывания →
// Версия: «Новая версия» → Развернуть. Адрес (URL) не меняется, SCRIPT_URL трогать не нужно.

var COURIER_FIELDS = ["date", "status", "courier_comment"];
var DELIVERY_STATUSES = ["Новый", "Согласован", "Доставлен", "Отменён"];

function applyDeliveryPatch(row, data, courier) {
  var next = {};
  var key;
  for (key in (row || {})) if (Object.prototype.hasOwnProperty.call(row, key)) next[key] = row[key];
  var keys = courier ? COURIER_FIELDS : Object.keys(data || {});
  for (var i = 0; i < keys.length; i++) {
    key = keys[i];
    if (!data || !Object.prototype.hasOwnProperty.call(data, key)) continue;
    if (key === "status" && DELIVERY_STATUSES.indexOf(data.status) < 0) throw new Error("Неизвестный статус: " + data.status);
    next[key] = data[key];
  }
  return next;
}
