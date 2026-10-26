// VAPID JWT (RFC 8292) для пуша курьеру. Подписывает браузер владельца ключом из его localStorage;
// скрипт таблицы только пересылает подпись в службу пушей.
const b64url = bytes => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const b64json = o => b64url(new TextEncoder().encode(JSON.stringify(o)));

async function vapidJwt(aud, jwk) {
  const key = await crypto.subtle.importKey("jwk", jwk, {name: "ECDSA", namedCurve: "P-256"}, false, ["sign"]);
  const data = b64json({typ: "JWT", alg: "ES256"}) + "." +
    b64json({aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: "https://unus777.github.io/ozon-unit-calc/"});
  const sig = await crypto.subtle.sign({name: "ECDSA", hash: "SHA-256"}, key, new TextEncoder().encode(data));
  return data + "." + b64url(new Uint8Array(sig));  // WebCrypto отдаёт r||s — ровно формат JWT ES256
}

// Напоминание курьеру о заказе: спрашивает текст, подписывает пуш ключом из этого браузера, отправляет через таблицу
async function sendReminder(posting, adminKey) {
  const text = prompt("Текст напоминания курьеру (можно оставить пустым):", "");
  if (text === null) return null;
  const raw = (() => { try { return localStorage.getItem("dlv_vk"); } catch { return null; } })();
  if (!raw) throw new Error("На этом устройстве нет ключа уведомлений — вставьте вашу ссылку доступа в ⚙ Настройки");
  const jwk = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(raw.replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0))));
  const jwts = {};
  for (const aud of await sheetApi({action: "push_targets", key: adminKey})) jwts[aud] = await vapidJwt(aud, jwk);
  const res = await sheetApi({action: "remind", key: adminKey, posting, text, jwts});
  alert(res.pushed ? "Напоминание отправлено курьеру" : "Курьер не включил уведомления — напоминание не дошло");
  return res;
}

if (typeof module !== "undefined") module.exports = {vapidJwt};
