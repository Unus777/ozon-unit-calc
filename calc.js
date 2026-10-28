// Расчёт юнит-экономики — копия calc() из ../app.py (формула 5 окт 2026). Меняешь одно — меняй и другое.
const FORMATS = {
  "60×60": { m2: 1.80, cost: 1600, floor: 1000, floorOpt: 1000 },
  "60×120": { m2: 1.44, cost: 1800, floor: 1300, floorOpt: 1265 },
};
const OPT_FROM_PACKS = 20, ACQUIRING = 0.01, POSTING_FEE = 20, VAT = 0.22, EDGE_RUB_M2 = 50;

function tileFormat(offerId, name) {
  const text = `${offerId} ${name}`.toLowerCase().replace(/[xх]/g, "×");
  if (offerId.includes("612") || text.includes("60×120")) return "60×120";
  if (offerId.includes("600") || text.includes("60×60")) return "60×60";
  return null;
}

function isFbsPosting(posting) {
  return !!(posting && (posting.tpl_integration_type === "ozon" ||
    (posting.delivery_method || {}).warehouse_id === 1020005035230080 ||
    (posting.delivery_method || {}).tpl_provider === "Доставка Ozon"));
}

function calc(posting, prices, adRub = 0, ppzFee = 0) {
  const lines = [];
  const t = { sales: 0, commission: 0, acquiring: 0, cost: 0, m2: 0, packs: 0 };
  const fbs = isFbsPosting(posting);
  for (const p of posting.products) {
    const fmt = tileFormat(p.offer_id, p.name);
    if (!fmt) throw new Error(`Не плитка 60×60/60×120: ${p.offer_id} — расчёт ₽/м² не применим`);
    // /v3/posting/fbs/get отдаёт цену строкой, /v4/posting/fbs/list — объектом {amount, currency}
    const f = FORMATS[fmt], qty = p.quantity, price = parseFloat(p.price?.amount ?? p.price);
    const info = prices[p.offer_id] || {};
    const comms = info.commissions || {};
    const pct = (fbs ? comms.sales_percent_fbs : comms.sales_percent_rfbs) || comms.sales_percent_rfbs || comms.sales_percent_fbs || 51;
    const boost = ((info.marketing_actions || {}).actions || [])
      .some(a => (a.title || "").toLowerCase().includes("бустинг"));
    const sales = price * qty;
    const line = { offer_id: p.offer_id, name: p.name, fmt, qty, price, m2: f.m2 * qty, price_m2: price / f.m2,
      pct, boost, sales, commission: sales * pct / 100, acquiring: sales * ACQUIRING, cost: f.cost * qty };
    lines.push(line);
    for (const k of ["sales", "commission", "acquiring", "cost", "m2"]) t[k] += line[k];
    t.packs += qty;
  }
  t.fee = POSTING_FEE;
  t.balance = t.sales - t.commission - t.acquiring - POSTING_FEE;
  t.vat_out = t.sales * VAT / (1 + VAT);
  t.vat_in_commission = t.commission * VAT / (1 + VAT);
  t.vat_in_cost = t.cost * VAT / (1 + VAT);
  t.vat = Math.max(0, t.vat_out - t.vat_in_commission - t.vat_in_cost);
  t.payout = t.balance - t.vat;
  t.ppz_fee = Number(ppzFee) || 0;
  t.ad = adRub;
  t.profit = t.payout - t.cost - adRub - t.ppz_fee;
  t.payout_clean = t.payout - t.ppz_fee;
  t.payout_m2 = t.payout_clean / t.m2;
  t.profit_m2 = t.profit / t.m2;

  const fmts = new Set(lines.map(l => l.fmt));
  const opt = t.packs >= OPT_FROM_PACKS;
  t.floor = Math.max(...[...fmts].map(x => opt ? FORMATS[x].floorOpt : FORMATS[x].floor));
  t.opt = opt && fmts.has("60×120");
  t.status = t.payout_m2 < t.floor ? ["red", "🔴 Ниже порога"]
    : t.payout_m2 < t.floor + EDGE_RUB_M2 ? ["yellow", "🟡 На грани порога"] : ["green", "🟢 Выше порога"];

  const prr = posting.prr_option || {};
  t.delivery = parseFloat(posting.delivery_price || 0);
  t.lift = parseFloat(prr.price || 0);
  t.lift_note = ({ lift: "лифт", stairs: "без лифта" })[prr.code] || prr.code || "";
  if (prr.floor) t.lift_note += `, этаж ${prr.floor}`;
  t.is_fbs = fbs;
  return [lines, t];
}

// «Керамогранит Джозефина Полиш 60х60 глянцевый…» → «Керамогранит Джозефина Полиш 60х60»
function shortName(name) {
  const m = name.match(/^.*?60\s*[xх×]\s*(?:120|60)/i);
  return m ? m[0] : name;
}

// Текст для кнопки «Скопировать»: блок на каждый товар отправления.
// ponytail: товар считается как отдельное отправление (сбор 20 ₽ на каждый) — расхождение копейки на м² в смешанных заказах
function copyText(posting, prices) {
  return posting.products.map(p => {
    const [, t] = calc({ ...posting, products: [p] }, prices);
    return `${p.quantity} уп, ${p.offer_id}\n${shortName(p.name)}\n${Math.round(t.payout_m2)} руб м2\nпродажа озон`;
  }).join("\n\n");
}

if (typeof module !== "undefined") module.exports = { calc, tileFormat, shortName, copyText, isFbsPosting };
