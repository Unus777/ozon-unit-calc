// Экран тревоги: новый заказ на весь экран, со звуком и вибрацией, пока не нажмут «Принял».
// Веб-приложение не может включить экран телефона само — это работает, когда приложение открыто;
// закрытое приложение будит липкий пуш (sw.js), нажатие на него открывает этот экран (#alert=<номер>).
// Звук — сгенерированный WebAudio-сигнал без файлов. iOS разрешает звук только после касания экрана,
// поэтому аудио «разблокируется» первым касанием, а до него показывается подсказка.
const Alarm = (() => {
  let AC = null, queue = [], opts = {}, loop = null, titleLoop = null, el = null, baseTitle = document.title;
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"})[c]);
  const soundOn = () => !!AC && AC.state === "running";

  function unlock() {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      AC = AC || new Ctx();
      if (AC.state !== "running") AC.resume().then(hint, () => {});
      // iOS: тихий звук внутри касания окончательно разрешает воспроизведение
      const o = AC.createOscillator(), g = AC.createGain();
      g.gain.value = 0.0001; o.connect(g).connect(AC.destination); o.start(); o.stop(AC.currentTime + 0.02);
    } catch {}
    setTimeout(hint, 60);
  }
  addEventListener("pointerdown", unlock, {capture: true, passive: true});
  addEventListener("keydown", unlock, {capture: true});
  document.addEventListener("visibilitychange", () => { if (!document.hidden && el && AC) AC.resume().catch(() => {}); });

  function beep() {
    if (!soundOn()) return;
    const t = AC.currentTime;
    [[988, 0], [1319, .2], [988, .4], [1319, .6]].forEach(([f, dt]) => {
      const o = AC.createOscillator(), g = AC.createGain();
      o.type = "triangle"; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t + dt);
      g.gain.exponentialRampToValueAtTime(0.5, t + dt + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dt + 0.18);
      o.connect(g).connect(AC.destination); o.start(t + dt); o.stop(t + dt + 0.2);
    });
  }
  // Chrome разрешает вибрацию только после первого касания страницы
  function buzz() { try { if (navigator.vibrate && (!navigator.userActivation || navigator.userActivation.hasBeenActive)) navigator.vibrate([500, 150, 500, 150, 900]); } catch {} }
  function tick() { beep(); buzz(); }

  function hint() {
    const h = el && el.querySelector(".al-hint");
    if (h) h.hidden = soundOn();
  }

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
      <div class="al-ring" aria-hidden="true"><span></span><span></span>${typeof ic === "function" ? ic(it.icon || "box") : ""}</div>
      <div class="al-main">
        ${it.badge ? `<div class="al-badge">${esc(it.badge)}</div>` : ""}
        <h1 id="alTitle">${esc(it.title)}</h1>
        ${it.sub ? `<div class="al-sub">${esc(it.sub)}</div>` : ""}
        ${(it.chips || []).length ? `<div class="al-chips">${it.chips.map(chip).join("")}</div>` : ""}
        ${it.note ? `<div class="al-note">${esc(it.note)}</div>` : ""}
      </div>
      <div class="al-foot">
        <div class="al-hint" ${soundOn() ? "hidden" : ""}>${typeof ic === "function" ? ic("bell", "s") : ""}Коснитесь экрана, чтобы включить звук</div>
        <button type="button" class="al-ok" data-alok="${esc(it.id)}">${typeof ic === "function" ? ic("check") : ""}${esc(it.okText || "Принял")}</button>
        <div class="al-foot-t">Сигнал повторяется, пока вы не нажмёте «${esc(it.okText || "Принял")}»</div>
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
    try { navigator.vibrate && navigator.vibrate(0); } catch {}
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
  return {show, hashId, get open() { return !!el; }, unlock, soundOn};
})();
