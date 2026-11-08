// FBS склада «FBS Алмалы (Плитка 60×60 Розница)». Грузовик Ozon забирает плитку со склада.
// Эти отправления не попадают Рашаду: нет action create, нет напоминаний, нет пуша.
// ЦБ пишется существующим action update, только если строка доставки уже есть.
// Новую строку не создаём — скрипт таблицы на create шлёт заказ курьеру.
// Локальные этапы живут в этом браузере и не подменяют статус Ozon.
const FBS_WAREHOUSE_ID = "1020005035230080";
const FBS_WAREHOUSE_NAME = "FBS Алмалы (Плитка 60×60 Розница)";
const FBS_LOCAL_KEY = "fbs_local_v1";
const FBS_LOCAL_STAGES = ["collect", "pack", "label", "truck", "handed"];
const OZON_FBS_STATUS = {
  awaiting_registration: "Оформляется в Ozon",
  acceptance_in_progress: "Оформляется в Ozon",
  awaiting_approve: "Ожидает подтверждения Ozon",
  awaiting_packaging: "Ждёт сборки",
  awaiting_deliver: "Ждёт отгрузки, этикетку можно печатать",
  not_accepted: "Ozon не принял отправление",
  driver_pickup: "Водитель Ozon забирает — это уже отметка Ozon",
  delivering: "Ozon принял отправление и везёт его",
  sent_by_seller: "Ozon отметил передачу в доставку",
  delivered: "Ozon: доставлено покупателю",
  cancelled: "Отменён в Ozon",
  arbitration: "Спор в Ozon",
  client_arbitration: "Спор в Ozon",
};

function isAlmalyFbs(posting) {
  if (!posting || typeof posting !== "object") return false;
  const dm = posting.delivery_method || {};
  const id = dm.warehouse_id != null && String(dm.warehouse_id).trim() !== "" ? String(dm.warehouse_id).trim() : "";
  if (id === FBS_WAREHOUSE_ID) return true;
  const name = String(dm.warehouse || dm.warehouse_name || "").trim();
  return name === FBS_WAREHOUSE_NAME;
}

// Строка листа «Доставки», которую старый сценарий ППЗ уже отправил курьеру.
// «Реутовская» сама по себе не признак: так может называться адрес покупателя rFBS.
function isFbsSheetRow(row) {
  if (!row || typeof row !== "object") return false;
  return /ППЗ/i.test(String(row.address || "")) || /ППЗ/i.test(String(row.unload || ""));
}

function rashadDeliveries(rows) {
  return (rows || []).filter(row => !isFbsSheetRow(row));
}

function assertRashadPath(posting, row) {
  if (isAlmalyFbs(posting) || isFbsSheetRow(row)) {
    const err = new Error("FBS не отправляется Рашаду и не шлёт ему напоминания");
    err.code = "fbs-isolated";
    throw err;
  }
}

// Только родительский order_id или order_number. Название, покупатель и обрезка номера отправления не группируют.
function fbsOrderKey(posting) {
  if (!posting) return "";
  const id = posting.order_id;
  if (id != null && String(id).trim() !== "" && String(id).trim() !== "0") return "id:" + String(id).trim();
  const num = posting.order_number != null ? String(posting.order_number).trim() : "";
  return num ? "num:" + num : "";
}

function fbsGroupKey(posting) {
  if (!posting) return "";
  return fbsOrderKey(posting) || "posting:" + String(posting.posting_number || "");
}

function fbsSiblings(posting, postings) {
  if (!isAlmalyFbs(posting)) return [];
  const key = fbsOrderKey(posting);
  const list = (postings || []).filter(isAlmalyFbs);
  if (!key) return list.filter(p => p.posting_number === posting.posting_number);
  return list.filter(p => fbsOrderKey(p) === key);
}

function groupFbsPostings(postings) {
  const groups = new Map();
  for (const posting of postings || []) {
    if (!isAlmalyFbs(posting)) continue;
    const key = fbsGroupKey(posting);
    if (!groups.has(key)) groups.set(key, {key, ungrouped: !fbsOrderKey(posting), postings: []});
    groups.get(key).postings.push(posting);
  }
  return [...groups.values()].map(group => {
    group.postings.sort((a, b) => String(a.posting_number).localeCompare(String(b.posting_number), "ru"));
    return group;
  });
}

