const API = window.MALUPETS_CONFIG?.apiBaseUrl || "";
const $ = (s) => document.querySelector(s);

const AUTH_TOKEN_KEY = "malupets_auth_token";
const AUTH_USER_KEY = "malupets_auth_user";

const PAGE_PERMISSIONS = {
  "dashboard": "dashboard",
  "dashboard.html": "dashboard",
  "pos": "pos",
  "pos.html": "pos",
  "ventas": "sales",
  "ventas.html": "sales",
  "clientes": "customers",
  "clientes.html": "customers",
  "mascotas": "pets",
  "mascotas.html": "pets",
  "inventario": "inventory",
  "inventario.html": "inventory",
  "agenda": "agenda",
  "agenda.html": "agenda",
  "caja": "cash",
  "caja.html": "cash",
  "reportes": "reports",
  "reportes.html": "reports",
  "configuracion": "settings",
  "configuracion.html": "settings"
};

const MENU_PERMISSIONS = {
  "dashboard": "dashboard", "dashboard.html": "dashboard",
  "pos": "pos", "pos.html": "pos",
  "ventas": "sales", "ventas.html": "sales",
  "clientes": "customers", "clientes.html": "customers",
  "mascotas": "pets", "mascotas.html": "pets",
  "inventario": "inventory", "inventario.html": "inventory",
  "agenda": "agenda", "agenda.html": "agenda",
  "caja": "cash", "caja.html": "cash",
  "reportes": "reports", "reportes.html": "reports",
  "configuracion": "settings", "configuracion.html": "settings"
};

function getToken() {
  return localStorage.getItem(AUTH_TOKEN_KEY) || "";
}

function getStoredUser() {
  try {
    const user = JSON.parse(localStorage.getItem(AUTH_USER_KEY) || "null");
    if (!user) return null;

    user.role = String(user.role || "").toUpperCase();
    user.permissions = normalizePermissions(user.permissions);

    return user;
  } catch {
    return null;
  }
}

function setSession(token, user) {
  localStorage.setItem(AUTH_TOKEN_KEY, token);
  localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user));
}

function clearSession() {
  localStorage.removeItem(AUTH_TOKEN_KEY);
  localStorage.removeItem(AUTH_USER_KEY);
}

function normalizePermissions(value) {
  if (Array.isArray(value)) return value;

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return value
        .split(",")
        .map(x => x.trim())
        .filter(Boolean);
    }
  }

  return [];
}

function hasPermission(permission, user = getStoredUser()) {
  if (!permission) return true;
  if (!user) return false;

  // El administrador siempre tiene acceso total.
  if (String(user.role || "").toUpperCase() === "ADMIN") {
    return true;
  }

  const permissions = normalizePermissions(user.permissions);
  return permissions.includes("*") || permissions.includes(permission);
}

function currentPage() {
  const path = window.location.pathname.replace(/\/+$/, "");
  if (!path || path === "/") return "index";
  return path.split("/").pop() || "index";
}

function isLoginPage() {
  const page = currentPage().toLowerCase();
  return page === "login" || page === "login.html";
}

function goLogin() {
  if (!isLoginPage()) {
    window.location.replace("/login");
  }
}

async function api(path, options = {}) {
  const isFormData = options.body instanceof FormData;
  const token = getToken();

  const headers = isFormData
    ? { ...(options.headers || {}) }
    : { "Content-Type": "application/json", ...(options.headers || {}) };

  if (token && !headers.Authorization) {
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(API + path, {
    ...options,
    headers
  });

  const contentType = res.headers.get("content-type") || "";
  const data = contentType.includes("application/json")
    ? await res.json()
    : await res.text();

  if (res.status === 401) {
    clearSession();

    // IMPORTANTE:
    // si el 401 viene del propio login, NO redirigir otra vez.
    if (path !== "/api/auth/login") {
      goLogin();
    }

    return typeof data === "object"
      ? data
      : { ok: false, error: "Sesión vencida" };
  }

  if (!res.ok) {
    if (typeof data === "object" && data !== null) {
      return { ...data, ok: false, status: res.status };
    }
    return { ok: false, status: res.status, error: data || `Error HTTP ${res.status}` };
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

function escapeBasic(value) {
  return String(value ?? "").replace(/[&<>'"]/g, m => ({
    "&":"&amp;",
    "<":"&lt;",
    ">":"&gt;",
    "'":"&#39;",
    '"':"&quot;"
  })[m]);
}

function ensureSalesMenu() {
  document.querySelectorAll(".nav").forEach(nav => {
    if (nav.querySelector('a[href="ventas.html"], a[href="ventas"]')) return;

    const pos = nav.querySelector('a[href="pos.html"], a[href="pos"]');
    if (!pos) return;

    const link = document.createElement("a");
    link.href = "ventas.html";
    link.textContent = "Ventas / Facturas";
    pos.insertAdjacentElement("afterend", link);
  });
}

function applyPermissionsToMenu() {
  const user = getStoredUser();

  document.querySelectorAll(".nav a").forEach(link => {
    const href = (link.getAttribute("href") || "").split("/").pop();
    const normalizedHref = String(href || "").replace(/^\//, "");
    const permission = MENU_PERMISSIONS[normalizedHref];

    if (permission && !hasPermission(permission, user)) {
      link.style.display = "none";
    }
  });
}

function injectSessionBox() {
  const sidebar = document.querySelector(".sidebar");
  const user = getStoredUser();

  if (!sidebar || !user || sidebar.querySelector(".session-box")) return;

  const box = document.createElement("div");
  box.className = "session-box";
  box.innerHTML = `
    <div style="font-size:12px;color:#64748b;margin-bottom:4px">Sesión activa</div>
    <strong style="display:block;font-size:13px;color:#0f172a">${escapeBasic(user.full_name || user.email)}</strong>
    <span style="display:block;font-size:11px;color:#64748b;margin:3px 0 9px">${escapeBasic(user.role || "")}</span>
    <button
      type="button"
      style="width:100%;border:0;border-radius:10px;padding:8px;background:#f1f5f9;cursor:pointer;font-weight:700"
      onclick="Malu.logout()"
    >
      Cerrar sesión
    </button>
  `;

  box.style.margin = "auto 12px 14px";
  box.style.padding = "12px";
  box.style.border = "1px solid #e8eef7";
  box.style.borderRadius = "14px";
  box.style.background = "#fff";

  sidebar.style.display = "flex";
  sidebar.style.flexDirection = "column";
  sidebar.appendChild(box);
}

async function logout() {
  try {
    if (getToken()) {
      await api("/api/auth/logout", { method: "POST" });
    }
  } catch {}

  clearSession();
  window.location.replace("/login");
}

function guardPage() {
  const page = currentPage();

  // El login jamás debe entrar al guard.
  if (isLoginPage()) return;

  const token = getToken();
  const user = getStoredUser();

  if (!token || !user) {
    goLogin();
    return;
  }

  const permission = PAGE_PERMISSIONS[page];

  if (permission && !hasPermission(permission, user)) {
    const fallback =
      hasPermission("dashboard", user) ? "/dashboard" :
      hasPermission("pos", user) ? "/pos" :
      hasPermission("agenda", user) ? "/agenda" :
      "/login";

    window.location.replace(fallback);
    return;
  }

  ensureSalesMenu();
  applyPermissionsToMenu();
  injectSessionBox();
}

window.Malu = {
  api,
  money,
  $,
  getToken,
  getStoredUser,
  setSession,
  clearSession,
  hasPermission,
  logout
};

guardPage();
