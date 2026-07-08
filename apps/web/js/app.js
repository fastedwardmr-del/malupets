const API = window.MALUPETS_CONFIG?.apiBaseUrl || "";
const $ = (s) => document.querySelector(s);
async function api(path, options={}){
  const res = await fetch(API + path, { headers:{"Content-Type":"application/json"}, ...options });
  return await res.json();
}
function money(v){ return new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',maximumFractionDigits:0}).format(v||0); }
window.Malu = { api, money, $ };
