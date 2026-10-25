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

function calc(posting, prices, adRub = 0) {
  const lines = [];
  const t = { sales: 0, commission: 0, acquiring: 0, cost: 0, m2: 0, packs: 0 };
  for (const p of posting.products) {
    const fmt = tileFormat(p.offer_id, p.name);
    if (!fmt) throw new Error(`Не плитка 60×60/60×120: ${p.offer_id} — расчёт ₽/м² не применим`);
    const f = FORMATS[fmt], qty = p.quantity, price = parseFloat(p.price);
    const info = prices[p.offer_id] || {};
    const pct = (info.commissions || {}).sales_percent_rfbs || 51;
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
  t.ad = adRub;
  t.profit = t.payout - t.cost - adRub;
  t.payout_m2 = t.payout / t.m2;
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
  return [lines, t];
}

if (typeof module !== "undefined") module.exports = { calc, tileFormat };
