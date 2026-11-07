// Экран тревоги: новый заказ на весь экран, с вибрацией, пока не нажмут «Принял». Звука нет ни в какой час.
// Веб-приложение не может включить экран телефона само — это работает, когда приложение открыто;
// закрытое приложение будит липкий пуш (sw.js), нажатие на него открывает этот экран (#alert=<номер>).
const Alarm = (() => {
  let queue = [], opts = {}, loop = null, titleLoop = null, el = null, baseTitle = document.title;
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"})[c]);
  // Ночная плашка по Москве (isNight из config.js). На звук не влияет: звука нет и днём, и ночью.
  const night = () => typeof isNight === "function" && isNight();

  function unlock() {}

  // Chrome разрешает вибрацию только после первого касания страницы
  function buzz() { try { if (navigator.vibrate && (!navigator.userActivation || navigator.userActivation.hasBeenActive)) navigator.vibrate([500, 200, 500, 200, 800]); } catch {} }
  function tick() { buzz(); }

  function chip(c) {
    return `<div class="al-chip"><span>${esc(c.k)}</span><b class="${c.warn ? "am" : ""}">${esc(c.v)}</b></div>`;
  }
  function render() {
    const it = queue[0];
    if (!it) return close();
    if (!el) {
      el = document.createElement("div");
      el.id = "alarm"; el.className = "alarm"; el.setAttribute("role", "alertdialog"); el.setAttribute("aria-modal", "true");
      el.setAttribute("aria-labelledby", "alTitle");
      document.body.appendChild(el);
      document.documentElement.classList.add("alarm-on");
      el.addEventListener("click", ev => {
        const b = ev.target.closest("[data-alok]");
        if (b) accept(b);
      });
    }
    const more = queue.length > 1 ? `<span class="al-count">ещё ${queue.length - 1}</span>` : "";
    el.innerHTML = `<div class="al-in">
      <div class="al-top"><span class="al-kick"><span class="al-dot"></span>${esc(it.kicker || "Новый заказ")}</span>${more}</div>
      ${night() ? `<div class="al-night">${typeof ic === "function" ? ic("moon", "s") : ""}Ночной режим · без звука</div>` : ""}
      <div class="al-ring" aria-hidden="true"><span></span><span></span>${typeof ic === "function" ? ic(it.icon || "box") : ""}</div>
      <div class="al-main">
        ${it.badge ? `<div class="al-badge">${esc(it.badge)}</div>` : ""}
        <h1 id="alTitle">${esc(it.title)}</h1>
        ${it.sub ? `<div class="al-sub">${esc(it.sub)}</div>` : ""}
        ${(it.chips || []).length ? `<div class="al-chips">${it.chips.map(chip).join("")}</div>` : ""}
        ${it.note ? `<div class="al-note">${esc(it.note)}</div>` : ""}
      </div>
      <div class="al-foot">
        <button type="button" class="al-ok" data-alok="${esc(it.id)}">${typeof ic === "function" ? ic("check") : ""}${esc(it.okText || "Принял")}</button>
        <div class="al-foot-t">Вибрация повторяется, пока вы не нажмёте «${esc(it.okText || "Принял")}»</div>
      </div>
    </div>`;
    if (!loop) { tick(); loop = setInterval(tick, 2200); }
    if (!titleLoop) { baseTitle = document.title; let f = 0; titleLoop = setInterval(() => { document.title = (f = !f) ? "🔔 " + (it.kicker || "Новый заказ") : baseTitle; }, 1000); }
    setTimeout(() => el && el.querySelector(".al-ok")?.focus({preventScroll: true}), 50);
  }

  async function accept(btn) {
    const it = queue[0];
    if (!it || btn.disabled) return;
    btn.disabled = true;
    try { if (opts.onAccept) await opts.onAccept(it); } catch {}
    queue = queue.filter(x => x.id !== it.id);
    render();
  }

  function close() {
    clearInterval(loop); clearInterval(titleLoop); loop = titleLoop = null;
    document.title = baseTitle;
    try { if (navigator.vibrate && (!navigator.userActivation || navigator.userActivation.hasBeenActive)) navigator.vibrate(0); } catch {}
    if (el) { el.remove(); el = null; }
    document.documentElement.classList.remove("alarm-on");
    if (/[#&]alert=/.test(location.hash)) history.replaceState(null, "", location.pathname + location.search);
    if (opts.onClose) opts.onClose();
  }

  // items: [{id, kicker, title, sub, badge, chips:[{k,v,warn}], note, okText, icon}]; first — показать первым
  function show(items, o = {}) {
    opts = Object.assign(opts, o);
    const ids = new Set(queue.map(x => x.id));
    for (const it of items) if (!ids.has(it.id)) queue.push(it); else queue = queue.map(x => x.id === it.id ? it : x);
    if (o.first) queue.sort((a, b) => (b.id === o.first) - (a.id === o.first));
    const keep = new Set(items.map(x => x.id));
    if (o.replace) queue = queue.filter(x => keep.has(x.id));
    if (queue.length) render(); else if (el) close();
  }
  const hashId = () => { const m = /[#&]alert=([^&]+)/.exec(location.hash); return m ? decodeURIComponent(m[1]) : null; };
  return {show, hashId, get open() { return !!el; }, unlock};
})();
