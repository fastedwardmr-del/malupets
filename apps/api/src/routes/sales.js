import { json, readJson } from "../utils/response.js";

const COMPANY_ID = 1;

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function invoiceNumber() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const time = String(Date.now()).slice(-6);
  return `MP-${y}${m}${day}-${time}`;
}

export async function listSales(request, env) {
  const { results } = await env.DB.prepare(`
    SELECT sales.*, customers.full_name AS customer_name
    FROM sales
    LEFT JOIN customers ON customers.id = sales.customer_id
    WHERE sales.company_id = ?
    ORDER BY sales.created_at DESC
    LIMIT 100
  `).bind(COMPANY_ID).all();
  return json(results);
}

export async function createSale(request, env) {
  const body = await readJson(request);
  const items = Array.isArray(body.items) ? body.items : [];
  if (!items.length) return json({ ok: false, error: "Agrega al menos un producto" }, 400);

  let subtotal = 0;
  const normalized = [];

  for (const item of items) {
    const productId = Number(item.product_id);
    const quantity = toNumber(item.quantity, 1);
    const product = await env.DB.prepare(`
      SELECT id, name, sale_price, stock, is_active
      FROM products
      WHERE id = ? AND company_id = ? AND is_active = 1
    `).bind(productId, COMPANY_ID).first();

    if (!product) return json({ ok: false, error: `Producto no encontrado: ${productId}` }, 400);
    if (quantity <= 0) return json({ ok: false, error: `Cantidad inválida para ${product.name}` }, 400);
    if (Number(product.stock) < quantity) return json({ ok: false, error: `Stock insuficiente: ${product.name}` }, 400);

    const unitPrice = toNumber(item.unit_price, Number(product.sale_price));
    const total = quantity * unitPrice;
    subtotal += total;
    normalized.push({ product_id: product.id, product_name: product.name, quantity, unit_price: unitPrice, total });
  }

  const tax = toNumber(body.tax, 0);
  const total = subtotal + tax;
  const inv = invoiceNumber();

  const sale = await env.DB.prepare(`
    INSERT INTO sales (company_id, customer_id, invoice_number, subtotal, tax, total, payment_method, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    COMPANY_ID,
    body.customer_id || null,
    inv,
    subtotal,
    tax,
    total,
    body.payment_method || "Efectivo",
    body.notes || ""
  ).run();

  const saleId = sale.meta.last_row_id;

  for (const item of normalized) {
    await env.DB.prepare(`
      INSERT INTO sale_items (sale_id, product_id, product_name, quantity, unit_price, total)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(saleId, item.product_id, item.product_name, item.quantity, item.unit_price, item.total).run();

    await env.DB.prepare(`
      UPDATE products
      SET stock = stock - ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND company_id = ?
    `).bind(item.quantity, item.product_id, COMPANY_ID).run();
  }

  return json({ ok: true, message: "Venta registrada correctamente", id: saleId, invoice_number: inv, total }, 201);
}
