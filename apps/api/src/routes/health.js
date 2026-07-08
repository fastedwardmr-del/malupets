import { json } from "../utils/response.js";

export async function health(request, env) {
  const db = await env.DB.prepare("SELECT datetime('now') AS fecha").first();
  return json({ ok: true, app: "Malupets API", database: db });
}
