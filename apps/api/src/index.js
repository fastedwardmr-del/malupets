import { json, options } from "./utils/response.js";
import { health } from "./routes/health.js";
import { getCompany } from "./routes/companies.js";
import { listCustomers, createCustomer, updateCustomer } from "./routes/customers.js";
import { listPets, createPet, updatePet } from "./routes/pets.js";
import {
  listProducts,
  createProduct,
  updateProduct,
  importProducts,
  uploadProductImage,
  getProductImage
} from "./routes/products.js";
import { listSales, getSale, createSale } from "./routes/sales.js";
import { login, me, logout } from "./routes/auth.js";
import { listUsers, createUser, updateUser } from "./routes/users.js";
import { requireAuth } from "./middleware/auth.js";

async function authorize(request, env, permission = null) {
  const result = await requireAuth(request, env, permission);
  return result;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    if (method === "OPTIONS") return options();

    try {
      if (path === "/") {
        return json({ app: "Malupets API", version: "0.3.0", status: "online" });
      }

      // Públicas
      if (path === "/api/health" && method === "GET") return health(request, env);
      if (path === "/api/auth/login" && method === "POST") return login(request, env);

      // Las imágenes se sirven públicas porque <img> no envía Authorization.
      const productImageGetMatch = path.match(/^\/api\/products\/image\/(.+)$/);
      if (productImageGetMatch && method === "GET") {
        return getProductImage(request, env, productImageGetMatch[1]);
      }

      // Sesión
      if (path === "/api/auth/me" && method === "GET") {
        const auth = await authorize(request, env);
        if (!auth.ok) return auth.response;
        return me(request, env);
      }

      if (path === "/api/auth/logout" && method === "POST") {
        const auth = await authorize(request, env);
        if (!auth.ok) return auth.response;
        return logout(request, env);
      }

      // Empresa
      if (path === "/api/company" && method === "GET") {
        const auth = await authorize(request, env, ["dashboard", "settings"]);
        if (!auth.ok) return auth.response;
        return getCompany(request, env);
      }

      // Clientes
      if (path === "/api/customers" && method === "GET") {
        const auth = await authorize(request, env, "customers");
        if (!auth.ok) return auth.response;
        return listCustomers(request, env);
      }
      if (path === "/api/customers" && method === "POST") {
        const auth = await authorize(request, env, "customers");
        if (!auth.ok) return auth.response;
        return createCustomer(request, env);
      }
      const customerMatch = path.match(/^\/api\/customers\/(\d+)$/);
      if (customerMatch && method === "PUT") {
        const auth = await authorize(request, env, "customers");
        if (!auth.ok) return auth.response;
        return updateCustomer(request, env, customerMatch[1]);
      }

      // Mascotas
      if (path === "/api/pets" && method === "GET") {
        const auth = await authorize(request, env, "pets");
        if (!auth.ok) return auth.response;
        return listPets(request, env);
      }
      if (path === "/api/pets" && method === "POST") {
        const auth = await authorize(request, env, "pets");
        if (!auth.ok) return auth.response;
        return createPet(request, env);
      }
      const petMatch = path.match(/^\/api\/pets\/(\d+)$/);
      if (petMatch && method === "PUT") {
        const auth = await authorize(request, env, "pets");
        if (!auth.ok) return auth.response;
        return updatePet(request, env, petMatch[1]);
      }

      // Productos
      if (path === "/api/products" && method === "GET") {
        const auth = await authorize(request, env, ["inventory", "pos"]);
        if (!auth.ok) return auth.response;
        return listProducts(request, env);
      }
      if (path === "/api/products" && method === "POST") {
        const auth = await authorize(request, env, "inventory");
        if (!auth.ok) return auth.response;
        return createProduct(request, env);
      }
      if (path === "/api/products/import" && method === "POST") {
        const auth = await authorize(request, env, "inventory");
        if (!auth.ok) return auth.response;
        return importProducts(request, env);
      }

      const productImageUploadMatch = path.match(/^\/api\/products\/(\d+)\/image$/);
      if (productImageUploadMatch && method === "POST") {
        const auth = await authorize(request, env, "inventory");
        if (!auth.ok) return auth.response;
        return uploadProductImage(request, env, productImageUploadMatch[1]);
      }

      const productMatch = path.match(/^\/api\/products\/(\d+)$/);
      if (productMatch && method === "PUT") {
        const auth = await authorize(request, env, "inventory");
        if (!auth.ok) return auth.response;
        return updateProduct(request, env, productMatch[1]);
      }

      // Ventas
      if (path === "/api/sales" && method === "GET") {
        const auth = await authorize(request, env, "sales");
        if (!auth.ok) return auth.response;
        return listSales(request, env);
      }
      if (path === "/api/sales" && method === "POST") {
        const auth = await authorize(request, env, "pos");
        if (!auth.ok) return auth.response;
        return createSale(request, env);
      }
      const saleMatch = path.match(/^\/api\/sales\/(\d+)$/);
      if (saleMatch && method === "GET") {
        const auth = await authorize(request, env, "sales");
        if (!auth.ok) return auth.response;
        return getSale(request, env, saleMatch[1]);
      }

      // Usuarios / roles
      if (path === "/api/users" && method === "GET") {
        const auth = await authorize(request, env, "settings");
        if (!auth.ok) return auth.response;
        return listUsers(request, env);
      }
      if (path === "/api/users" && method === "POST") {
        const auth = await authorize(request, env, "settings");
        if (!auth.ok) return auth.response;
        return createUser(request, env);
      }
      const userMatch = path.match(/^\/api\/users\/(\d+)$/);
      if (userMatch && method === "PUT") {
        const auth = await authorize(request, env, "settings");
        if (!auth.ok) return auth.response;
        return updateUser(request, env, userMatch[1], auth.user);
      }

      return json({ ok: false, error: "Endpoint no encontrado" }, 404);
    } catch (error) {
      console.error(error);
      return json({
        ok: false,
        error: error?.message || "Error interno del servidor"
      }, 500);
    }
  }
};
