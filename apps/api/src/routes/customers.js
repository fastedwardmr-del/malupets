import { json, readJson } from "../utils/response.js";

export async function listCustomers(request, env) {
  const { results } = await env.DB.prepare(`
    SELECT *
    FROM customers
    WHERE company_id = 1 AND is_active = 1
    ORDER BY created_at DESC
  `).all();
  return json(results);
}

export async function createCustomer(request, env) {
  const body = await readJson(request);
  if (!body.full_name) return json({ ok: false, error: "El nombre del cliente es obligatorio" }, 400);

  const result = await env.DB.prepare(`
    INSERT INTO customers (
      company_id, full_name, document_type, document_number,
      phone, email, address, city, notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    1,
    body.full_name,
    body.document_type || "",
    body.document_number || "",
    body.phone || "",
    body.email || "",
    body.address || "",
    body.city || "",
    body.notes || ""
  ).run();

  return json({ ok: true, message: "Cliente creado correctamente", id: result.meta.last_row_id }, 201);
}
export async function updateCustomer(request, env, id) {
  const body = await readJson(request);

  if (!id) return json({ ok: false, error: "ID de cliente requerido" }, 400);
  if (!body.full_name) return json({ ok: false, error: "El nombre del cliente es obligatorio" }, 400);

  await env.DB.prepare(`
    UPDATE customers
    SET full_name = ?, document_type = ?, document_number = ?,
        phone = ?, email = ?, address = ?, city = ?, notes = ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND company_id = 1
  `).bind(
    body.full_name,
    body.document_type || "",
    body.document_number || "",
    body.phone || "",
    body.email || "",
    body.address || "",
    body.city || "",
    body.notes || "",
    id
  ).run();

  return json({ ok: true, message: "Cliente actualizado correctamente" });
}