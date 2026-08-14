import { json } from "../utils/response.js";

const COMPANY_ID = 1;

function permissionsOf(user) {
  if (Array.isArray(user?.permissions)) return user.permissions;
  try {
    const parsed = JSON.parse(user?.permissions || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function isAdmin(user) {
  return String(user?.role || "").toUpperCase() === "ADMIN";
}

function hasPermission(user, permission) {
  if (isAdmin(user)) return true;
  const permissions = permissionsOf(user);
  return permissions.includes("*") || permissions.includes(permission);
}

function localDateParts() {
  // D1 stores CURRENT_TIMESTAMP in UTC. Colombia is UTC-5.
  const now = new Date(Date.now() - (5 * 60 * 60 * 1000));
  const pad = n => String(n).padStart(2, "0");
  return {
    date: `${now.getUTCFullYear()}-${pad(now.getUTCMonth() + 1)}-${pad(now.getUTCDate())}`,
    now: `${now.getUTCFullYear()}-${pad(now.getUTCMonth() + 1)}-${pad(now.getUTCDate())} ${pad(now.getUTCHours())}:${pad(now.getUTCMinutes())}:${pad(now.getUTCSeconds())}`
  };
}

export async function getDashboard(request, env, user) {
  const role = String(user?.role || "").toUpperCase();
  const { date: today, now } = localDateParts();

  // Dashboard operativo para personal SPA:
  // solo información asociada al usuario autenticado.
  if (role === "SPA") {
    const { results: todayAppointments } = await env.DB.prepare(`
      SELECT
        a.id,
        a.start_at,
        a.end_at,
        a.status,
        a.notes,
        p.name AS pet_name,
        p.species AS pet_species,
        c.full_name AS customer_name,
        c.phone AS customer_phone,
        s.name AS service_name
      FROM appointments a
      INNER JOIN pets p ON p.id = a.pet_id
      INNER JOIN customers c ON c.id = a.customer_id
      INNER JOIN appointment_services s ON s.id = a.service_id
      WHERE a.company_id = ?
        AND a.assigned_user_id = ?
        AND date(a.start_at) = date(?)
      ORDER BY datetime(a.start_at) ASC
    `).bind(COMPANY_ID, user.id, today).all();

    const { results: upcoming } = await env.DB.prepare(`
      SELECT
        a.id,
        a.start_at,
        a.end_at,
        a.status,
        p.name AS pet_name,
        c.full_name AS customer_name,
        s.name AS service_name
      FROM appointments a
      INNER JOIN pets p ON p.id = a.pet_id
      INNER JOIN customers c ON c.id = a.customer_id
      INNER JOIN appointment_services s ON s.id = a.service_id
      WHERE a.company_id = ?
        AND a.assigned_user_id = ?
        AND datetime(a.start_at) >= datetime(?)
        AND a.status NOT IN ('COMPLETED','CANCELLED','NO_SHOW')
      ORDER BY datetime(a.start_at) ASC
      LIMIT 8
    `).bind(COMPANY_ID, user.id, now).all();

    const list = Array.isArray(todayAppointments) ? todayAppointments : [];
    const active = list.filter(a => !["CANCELLED", "NO_SHOW"].includes(a.status));

    return json({
      ok: true,
      mode: "SPA",
      user: {
        id: user.id,
        full_name: user.full_name,
        role
      },
      today,
      stats: {
        assigned_today: active.length,
        pending_today: active.filter(a => ["SCHEDULED", "CONFIRMED"].includes(a.status)).length,
        in_progress_today: active.filter(a => a.status === "IN_PROGRESS").length,
        completed_today: list.filter(a => a.status === "COMPLETED").length
      },
      appointments_today: list,
      upcoming: upcoming || []
    });
  }

  // Dashboard general, con datos reales. Solo consulta cada bloque si el
  // usuario tiene permiso para ese módulo.
  const result = {
    ok: true,
    mode: isAdmin(user) ? "ADMIN" : "GENERAL",
    user: {
      id: user.id,
      full_name: user.full_name,
      role
    },
    today,
    stats: {},
    recent_sales: [],
    appointments_today: [],
    low_stock: [],
    cash: null
  };

  if (hasPermission(user, "customers")) {
    const row = await env.DB.prepare(`
      SELECT COUNT(*) AS total
      FROM customers
      WHERE company_id = ? AND is_active = 1
    `).bind(COMPANY_ID).first();
    result.stats.customers = Number(row?.total || 0);
  }

  if (hasPermission(user, "pets")) {
    const row = await env.DB.prepare(`
      SELECT COUNT(*) AS total
      FROM pets
      WHERE company_id = ? AND is_active = 1
    `).bind(COMPANY_ID).first();
    result.stats.pets = Number(row?.total || 0);
  }

  if (hasPermission(user, "sales") || hasPermission(user, "pos")) {
    const salesToday = await env.DB.prepare(`
      SELECT COUNT(*) AS count, COALESCE(SUM(total),0) AS total
      FROM sales
      WHERE company_id = ? AND date(created_at) = date(?)
    `).bind(COMPANY_ID, today).first();

    result.stats.sales_today_count = Number(salesToday?.count || 0);
    result.stats.sales_today_total = Number(salesToday?.total || 0);

    const { results } = await env.DB.prepare(`
      SELECT
        sales.id,
        sales.invoice_number,
        sales.total,
        sales.payment_method,
        sales.created_at,
        customers.full_name AS customer_name
      FROM sales
      LEFT JOIN customers ON customers.id = sales.customer_id
      WHERE sales.company_id = ?
      ORDER BY datetime(sales.created_at) DESC, sales.id DESC
      LIMIT 5
    `).bind(COMPANY_ID).all();

    result.recent_sales = results || [];
  }

  if (hasPermission(user, "agenda")) {
    const { results } = await env.DB.prepare(`
      SELECT
        a.id,
        a.start_at,
        a.status,
        p.name AS pet_name,
        s.name AS service_name,
        u.full_name AS assigned_user_name
      FROM appointments a
      INNER JOIN pets p ON p.id = a.pet_id
      INNER JOIN appointment_services s ON s.id = a.service_id
      LEFT JOIN users u ON u.id = a.assigned_user_id
      WHERE a.company_id = ?
        AND date(a.start_at) = date(?)
      ORDER BY datetime(a.start_at) ASC
      LIMIT 12
    `).bind(COMPANY_ID, today).all();

    result.appointments_today = results || [];
    result.stats.appointments_today = (results || [])
      .filter(a => !["CANCELLED","NO_SHOW"].includes(a.status)).length;
  }

  if (hasPermission(user, "inventory")) {
    const { results } = await env.DB.prepare(`
      SELECT id, sku, name, stock, unit
      FROM products
      WHERE company_id = ?
        AND is_active = 1
        AND stock <= 5
      ORDER BY stock ASC, name ASC
      LIMIT 8
    `).bind(COMPANY_ID).all();

    result.low_stock = results || [];
    result.stats.low_stock = (results || []).length;
  }

  if (hasPermission(user, "cash")) {
    const openCash = await env.DB.prepare(`
      SELECT
        cs.id,
        cs.opening_amount,
        cs.opened_at,
        u.full_name AS opened_by_name
      FROM cash_sessions cs
      LEFT JOIN users u ON u.id = cs.opened_by
      WHERE cs.company_id = ? AND cs.status = 'OPEN'
      ORDER BY cs.id DESC
      LIMIT 1
    `).bind(COMPANY_ID).first();

    result.cash = openCash || null;
  }

  return json(result);
}
