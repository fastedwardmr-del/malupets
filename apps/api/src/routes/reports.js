import { json } from "../utils/response.js";

const COMPANY_ID = 1;

function cleanDate(value) {
  const text = String(value || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : "";
}

function todayColombia() {
  const now = new Date(Date.now() - 5 * 60 * 60 * 1000);
  const pad = n => String(n).padStart(2, "0");
  return `${now.getUTCFullYear()}-${pad(now.getUTCMonth() + 1)}-${pad(now.getUTCDate())}`;
}

function firstDayOfMonth(dateText) {
  return `${dateText.slice(0, 8)}01`;
}

export async function getReports(request, env) {
  const url = new URL(request.url);
  const today = todayColombia();
  const from = cleanDate(url.searchParams.get("from")) || firstDayOfMonth(today);
  const to = cleanDate(url.searchParams.get("to")) || today;

  if (from > to) {
    return json({ ok: false, error: "La fecha inicial no puede ser mayor que la final" }, 400);
  }

  const [
    salesSummary,
    salesByPayment,
    salesByDay,
    topProducts,
    salesDetail,
    inventoryRows,
    inventorySummary,
    cashClosures,
    cashMovements,
    appointmentSummary,
    agendaByService,
    agendaByStatus,
    agendaByStaff,
    appointmentDetail,
    customerSummary,
    petSummary
  ] = await Promise.all([
    env.DB.prepare(`
      SELECT
        COUNT(*) AS sales_count,
        COALESCE(SUM(total), 0) AS sales_total,
        COALESCE(AVG(total), 0) AS average_ticket,
        COALESCE(SUM(CASE WHEN lower(trim(payment_method)) = 'efectivo' THEN total ELSE 0 END), 0) AS cash_sales,
        COALESCE(SUM(CASE WHEN lower(trim(payment_method)) <> 'efectivo' THEN total ELSE 0 END), 0) AS non_cash_sales
      FROM sales
      WHERE company_id = ?
        AND date(datetime(created_at, '-5 hours')) BETWEEN date(?) AND date(?)
    `).bind(COMPANY_ID, from, to).first(),

    env.DB.prepare(`
      SELECT
        COALESCE(NULLIF(trim(payment_method), ''), 'Sin definir') AS payment_method,
        COUNT(*) AS sales_count,
        COALESCE(SUM(total), 0) AS total
      FROM sales
      WHERE company_id = ?
        AND date(datetime(created_at, '-5 hours')) BETWEEN date(?) AND date(?)
      GROUP BY COALESCE(NULLIF(trim(payment_method), ''), 'Sin definir')
      ORDER BY total DESC
    `).bind(COMPANY_ID, from, to).all(),

    env.DB.prepare(`
      SELECT
        date(datetime(created_at, '-5 hours')) AS sale_date,
        COUNT(*) AS sales_count,
        COALESCE(SUM(total), 0) AS total
      FROM sales
      WHERE company_id = ?
        AND date(datetime(created_at, '-5 hours')) BETWEEN date(?) AND date(?)
      GROUP BY date(datetime(created_at, '-5 hours'))
      ORDER BY sale_date ASC
    `).bind(COMPANY_ID, from, to).all(),

    env.DB.prepare(`
      SELECT
        si.product_id,
        si.product_name,
        COALESCE(SUM(si.quantity), 0) AS quantity,
        COALESCE(SUM(si.total), 0) AS total
      FROM sale_items si
      INNER JOIN sales s ON s.id = si.sale_id
      WHERE s.company_id = ?
        AND date(datetime(s.created_at, '-5 hours')) BETWEEN date(?) AND date(?)
      GROUP BY si.product_id, si.product_name
      ORDER BY quantity DESC, total DESC
      LIMIT 20
    `).bind(COMPANY_ID, from, to).all(),

    env.DB.prepare(`
      SELECT
        s.id,
        s.invoice_number,
        datetime(s.created_at, '-5 hours') AS created_at_local,
        COALESCE(c.full_name, 'Cliente ocasional') AS customer_name,
        s.payment_method,
        s.subtotal,
        s.tax,
        s.total,
        s.notes,
        COALESCE((
          SELECT SUM(si.quantity)
          FROM sale_items si
          WHERE si.sale_id = s.id
        ), 0) AS item_count
      FROM sales s
      LEFT JOIN customers c ON c.id = s.customer_id
      WHERE s.company_id = ?
        AND date(datetime(s.created_at, '-5 hours')) BETWEEN date(?) AND date(?)
      ORDER BY datetime(s.created_at) DESC, s.id DESC
      LIMIT 1000
    `).bind(COMPANY_ID, from, to).all(),

    env.DB.prepare(`
      SELECT
        sku, name, category, description,
        cost_price, sale_price, stock, unit,
        is_active
      FROM products
      WHERE company_id = ?
      ORDER BY name ASC
    `).bind(COMPANY_ID).all(),

    env.DB.prepare(`
      SELECT
        COUNT(*) AS product_count,
        COALESCE(SUM(stock), 0) AS total_units,
        COALESCE(SUM(stock * cost_price), 0) AS inventory_cost_value,
        COALESCE(SUM(stock * sale_price), 0) AS inventory_sale_value,
        COALESCE(SUM(CASE WHEN is_active = 1 AND stock <= 5 THEN 1 ELSE 0 END), 0) AS low_stock_count
      FROM products
      WHERE company_id = ?
    `).bind(COMPANY_ID).first(),

    env.DB.prepare(`
      SELECT
        cs.id,
        datetime(cs.opened_at, '-5 hours') AS opened_at_local,
        datetime(cs.closed_at, '-5 hours') AS closed_at_local,
        opener.full_name AS opened_by_name,
        closer.full_name AS closed_by_name,
        cs.opening_amount,
        cs.expected_amount,
        cs.closing_counted,
        cs.difference,
        cs.opening_notes,
        cs.closing_notes
      FROM cash_sessions cs
      LEFT JOIN users opener ON opener.id = cs.opened_by
      LEFT JOIN users closer ON closer.id = cs.closed_by
      WHERE cs.company_id = ?
        AND cs.status = 'CLOSED'
        AND date(datetime(cs.closed_at, '-5 hours')) BETWEEN date(?) AND date(?)
      ORDER BY datetime(cs.closed_at) DESC, cs.id DESC
      LIMIT 500
    `).bind(COMPANY_ID, from, to).all(),

    env.DB.prepare(`
      SELECT
        cm.id,
        datetime(cm.created_at, '-5 hours') AS created_at_local,
        cm.type,
        cm.amount,
        cm.reference,
        cm.notes,
        u.full_name AS user_name,
        cm.cash_session_id
      FROM cash_movements cm
      LEFT JOIN users u ON u.id = cm.user_id
      WHERE cm.company_id = ?
        AND date(datetime(cm.created_at, '-5 hours')) BETWEEN date(?) AND date(?)
      ORDER BY datetime(cm.created_at) DESC, cm.id DESC
      LIMIT 1000
    `).bind(COMPANY_ID, from, to).all(),

    env.DB.prepare(`
      SELECT
        COUNT(*) AS appointment_count,
        COALESCE(SUM(CASE WHEN status = 'COMPLETED' THEN 1 ELSE 0 END), 0) AS completed_count,
        COALESCE(SUM(CASE WHEN status = 'CANCELLED' THEN 1 ELSE 0 END), 0) AS cancelled_count,
        COALESCE(SUM(CASE WHEN status = 'NO_SHOW' THEN 1 ELSE 0 END), 0) AS no_show_count
      FROM appointments
      WHERE company_id = ?
        AND date(start_at) BETWEEN date(?) AND date(?)
    `).bind(COMPANY_ID, from, to).first(),

    env.DB.prepare(`
      SELECT
        s.name AS service_name,
        COUNT(*) AS appointment_count,
        COALESCE(SUM(CASE WHEN a.status = 'COMPLETED' THEN 1 ELSE 0 END), 0) AS completed_count
      FROM appointments a
      INNER JOIN appointment_services s ON s.id = a.service_id
      WHERE a.company_id = ?
        AND date(a.start_at) BETWEEN date(?) AND date(?)
      GROUP BY s.id, s.name
      ORDER BY completed_count DESC, appointment_count DESC, s.name ASC
    `).bind(COMPANY_ID, from, to).all(),

    env.DB.prepare(`
      SELECT
        status,
        COUNT(*) AS appointment_count
      FROM appointments
      WHERE company_id = ?
        AND date(start_at) BETWEEN date(?) AND date(?)
      GROUP BY status
      ORDER BY appointment_count DESC
    `).bind(COMPANY_ID, from, to).all(),

    env.DB.prepare(`
      SELECT
        COALESCE(u.full_name, 'Sin asignar') AS staff_name,
        COUNT(*) AS appointment_count,
        COALESCE(SUM(CASE WHEN a.status = 'COMPLETED' THEN 1 ELSE 0 END), 0) AS completed_count
      FROM appointments a
      LEFT JOIN users u ON u.id = a.assigned_user_id
      WHERE a.company_id = ?
        AND date(a.start_at) BETWEEN date(?) AND date(?)
      GROUP BY a.assigned_user_id, u.full_name
      ORDER BY completed_count DESC, appointment_count DESC
    `).bind(COMPANY_ID, from, to).all(),

    env.DB.prepare(`
      SELECT
        a.id,
        a.start_at,
        a.end_at,
        a.status,
        c.full_name AS customer_name,
        p.name AS pet_name,
        p.species AS pet_species,
        s.name AS service_name,
        COALESCE(u.full_name, 'Sin asignar') AS assigned_user_name,
        a.notes
      FROM appointments a
      INNER JOIN customers c ON c.id = a.customer_id
      INNER JOIN pets p ON p.id = a.pet_id
      INNER JOIN appointment_services s ON s.id = a.service_id
      LEFT JOIN users u ON u.id = a.assigned_user_id
      WHERE a.company_id = ?
        AND date(a.start_at) BETWEEN date(?) AND date(?)
      ORDER BY datetime(a.start_at) DESC, a.id DESC
      LIMIT 1000
    `).bind(COMPANY_ID, from, to).all(),

    env.DB.prepare(`
      SELECT
        COUNT(*) AS total_active,
        COALESCE(SUM(CASE
          WHEN date(datetime(created_at, '-5 hours')) BETWEEN date(?) AND date(?) THEN 1
          ELSE 0 END), 0) AS registered_period
      FROM customers
      WHERE company_id = ? AND is_active = 1
    `).bind(from, to, COMPANY_ID).first(),

    env.DB.prepare(`
      SELECT
        COUNT(*) AS total_active,
        COALESCE(SUM(CASE
          WHEN date(datetime(created_at, '-5 hours')) BETWEEN date(?) AND date(?) THEN 1
          ELSE 0 END), 0) AS registered_period
      FROM pets
      WHERE company_id = ? AND is_active = 1
    `).bind(from, to, COMPANY_ID).first()
  ]);

  const closures = cashClosures.results || [];
  const movements = cashMovements.results || [];

  const cashSummary = {
    closure_count: closures.length,
    difference_total: closures.reduce((sum, row) => sum + Number(row.difference || 0), 0),
    income_total: movements
      .filter(row => row.type === "INCOME")
      .reduce((sum, row) => sum + Number(row.amount || 0), 0),
    expense_total: movements
      .filter(row => row.type === "EXPENSE")
      .reduce((sum, row) => sum + Number(row.amount || 0), 0)
  };

  return json({
    ok: true,
    period: { from, to },
    summary: {
      sales: salesSummary || {},
      inventory: inventorySummary || {},
      cash: cashSummary,
      agenda: appointmentSummary || {},
      customers: customerSummary || {},
      pets: petSummary || {}
    },
    sales_by_payment: salesByPayment.results || [],
    sales_by_day: salesByDay.results || [],
    top_products: topProducts.results || [],
    sales_detail: salesDetail.results || [],
    inventory: inventoryRows.results || [],
    cash_closures: closures,
    cash_movements: movements,
    agenda_by_service: agendaByService.results || [],
    agenda_by_status: agendaByStatus.results || [],
    agenda_by_staff: agendaByStaff.results || [],
    appointment_detail: appointmentDetail.results || []
  });
}
