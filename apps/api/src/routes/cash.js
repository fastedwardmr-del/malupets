import { json, readJson } from "../utils/response.js";

const COMPANY_ID = 1;

function amount(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

function normalizeType(value) {
  const type = String(value || "").trim().toUpperCase();
  return ["INCOME", "EXPENSE"].includes(type) ? type : "";
}

async function getOpenSession(env) {
  return await env.DB.prepare(`
    SELECT
      cs.*,
      opener.full_name AS opened_by_name,
      closer.full_name AS closed_by_name
    FROM cash_sessions cs
    LEFT JOIN users opener ON opener.id = cs.opened_by
    LEFT JOIN users closer ON closer.id = cs.closed_by
    WHERE cs.company_id = ? AND cs.status = 'OPEN'
    ORDER BY cs.id DESC
    LIMIT 1
  `).bind(COMPANY_ID).first();
}

async function getSessionMetrics(env, session, endAt = null) {
  if (!session) return null;

  const end = endAt || session.closed_at || null;

  let salesQuery = `
    SELECT
      COALESCE(SUM(CASE WHEN lower(trim(payment_method)) = 'efectivo' THEN total ELSE 0 END), 0) AS cash_sales,
      COALESCE(SUM(CASE WHEN lower(trim(payment_method)) <> 'efectivo' THEN total ELSE 0 END), 0) AS non_cash_sales,
      COALESCE(SUM(total), 0) AS total_sales,
      COUNT(*) AS sales_count
    FROM sales
    WHERE company_id = ?
      AND datetime(created_at) >= datetime(?)
  `;
  const salesBindings = [COMPANY_ID, session.opened_at];

  if (end) {
    salesQuery += ` AND datetime(created_at) <= datetime(?)`;
    salesBindings.push(end);
  }

  const sales = await env.DB.prepare(salesQuery).bind(...salesBindings).first();

  const manual = await env.DB.prepare(`
    SELECT
      COALESCE(SUM(CASE WHEN type = 'INCOME' THEN amount ELSE 0 END), 0) AS income,
      COALESCE(SUM(CASE WHEN type = 'EXPENSE' THEN amount ELSE 0 END), 0) AS expense,
      COUNT(*) AS movement_count
    FROM cash_movements
    WHERE cash_session_id = ?
  `).bind(session.id).first();

  let paymentQuery = `
    SELECT payment_method, COUNT(*) AS sales_count, COALESCE(SUM(total), 0) AS total
    FROM sales
    WHERE company_id = ?
      AND datetime(created_at) >= datetime(?)
  `;
  const paymentBindings = [COMPANY_ID, session.opened_at];

  if (end) {
    paymentQuery += ` AND datetime(created_at) <= datetime(?)`;
    paymentBindings.push(end);
  }

  paymentQuery += ` GROUP BY payment_method ORDER BY total DESC`;

  const { results: paymentBreakdown } = await env.DB.prepare(paymentQuery)
    .bind(...paymentBindings)
    .all();

  const opening = amount(session.opening_amount);
  const cashSales = amount(sales?.cash_sales);
  const income = amount(manual?.income);
  const expense = amount(manual?.expense);
  const expected = amount(opening + cashSales + income - expense);

  return {
    opening_amount: opening,
    cash_sales: cashSales,
    non_cash_sales: amount(sales?.non_cash_sales),
    total_sales: amount(sales?.total_sales),
    sales_count: Number(sales?.sales_count || 0),
    income,
    expense,
    movement_count: Number(manual?.movement_count || 0),
    expected_amount: expected,
    payment_breakdown: Array.isArray(paymentBreakdown) ? paymentBreakdown : []
  };
}

export async function getCurrentCash(request, env) {
  const session = await getOpenSession(env);

  if (!session) {
    return json({
      ok: true,
      is_open: false,
      session: null,
      metrics: null,
      movements: []
    });
  }

  const metrics = await getSessionMetrics(env, session);

  const { results: movements } = await env.DB.prepare(`
    SELECT
      cm.*,
      u.full_name AS user_name
    FROM cash_movements cm
    LEFT JOIN users u ON u.id = cm.user_id
    WHERE cm.cash_session_id = ?
    ORDER BY cm.created_at DESC, cm.id DESC
    LIMIT 100
  `).bind(session.id).all();

  return json({
    ok: true,
    is_open: true,
    session,
    metrics,
    movements: Array.isArray(movements) ? movements : []
  });
}

export async function openCash(request, env, user) {
  const existing = await getOpenSession(env);
  if (existing) {
    return json({
      ok: false,
      error: `Ya existe una caja abierta por ${existing.opened_by_name || "otro usuario"}`
    }, 409);
  }

  const body = await readJson(request);
  const openingAmount = amount(body.opening_amount);

  if (openingAmount < 0) {
    return json({ ok: false, error: "El saldo inicial no puede ser negativo" }, 400);
  }

  const result = await env.DB.prepare(`
    INSERT INTO cash_sessions (
      company_id, opened_by, opening_amount, status, opening_notes
    )
    VALUES (?, ?, ?, 'OPEN', ?)
  `).bind(
    COMPANY_ID,
    user.id,
    openingAmount,
    String(body.notes || "").trim()
  ).run();

  return json({
    ok: true,
    message: "Caja abierta correctamente",
    id: result.meta.last_row_id
  }, 201);
}

export async function createCashMovement(request, env, user) {
  const session = await getOpenSession(env);
  if (!session) {
    return json({ ok: false, error: "No hay una caja abierta" }, 409);
  }

  const body = await readJson(request);
  const type = normalizeType(body.type);
  const movementAmount = amount(body.amount);

  if (!type) {
    return json({ ok: false, error: "Tipo de movimiento inválido" }, 400);
  }

  if (movementAmount <= 0) {
    return json({ ok: false, error: "El valor debe ser mayor que cero" }, 400);
  }

  const result = await env.DB.prepare(`
    INSERT INTO cash_movements (
      company_id, cash_session_id, user_id, type, amount, reference, notes
    )
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(
    COMPANY_ID,
    session.id,
    user.id,
    type,
    movementAmount,
    String(body.reference || "").trim(),
    String(body.notes || "").trim()
  ).run();

  return json({
    ok: true,
    message: type === "INCOME" ? "Ingreso registrado" : "Egreso registrado",
    id: result.meta.last_row_id
  }, 201);
}

export async function closeCash(request, env, user) {
  const session = await getOpenSession(env);
  if (!session) {
    return json({ ok: false, error: "No hay una caja abierta" }, 409);
  }

  const body = await readJson(request);
  const counted = amount(body.closing_counted);

  if (counted < 0) {
    return json({ ok: false, error: "El efectivo contado no puede ser negativo" }, 400);
  }

  const now = new Date().toISOString().replace("T", " ").replace("Z", "");
  const metrics = await getSessionMetrics(env, session, now);
  const difference = amount(counted - metrics.expected_amount);

  await env.DB.prepare(`
    UPDATE cash_sessions
    SET
      closed_by = ?,
      closed_at = ?,
      closing_counted = ?,
      expected_amount = ?,
      difference = ?,
      closing_notes = ?,
      status = 'CLOSED',
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND company_id = ? AND status = 'OPEN'
  `).bind(
    user.id,
    now,
    counted,
    metrics.expected_amount,
    difference,
    String(body.notes || "").trim(),
    session.id,
    COMPANY_ID
  ).run();

  return json({
    ok: true,
    message: "Caja cerrada correctamente",
    session_id: session.id,
    expected_amount: metrics.expected_amount,
    closing_counted: counted,
    difference
  });
}

export async function listCashHistory(request, env) {
  const { results } = await env.DB.prepare(`
    SELECT
      cs.*,
      opener.full_name AS opened_by_name,
      closer.full_name AS closed_by_name
    FROM cash_sessions cs
    LEFT JOIN users opener ON opener.id = cs.opened_by
    LEFT JOIN users closer ON closer.id = cs.closed_by
    WHERE cs.company_id = ? AND cs.status = 'CLOSED'
    ORDER BY cs.closed_at DESC, cs.id DESC
    LIMIT 50
  `).bind(COMPANY_ID).all();

  return json(Array.isArray(results) ? results : []);
}

export async function getCashSession(request, env, id) {
  const sessionId = Number(id);
  if (!Number.isInteger(sessionId) || sessionId <= 0) {
    return json({ ok: false, error: "ID de caja inválido" }, 400);
  }

  const session = await env.DB.prepare(`
    SELECT
      cs.*,
      opener.full_name AS opened_by_name,
      closer.full_name AS closed_by_name
    FROM cash_sessions cs
    LEFT JOIN users opener ON opener.id = cs.opened_by
    LEFT JOIN users closer ON closer.id = cs.closed_by
    WHERE cs.id = ? AND cs.company_id = ?
    LIMIT 1
  `).bind(sessionId, COMPANY_ID).first();

  if (!session) {
    return json({ ok: false, error: "Caja no encontrada" }, 404);
  }

  const metrics = await getSessionMetrics(env, session, session.closed_at || null);

  const { results: movements } = await env.DB.prepare(`
    SELECT cm.*, u.full_name AS user_name
    FROM cash_movements cm
    LEFT JOIN users u ON u.id = cm.user_id
    WHERE cm.cash_session_id = ?
    ORDER BY cm.created_at ASC, cm.id ASC
  `).bind(session.id).all();

  return json({
    ok: true,
    session,
    metrics,
    movements: Array.isArray(movements) ? movements : []
  });
}
