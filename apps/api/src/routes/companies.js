import { json } from "../utils/response.js";

export async function getCompany(request, env) {
  const company = await env.DB.prepare("SELECT * FROM companies LIMIT 1").first();
  return json(company || {});
}