function orderTab(posting, row) {
  if (isAlmalyFbs(posting)) return "fbs";
  if (!posting) return "cancel";
  if (posting.status === "delivered" || (row && row.status === "Доставлен")) return "done";
  if (!row) return posting.status === "cancelled" ? "cancel" : "new";
  return "courier";
}

function normalizeCb(raw) {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  if (/^\d+$/.test(s)) return "ЦБ-" + s;
  return s.toUpperCase().replace(/^ЦБ\s*-?\s*/, "ЦБ-");
}

function loadFbsState(storage) {
  try {
    const parsed = JSON.parse((storage && storage.get(FBS_LOCAL_KEY)) || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch { return {}; }
}

function saveFbsState(storage, state) {
  storage.set(FBS_LOCAL_KEY, JSON.stringify(state));
}

function cbSources(postingNumber, deliv, localState) {
  const row = deliv && deliv[postingNumber];
  const local = localState && localState[postingNumber];
  const sheet = normalizeCb(row && row.cb);
  const here = normalizeCb(local && local.cb);
  const values = [];
  if (sheet) values.push(sheet);
  if (here && here !== sheet) values.push(here);
  return {sheet, local: here, values};
}

function groupCbPicture(group, deliv, localState) {
  const rows = (group || []).map(posting => Object.assign({posting: posting.posting_number}, cbSources(posting.posting_number, deliv, localState)));
  const values = [];
  for (const row of rows) for (const value of row.values) if (!values.includes(value)) values.push(value);
  return {rows, values, agreed: values.length === 1 ? values[0] : "", conflict: values.length > 1};
}

function sharedCbPlan(group, deliv, localState, raw) {
  const cb = normalizeCb(raw);
  if (!cb) return {error: "Введите номер ЦБ"};
  const picture = groupCbPicture(group, deliv, localState);
  const conflicts = picture.rows.filter(row => row.values.some(value => value !== cb)).map(row => ({
    posting: row.posting, current: row.values.filter(value => value !== cb),
  }));
  return {cb, group, picture, conflicts, needsConfirm: conflicts.length > 0};
}

function fbsCbSavedText(res) {
  const n = res.numbers.length;
  const tail = " Рашаду ничего не отправлялось.";
  if (res.updated.length && res.localOnly.length) {
    return `${res.cb} записан для ${n} отправлений: где строка уже была — в таблице, остальные только на этом устройстве.` + tail;
  }
  if (res.updated.length) return `${res.cb} записан в таблицу для ${n} отправлений и останется после перезагрузки.` + tail;
  return `${res.cb} сохранён на этом устройстве для ${n} отправлений и останется после перезагрузки. В таблицу не писали: новой доставки нет, иначе заказ ушёл бы Рашаду.`;
}

// Существующий механизм — action update поля cb. create/remind/jwts сюда не входят.
async function persistSharedCb({numbers, cb, deliv, sheetApi, adminKey, storage, allowSheet}) {
  const list = (numbers || []).map(String);
  if (!list.length) throw new Error("Нет отправлений FBS для этого заказа");
  const norm = normalizeCb(cb);
  if (!norm) throw new Error("Введите номер ЦБ");
  const book = deliv || {};
  const updated = [];
  const localOnly = [];
  const canSheet = !!(allowSheet && adminKey && typeof sheetApi === "function");
  if (canSheet) {
    for (const posting of list) {
      if (!book[posting]) { localOnly.push(posting); continue; }
      if (normalizeCb(book[posting].cb) === norm) { updated.push(book[posting]); continue; }
      const row = await sheetApi({action: "update", key: adminKey, posting, data: {cb: norm}});
      if (!row || String(row.posting) !== posting || normalizeCb(row.cb) !== norm) {
        throw new Error("Таблица не подтвердила номер ЦБ. Он не отмечен как записанный.");
      }
      updated.push(row);
    }
  } else localOnly.push(...list);
  const state = loadFbsState(storage);
  for (const posting of list) {
    const prev = state[posting] || {};
    state[posting] = {cb: norm, stages: Object.assign({}, prev.stages), at: Object.assign({}, prev.at)};
  }
  saveFbsState(storage, state);
  return {numbers: list, cb: norm, updated, localOnly};
}

function setFbsStage(storage, postingNumber, stage, on, now) {
  if (!FBS_LOCAL_STAGES.includes(stage)) throw new Error("Неизвестный этап FBS");
  const all = loadFbsState(storage);
  const prev = all[postingNumber] || {};
  const stages = Object.assign({}, prev.stages);
  const at = Object.assign({}, prev.at);
  if (on) { stages[stage] = true; if (now) at[stage] = now; }
  else { delete stages[stage]; delete at[stage]; }
  const next = {stages, at};
  if (prev.cb) next.cb = prev.cb;
  all[postingNumber] = next;
  saveFbsState(storage, all);
  return next;
}

function setFbsStageAll(storage, numbers, stage, on, now) {
  let last = null;
  for (const posting of numbers || []) last = setFbsStage(storage, posting, stage, on, now);
  return last;
}

function applyLabelResult(storage, postingNumber, result, now) {
  if (!result || result.ok !== true) {
    return {ok: false, error: (result && result.error) || "Этикетка не напечатана.", state: loadFbsState(storage)[postingNumber] || null};
  }
  return {ok: true, state: setFbsStage(storage, postingNumber, "label", true, now)};
}

function publicOzonError(text, secrets) {
  let out = String(text || "");
  for (const secret of secrets || []) if (secret) out = out.split(String(secret)).join("");
  return out.replace(/api[-_ ]?key/gi, "").replace(/\s+/g, " ").trim().slice(0, 180);
}

async function requestFbsLabel({postingNumber, online, fetchImpl, cid, key}) {
  if (!postingNumber) return {ok: false, error: "Нет номера отправления. Этикетка не напечатана."};
  if (online === false) return {ok: false, error: "Нет подключения. Этикетка не напечатана."};
  if (!cid || !key) return {ok: false, error: "Нет ключей Ozon. Этикетка не напечатана."};
  let res;
  try {
    res = await fetchImpl("https://api-seller.ozon.ru/v2/posting/fbs/package-label", {
      method: "POST",
      headers: {"Client-Id": cid, "Api-Key": key, "Content-Type": "application/json"},
      body: JSON.stringify({posting_number: [String(postingNumber)]}),
    });
  } catch {
    return {ok: false, error: "Сеть недоступна. Этикетка не напечатана."};
  }
  if (!res || !res.ok) {
    let detail = "";
    try { detail = await res.text(); } catch {}
    detail = publicOzonError(detail, [cid, key]);
    const code = res && res.status ? " (" + res.status + ")" : "";
    return {ok: false, error: `Ozon не отдал этикетку${code}. Этикетка не напечатана.${detail ? " " + detail : ""}`};
  }
  const type = res.headers && res.headers.get ? (res.headers.get("content-type") || "") : "";
  if (type && !/pdf|octet-stream/i.test(type)) {
    return {ok: false, error: "Ozon вернул не PDF. Этикетка не напечатана."};
  }
  if (typeof res.blob !== "function") return {ok: false, error: "Ответ Ozon без файла. Этикетка не напечатана."};
  const blob = await res.blob();
  if (!blob || !blob.size) return {ok: false, error: "Ozon вернул пустой файл. Этикетка не напечатана."};
  return {ok: true, blob, type: type || "application/pdf"};
}

function officialOzon(posting) {
  const status = String((posting && posting.status) || "");
  const substatus = String((posting && posting.substatus) || "");
  const finalDelivery = status === "delivered" || substatus === "posting_conditionally_delivered";
  const accepted = finalDelivery || status === "driver_pickup" || status === "delivering" || status === "sent_by_seller";
  let label = OZON_FBS_STATUS[status] || (status ? "Статус Ozon: " + status : "Статус Ozon не пришёл");
  if (finalDelivery && status !== "delivered") label = "Ozon: условно доставлено";
  return {status, substatus, label, accepted, finalDelivery};
}

function shipText(posting) {
  const raw = posting && posting.shipment_date;
  if (!raw) return "Срок отгрузки в ответе Ozon не пришёл";
  const date = new Date(raw);
  if (isNaN(date.getTime())) return "Срок отгрузки в ответе Ozon не пришёл";
  const formatted = new Intl.DateTimeFormat("ru-RU", {timeZone: "Europe/Moscow", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit"}).format(date);
  return "Собрать и отгрузить до " + formatted + " МСК";
}

function warehouseLine(posting) {
  const dm = (posting && posting.delivery_method) || {};
  const name = String(dm.warehouse || dm.warehouse_name || FBS_WAREHOUSE_NAME);
  const id = String(dm.warehouse_id || FBS_WAREHOUSE_ID);
  return name + " · " + id;
}

function fbsEsc(value) {
  return String(value ?? "").replace(/[&<>"']/g, ch => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"})[ch]);
}

function productLine(posting) {
  return (posting.products || []).map(product => {
    const qty = product.quantity != null ? product.quantity + " уп" : "";
    return [qty, product.name || product.offer_id || ""].filter(Boolean).join(" · ");
  }).join("; ") || "Состав в ответе Ozon не пришёл";
}

function stageOn(local, postingNumber, stage) {
  return !!(local && local[postingNumber] && local[postingNumber].stages && local[postingNumber].stages[stage]);
}

function fbsBoardHtml(postings, opts) {
  const options = opts || {};
  const deliv = options.deliv || {};
  const local = options.local || {};
  const pending = options.pending || null;
  const groups = groupFbsPostings(postings);
  if (!groups.length) {
    return `<div class="card empty">Нет отправлений со склада ${fbsEsc(FBS_WAREHOUSE_NAME)}</div>`;
  }
  const orders = groups.filter(group => !group.ungrouped).length + groups.filter(group => group.ungrouped).length;
  const parts = groups.reduce((sum, group) => sum + group.postings.length, 0);
  const intro = `<div class="card fbs-intro"><b>FBS · грузовик Ozon на склад</b><p>Склад ${fbsEsc(FBS_WAREHOUSE_NAME)}, ${fbsEsc(FBS_WAREHOUSE_ID)}. Собрать → упаковать → распечатать этикетку → передать приехавшему грузовику. ${orders} ${orders === 1 ? "заказ" : "заказа"} · ${parts} ${parts === 1 ? "отправление" : "отправлений"}. Эти отправления не уходят Рашаду.</p></div>`;
  return `<div class="fbs-wrap">${intro}<div class="fbs-list">${groups.map(group => fbsGroupHtml(group, deliv, local, pending)).join("")}</div></div>`;
}

function fbsGroupHtml(group, deliv, local, pending) {
  const picture = groupCbPicture(group.postings, deliv, local);
  const key = group.key;
  const parent = group.postings.find(posting => posting.order_number) || group.postings[0];
  const orderLabel = parent.order_number ? String(parent.order_number) : (parent.order_id ? "заказ " + parent.order_id : "без номера заказа Ozon");
  const digits = picture.agreed ? picture.agreed.replace(/^ЦБ-/, "") : "";
  const conflict = picture.conflict || (pending && pending.key === key);
  const typed = pending && pending.key === key ? pending.cb : "";
  const choices = conflict ? [...picture.values] : [];
  if (typed && !choices.includes(typed)) choices.unshift(typed);
  const conflictHtml = conflict ? `<div class="fbs-conflict" role="alert"><b>Разные ЦБ. Ничего само не заменено.</b><ul>${picture.rows.map(row => `<li>${fbsEsc(row.posting)}: ${row.values.length ? row.values.map(fbsEsc).join(" и ") : "пусто"}</li>`).join("")}</ul>${choices.length ? `<div class="fbs-choices">${choices.map(value => `<button type="button" class="soft" data-fbs-apply data-order="${fbsEsc(key)}" data-cb="${fbsEsc(value)}">Записать всем ${fbsEsc(value)}</button>`).join("")}</div>` : ""}<button type="button" class="text" data-fbs-cancel>Оставить как есть</button></div>` : "";
  const posts = group.postings.map(posting => fbsPostingHtml(posting, local)).join("");
  const numbers = group.postings.map(posting => posting.posting_number);
  const allTruck = numbers.every(number => stageOn(local, number, "truck"));
  const allHanded = numbers.every(number => stageOn(local, number, "handed"));
  return `<article class="card fbs-order" data-order="${fbsEsc(key)}" data-warehouse="${fbsEsc(FBS_WAREHOUSE_ID)}">
<div class="top"><span class="badge fbs">FBS</span><b>${fbsEsc(orderLabel)}</b><span class="pn ml">${group.postings.length} отпр.</span></div>
<p class="fbs-wh">${fbsEsc(warehouseLine(parent))}</p>
<p class="fbs-due">${fbsEsc(shipText(parent))}</p>
${group.ungrouped ? `<p class="mut">Ozon не прислал номер заказа — ЦБ только у этого отправления.</p>` : `<p class="mut">Один номер ЦБ на все отправления этого заказа.</p>`}
<form data-fbs-cb data-order="${fbsEsc(key)}">
<label>Номер ЦБ<span class="pref">ЦБ-<input name="cb" inputmode="numeric" autocomplete="off" aria-label="Номер ЦБ для всех отправлений заказа ${fbsEsc(orderLabel)}" value="${fbsEsc(digits)}" placeholder="975"></span></label>
<button type="submit" class="tint">Сохранить ЦБ для всех ${group.postings.length}</button>
</form>
${conflictHtml}
<div class="fbs-steps fbs-all">
<button type="button" class="soft" data-fbs-stage-all="truck" data-order="${fbsEsc(key)}" aria-pressed="${allTruck}">Грузовик прибыл всем</button>
<button type="button" class="soft" data-fbs-stage-all="handed" data-order="${fbsEsc(key)}" aria-pressed="${allHanded}">Передано всем</button>
</div>
<p class="fbs-note">«Грузовик прибыл» и «Передано» — локальные отметки. Они не меняют статус Ozon и не означают доставку покупателю.</p>
${posts}
</article>`;
}

function fbsPostingHtml(posting, local) {
  const number = posting.posting_number;
  const official = officialOzon(posting);
  const button = (stage, label) => {
    const on = stageOn(local, number, stage);
    return `<button type="button" class="${on ? "tint" : "soft"}" data-fbs-stage="${stage}" data-posting="${fbsEsc(number)}" aria-pressed="${on}">${label}</button>`;
  };
  const labelOn = stageOn(local, number, "label");
  return `<div class="fbs-post">
<div class="top"><span class="pn">${fbsEsc(number)}</span><span class="badge ${official.finalDelivery ? "done" : official.accepted ? "way" : "ship"} ml">${fbsEsc(official.label)}</span></div>
<div class="t2">${fbsEsc(productLine(posting))}</div>
<p class="mut">${fbsEsc(shipText(posting))}</p>
<p class="ozstate ${official.accepted ? "ok" : ""}">Официально в Ozon: ${fbsEsc(official.label)}.${official.substatus ? " Подстатус: " + fbsEsc(official.substatus) + "." : ""} Локальная отметка это не заменяет.</p>
<div class="fbs-steps">
${button("collect", "Собрать")}
${button("pack", "Упаковать")}
<button type="button" class="${labelOn ? "tint" : "ghost"}" data-fbs-label data-posting="${fbsEsc(number)}" aria-label="Распечатать этикетку отправления ${fbsEsc(number)}" aria-pressed="${labelOn}">Распечатать этикетку</button>
${button("truck", "Грузовик Ozon прибыл")}
${button("handed", "Передано грузовику Ozon")}
</div>
</div>`;
}

if (typeof module !== "undefined") module.exports = {
  FBS_WAREHOUSE_ID, FBS_WAREHOUSE_NAME, FBS_LOCAL_KEY, FBS_LOCAL_STAGES,
  isAlmalyFbs, isFbsSheetRow, rashadDeliveries, assertRashadPath,
  fbsOrderKey, fbsGroupKey, fbsSiblings, groupFbsPostings, orderTab, normalizeCb,
  loadFbsState, saveFbsState, cbSources, groupCbPicture, sharedCbPlan, fbsCbSavedText, persistSharedCb,
  setFbsStage, setFbsStageAll, applyLabelResult, requestFbsLabel, publicOzonError,
  officialOzon, shipText, warehouseLine, fbsBoardHtml,
};
