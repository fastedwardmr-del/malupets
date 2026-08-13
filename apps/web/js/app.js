const API = window.MALUPETS_CONFIG?.apiBaseUrl || "";
const $ = (s) => document.querySelector(s);

async function api(path, options = {}) {
  const isFormData = options.body instanceof FormData;
  const headers = isFormData
    ? { ...(options.headers || {}) }
    : { "Content-Type": "application/json", ...(options.headers || {}) };

  const res = await fetch(API + path, {
    ...options,
    headers
  });

  const contentType = res.headers.get("content-type") || "";
  const data = contentType.includes("application/json") ? await res.json() : await res.text();

  if (!res.ok && typeof data === "string") {
    return { ok: false, error: data || `Error HTTP ${res.status}` };
  }

  return data;
}

function money(v) {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0
  }).format(v || 0);
}

window.Malu = { api, money, $ };
