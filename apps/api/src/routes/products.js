import { json, readJson } from "../utils/response.js";

const COMPANY_ID = 1;

function cleanText(value) {
  return String(value ?? "").trim();
}

function toNumber(value, fallback = 0) {
  if (value === null || value === undefined || value === "") return fallback;
  const n = Number(String(value).replace(",", "."));
  return Number.isFinite(n) ? n : fallback;
}

function getBucket(env) {
  return env.BUCKET || env.R2 || env.MALUPETS_BUCKET || env.IMAGES;
}

export async function listProducts(request, env) {
  const url = new URL(request.url);
  const q = cleanText(url.searchParams.get("q")).toLowerCase();
  const active = url.searchParams.get("active");

  let sql = `
    SELECT *
    FROM products
    WHERE company_id = ?
  `;
  const binds = [COMPANY_ID];

  if (active === "1") sql += " AND is_active = 1";
  if (q) {
    sql += " AND (LOWER(name) LIKE ? OR LOWER(sku) LIKE ? OR LOWER(category) LIKE ?)";
    binds.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }

  sql += " ORDER BY name ASC";

  const { results } = await env.DB.prepare(sql).bind(...binds).all();
  return json(results);
}

export async function createProduct(request, env) {
  const body = await readJson(request);
  if (!cleanText(body.name)) return json({ ok: false, error: "El nombre del producto es obligatorio" }, 400);

  const result = await env.DB.prepare(`
    INSERT INTO products (
      company_id, sku, name, category, description,
      cost_price, sale_price, stock, unit, image_key, image_url, is_active
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    COMPANY_ID,
    cleanText(body.sku),
    cleanText(body.name),
    cleanText(body.category),
    cleanText(body.description),
    toNumber(body.cost_price),
    toNumber(body.sale_price),
    toNumber(body.stock),
    cleanText(body.unit) || "UND",
    cleanText(body.image_key),
    cleanText(body.image_url),
    body.is_active === 0 ? 0 : 1
  ).run();

  return json({ ok: true, message: "Producto creado correctamente", id: result.meta.last_row_id }, 201);
}

export async function updateProduct(request, env, id) {
  const body = await readJson(request);
  if (!id) return json({ ok: false, error: "ID de producto requerido" }, 400);
  if (!cleanText(body.name)) return json({ ok: false, error: "El nombre del producto es obligatorio" }, 400);

  await env.DB.prepare(`
    UPDATE products
    SET sku = ?, name = ?, category = ?, description = ?,
        cost_price = ?, sale_price = ?, stock = ?, unit = ?,
        is_active = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND company_id = ?
  `).bind(
    cleanText(body.sku),
    cleanText(body.name),
    cleanText(body.category),
    cleanText(body.description),
    toNumber(body.cost_price),
    toNumber(body.sale_price),
    toNumber(body.stock),
    cleanText(body.unit) || "UND",
    body.is_active === 0 ? 0 : 1,
    id,
    COMPANY_ID
  ).run();

  return json({ ok: true, message: "Producto actualizado correctamente" });
}

export async function importProducts(request, env) {
  const body = await readJson(request);
  const rows = Array.isArray(body.rows) ? body.rows : [];
  if (!rows.length) return json({ ok: false, error: "No se recibieron productos para importar" }, 400);

  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const row of rows) {
    const sku = cleanText(row.sku || row.SKU || row.codigo || row.código);
    const name = cleanText(row.name || row.nombre || row.producto || row.Producto);
    if (!name) { skipped++; continue; }

    const payload = {
      category: cleanText(row.category || row.categoria || row.categoría),
      description: cleanText(row.description || row.descripcion || row.descripción),
      cost_price: toNumber(row.cost_price || row.costo || row.precio_costo),
      sale_price: toNumber(row.sale_price || row.precio || row.precio_venta),
      stock: toNumber(row.stock || row.cantidad || row.inventario),
      unit: cleanText(row.unit || row.unidad) || "UND"
    };

    if (sku) {
      const existing = await env.DB.prepare(`
        SELECT id FROM products WHERE company_id = ? AND sku = ? LIMIT 1
      `).bind(COMPANY_ID, sku).first();

      if (existing) {
        await env.DB.prepare(`
          UPDATE products
          SET name = ?, category = ?, description = ?, cost_price = ?, sale_price = ?, stock = ?, unit = ?, is_active = 1, updated_at = CURRENT_TIMESTAMP
          WHERE id = ? AND company_id = ?
        `).bind(name, payload.category, payload.description, payload.cost_price, payload.sale_price, payload.stock, payload.unit, existing.id, COMPANY_ID).run();
        updated++;
        continue;
      }
    }

    await env.DB.prepare(`
      INSERT INTO products (company_id, sku, name, category, description, cost_price, sale_price, stock, unit, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    `).bind(COMPANY_ID, sku, name, payload.category, payload.description, payload.cost_price, payload.sale_price, payload.stock, payload.unit).run();
    created++;
  }

  return json({ ok: true, message: "Inventario importado", created, updated, skipped });
}

export async function uploadProductImage(request, env, id) {
  const bucket = getBucket(env);
  if (!bucket) return json({ ok: false, error: "No se encontró binding R2. Revisa wrangler.toml" }, 500);
  if (!id) return json({ ok: false, error: "ID de producto requerido" }, 400);

  const form = await request.formData();
  const file = form.get("image");
  if (!file || !file.name) return json({ ok: false, error: "Imagen requerida" }, 400);

  const extension = (file.name.split(".").pop() || "jpg").toLowerCase();
  const key = `products/${COMPANY_ID}/${id}-${Date.now()}.${extension}`;

  await bucket.put(key, file.stream(), {
    httpMetadata: { contentType: file.type || "image/jpeg" }
  });

  const imageUrl = `/api/products/image/${encodeURIComponent(key)}`;

  await env.DB.prepare(`
    UPDATE products
    SET image_key = ?, image_url = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND company_id = ?
  `).bind(key, imageUrl, id, COMPANY_ID).run();

  return json({ ok: true, message: "Imagen actualizada", image_key: key, image_url: imageUrl });
}

export async function getProductImage(request, env, key) {
  const bucket = getBucket(env);
  if (!bucket) return json({ ok: false, error: "No se encontró binding R2" }, 500);

  const objectKey = decodeURIComponent(key || "");
  const object = await bucket.get(objectKey);
  if (!object) return json({ ok: false, error: "Imagen no encontrada" }, 404);

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  headers.set("Cache-Control", "public, max-age=31536000");
  return new Response(object.body, { headers });
}
