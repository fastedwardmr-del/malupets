# Malupets

Proyecto base para sistema veterinario / petshop: POS, clientes, mascotas, inventario, caja, agenda y reportes.

## Estructura

```txt
apps/api   -> Worker Cloudflare independiente
apps/web   -> Frontend HTML/CSS/JS
database   -> SQL, migraciones y seeds
docs       -> Documentación del proyecto
assets     -> Recursos de marca
scripts    -> Scripts auxiliares
```

## Comandos API

```bash
cd apps/api
npm install
wrangler deploy
```

## Worker actual

Nombre: `api-malupets`

Bindings esperados:

- D1: `DB` -> `malupets-db`
- R2: `FILES` -> `malupets-files`

## Endpoints iniciales

- `GET /`
- `GET /api/health`
- `GET /api/company`
- `GET /api/customers`
- `POST /api/customers`
- `GET /api/pets`
- `POST /api/pets`
