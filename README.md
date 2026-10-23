# mimo — Sistema de gestión

Panel interno de mimo (velas de soja artesanales), basado en el sistema de By Maria Lugo.
Lo usan solo Gian y Luis. Sirve también la API pública que consume el catálogo (`../mimo-catalog`).

**Módulos:** Dashboard, Inventario, Nueva venta (POS), Clientes, Pedidos, Reportes, Gastos.
**Stack:** Node 20 + Express + PostgreSQL (`pg`) + JWT · fotos guardadas en PostgreSQL · frontend Vanilla JS + Chart.js.

## Correr en local

```bash
cp .env.example .env   # completar DATABASE_URL
npm install
npm run dev            # http://localhost:3010 si PORT=3010
```

La primera vez que arranca crea las tablas, las categorías **Postres**, **Bebidas** y **Aromáticas**,
los 16 aromas del catálogo y los usuarios Gian y Luis con las contraseñas de `GIAN_PASSWORD` / `LUIS_PASSWORD`.

## Desplegar en Railway

1. Nuevo proyecto → servicio desde este repo + plugin **PostgreSQL**.
2. Variables: `DATABASE_URL` (referencia al Postgres), `JWT_SECRET` (texto largo al azar),
   `GIAN_PASSWORD`, `LUIS_PASSWORD`. (No se necesita Cloudinary: las fotos van en la misma base.)
   Define las contraseñas **antes** del primer arranque: solo se usan al crear la base.
3. Copiar la URL pública del servicio y ponerla en `NEXT_PUBLIC_API_URL` del catálogo.

## API pública (sin token)

- `GET /api/products` — productos visibles (sin costo, margen ni proveedor)
- `GET /api/products/:id`
- `GET /api/products/categories`
- `GET /api/products/top` — más vendidos
- `GET /api/products/:id/image` — foto del producto
- `GET /api/aromas` — aromas disponibles (se editan en Inventario → Aromas)

Con token (sesión de Gian o Luis) las mismas rutas devuelven también costos y márgenes.
