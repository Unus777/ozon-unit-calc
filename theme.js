// Тема страницы: "auto" (как в телефоне), "light", "dark". Подключается в <head>, чтобы не мигало.
const THEMES = {auto: "Авто", light: "Светлая", dark: "Тёмная"};

function getTheme() {
  try { return localStorage.getItem("theme") || "auto"; } catch { return "auto"; }
}

function setTheme(t) {
  if (t === "auto") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.setAttribute("data-theme", t);
  try { localStorage.setItem("theme", t); } catch {}
}

// Переключатель-сегмент: <div class="seg"></div>
function mountThemeSwitch(el) {
  const draw = () => {
    el.innerHTML = Object.entries(THEMES).map(([k, v]) =>
      `<button type="button" data-t="${k}" aria-pressed="${getTheme() === k}">${v}</button>`).join("");
  };
  el.onclick = ev => {
    const b = ev.target.closest("[data-t]");
    if (b) { setTheme(b.dataset.t); draw(); }
  };
  draw();
}

setTheme(getTheme());
