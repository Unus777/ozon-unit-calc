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

if (typeof module !== "undefined") module.exports = {vapidJwt};
