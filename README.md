# Mercadito Backend

API REST para Mercadito: un marketplace para publicar productos, gestionar carritos, crear órdenes y dejar reseñas. Construido con **Express 5 + TypeScript + Prisma + PostgreSQL**, con notificaciones en tiempo real vía **Socket.IO** y colas de trabajo con **Redis + BullMQ**.

---

## Índice

1. [Requisitos previos](#1-requisitos-previos)
2. [Configuración del entorno](#2-configuración-del-entorno)
3. [Levantar la infraestructura (Docker)](#3-levantar-la-infraestructura-docker)
4. [Instalar dependencias](#4-instalar-dependencias)
5. [Aplicar migraciones de base de datos](#5-aplicar-migraciones-de-base-de-datos)
6. [Iniciar el servidor](#6-iniciar-el-servidor)
7. [Verificar que todo funciona](#7-verificar-que-todo-funciona)
8. [Scripts disponibles](#8-scripts-disponibles)
9. [Variables de entorno](#9-variables-de-entorno)
10. [Referencia de la API](#10-referencia-de-la-api)
11. [Autenticación y roles](#11-autenticación-y-roles)
12. [Socket.IO — Tiempo real](#12-socketio--tiempo-real)
13. [Email](#13-email)
14. [Estructura del proyecto](#14-estructura-del-proyecto)

---

## 1. Requisitos previos

| Herramienta | Versión mínima |
|---|---|
| Node.js | 18+ |
| npm | 9+ |
| Docker Desktop | cualquier versión reciente |
| Git | cualquier versión reciente |

---

## 2. Configuración del entorno

Copia la plantilla de variables de entorno y edítala con tus valores:

```bash
cp .env.example .env
```

Abre `.env` y rellena al menos las variables marcadas como obligatorias (ver [sección 9](#9-variables-de-entorno)).

> **Importante:** nunca subas tu archivo `.env` al repositorio. El `.gitignore` ya lo excluye.

---

## 3. Levantar la infraestructura (Docker)

El proyecto necesita **PostgreSQL** y **Redis** corriendo antes de iniciar el servidor. El `docker-compose.yaml` los provee:

```bash
docker compose up -d
```

Esto levanta dos contenedores en segundo plano:

| Contenedor | Puerto por defecto |
|---|---|
| `postgres-db-mercadito` | `5433` (configurable con `PGPORT`) |
| `redis-mercadito` | `6379` (configurable con `REDIS_PORT`) |

Para verificar que ambos están activos:

```bash
docker ps
```

Para detener los contenedores sin borrar los datos:

```bash
docker compose stop
```

Para detenerlos y borrar volúmenes (base de datos + caché Redis):

```bash
docker compose down -v
```

### Infraestructura para los tests e2e

`docker-compose.e2e.yaml` levanta una base de datos y un Redis **desechables** (contenedores `mercadito-e2e-*`, puertos `5434` y `6380`, sin volúmenes) para los tests Playwright del frontend. Es independiente del `docker-compose.yaml` de desarrollo, así que no toca tus datos ni choca con otros servicios. Normalmente no se usa a mano: lo gestiona `npm run e2e` en `Mercadito_Frontend` (ver su README).

---

## 4. Instalar dependencias

```bash
npm install
```

---

## 5. Aplicar migraciones de base de datos

Este paso crea todas las tablas y aplica los cambios de esquema. Solo necesitas hacerlo la primera vez, o cuando el esquema de Prisma cambie:

```bash
npx prisma migrate dev
```

Si quieres ver y editar los datos directamente con una interfaz visual:

```bash
npx prisma studio
```

---

## 6. Iniciar el servidor

### Modo desarrollo (con hot-reload)

```bash
npm run start:dev
```

El servidor arranca en `http://localhost:3000` (o el `PORT` que hayas definido en `.env`).

### Modo producción

```bash
npm run build
node dist/main.js
```

---

## 7. Verificar que todo funciona

```bash
curl http://localhost:3000/health
# → "OK"
```

También puedes importar la colección de Postman incluida en la raíz del proyecto: `Mercadito.postman_collection.json`.

### Ejecutar los tests

```bash
npm test
```

Para modo watch (re-ejecuta al guardar):

```bash
npm run test:watch
```

Para reporte de cobertura:

```bash
npm run test:coverage
```

---

## 8. Scripts disponibles

| Comando | Descripción |
|---|---|
| `npm run start:dev` | Servidor en desarrollo con nodemon |
| `npm run build` | Compila TypeScript → `dist/` |
| `npm test` | Ejecuta todos los tests una vez |
| `npm run test:watch` | Tests en modo watch |
| `npm run test:coverage` | Tests + reporte de cobertura |
| `npm run embeddings:backfill` | Encola el indexado de los productos sin embedding o desactualizados e imprime cuántos |
| `npm run eval:search` | Evalúa la recuperación con la API real de Voyage (cuesta centavos; requiere `VOYAGE_API_KEY`) |
| `npm run eval:assistant` | Evalúa el asistente de compras con el modelo real de OpenAI (unos 30 casos, cuesta centavos; requiere `OPENAI_API_KEY`) |
| `npm run docs:export` | Regenera `Mercadito.postman_collection.json` desde la spec OpenAPI |
| `npx prisma migrate dev` | Crea y aplica una nueva migración |
| `npx prisma studio` | Interfaz visual de la base de datos |
| `npx prisma generate` | Regenera el cliente de Prisma |

---

## 9. Variables de entorno

Todas las variables disponibles están en `.env.example`. A continuación se describen las más importantes:

### Base de datos

| Variable | Descripción | Ejemplo |
|---|---|---|
| `POSTGRES_USER` | Usuario de PostgreSQL | `mercadito_user` |
| `POSTGRES_PASSWORD` | Contraseña de PostgreSQL | `mi_password_seguro` |
| `POSTGRES_DB` | Nombre de la base de datos | `mercaditoDB` |
| `PGHOST` | Host de PostgreSQL | `localhost` |
| `PGPORT` | Puerto de PostgreSQL | `5433` |
| `DATABASE_URL` | URL de conexión completa para Prisma | *(construida con las vars de arriba)* |

### Aplicación

| Variable | Obligatoria en prod | Descripción |
|---|---|---|
| `PORT` | No | Puerto del servidor (default: `3000`) |
| `JWT_SECRET` | **Sí** | Secreto para firmar los JWT. Usar un valor aleatorio fuerte. |
| `ACCESS_TOKEN_TTL` | No | Vida del access token, formato `jsonwebtoken` (default: `15m`) |
| `REFRESH_TOKEN_TTL_SECONDS` | No | Vida de la sesión / refresh token en segundos (default: `604800`, 7 días) |
| `SALTS` | No | Rounds de bcrypt (default: `10`, rango válido: 1–31) |
| `APP_URL` | No | URL base del frontend para links de reset (dev: `http://localhost:4200`) |
| `CORS_ORIGIN` | No | Origen permitido para CORS. Ej: `http://localhost:4200`. Usar `*` solo en dev. |
| `ENABLE_DOCS` | No | Sirve Swagger UI en `/docs` y la spec en `/docs.json` (default: `true`, salvo en producción) |
| `LOW_STOCK_THRESHOLD` | No | Stock a partir del cual una venta dispara `stock:low` al vendedor (default: `5`; entero ≥ 0) |

### Redis

| Variable | Descripción |
|---|---|
| `REDIS_HOST` | Host de Redis (default: `localhost`) |
| `REDIS_PORT` | Puerto de Redis (default: `6379`) |

> Si el backend corre en tu máquina y Redis en Docker: `REDIS_HOST=localhost`.  
> Si ambos corren dentro de Docker en la misma red: `REDIS_HOST=redis`.

### Búsqueda semántica (Voyage + pgvector)

| Variable | Default | Descripción |
|---|---|---|
| `VOYAGE_API_KEY` | *(vacío)* | Sin key no se indexa (se registra un aviso) y la búsqueda responde en modo `text` |
| `VOYAGE_MODEL` | `voyage-3.5-lite` | Modelo de embeddings (vectores de 1024 dimensiones) |
| `EMBEDDINGS_PROVIDER` | `voyage` | `fake` es determinista, solo para tests y el arranque falla si `NODE_ENV` no es `test` |
| `SEARCH_MIN_SIMILARITY` | `0.47` | Similitud coseno mínima para que un candidato vectorial entre al ranking |
| `SEARCH_RATE_LIMIT_PER_MIN` | `30` | Búsquedas por usuario y minuto (`429` con `Retry-After` al superarlo) |

- Postgres usa la imagen `pgvector/pgvector:pg17`; la migración `add_product_embeddings` crea la extensión `vector`. Haz un respaldo de `./database` antes del primer arranque con la imagen nueva.
- Crear o editar un producto encola su indexado en la cola BullMQ `embeddings` (un trabajo por producto, 5 intentos con backoff exponencial); guardar nunca espera a Voyage. Un producto nuevo aparece al instante por texto y por vectores unos segundos después.
- Para indexar el catálogo existente: `npm run embeddings:backfill` (con el servidor corriendo, para que el worker procese la cola).
- **Costo:** cada búsqueda con Voyage activo es una llamada de embedding, y el backfill consume tokens por producto. El límite por usuario contiene el abuso, pero no hay un tope global de gasto.

### Asistente de compras (OpenAI)

| Variable | Default | Descripción |
|---|---|---|
| `OPENAI_API_KEY` | *(vacío)* | Sin key el asistente queda **desactivado**: `GET /assistant/status` responde `enabled: false` y `POST /assistant/messages` responde `503`. El resto de la app no se ve afectada |
| `OPENAI_MODEL` | `gpt-6-luna` | Modelo del asistente (Responses API con function calling, `store: false`) |
| `LLM_PROVIDER` | `openai` | `fake` es un modelo con guion para los e2e; el arranque falla si `NODE_ENV` no es `test` |
| `ASSISTANT_RATE_LIMIT_PER_MIN` | `10` | Mensajes por usuario y minuto (`429` con `Retry-After` al superarlo) |
| `ASSISTANT_TIMEOUT_MS` | `30000` | Tiempo máximo de una llamada a OpenAI; al pasarlo la respuesta es `503` |

**Cómo funciona**

- El modelo usa herramientas sobre la API de Mercadito, siempre como el usuario de la sesión. Las de **lectura** se ejecutan al instante: `search_products` (la búsqueda híbrida), `get_product`, `view_cart`, `list_my_orders`, `get_order`.
- Las que **cambian datos** (`add_to_cart`, `update_cart_item`, `remove_cart_item`, `checkout`) solo **proponen**: se valida el estado actual y la propuesta queda en Redis 10 minutos. El modelo no tiene ninguna herramienta para confirmar.
- La acción se ejecuta únicamente con `POST /assistant/actions/:id/confirm` (una sola vez; repetirlo da `409`). `POST /assistant/actions/:id/reject` la descarta. Al confirmar se revalida todo: stock, que el ítem siga en el carrito y, en un pedido, que el carrito sea el mismo que vio el usuario (si cambió, `409` y no se crea ningún pedido).
- La conversación vive en Redis 24 horas (se renueva con cada mensaje); al modelo solo se le envían los últimos 20 mensajes y, en el siguiente turno, el resultado de confirmar o rechazar. Máximo 5 llamadas a herramientas por turno y 1000 caracteres por mensaje.
- Solo responde sobre compras en Mercadito, en español.

**Costo y privacidad**

- Cada mensaje es al menos una llamada a OpenAI (más una por herramienta usada). `gpt-6-luna` cuesta $0.10 / $0.50 por millón de tokens (entrada / salida). El límite por usuario y por turno contiene el abuso, pero no hay un tope global de gasto.
- Los mensajes, el carrito y los pedidos del usuario se envían a OpenAI.

**Evaluación:** `npm run eval:assistant` corre los casos de `src/eval/assistant/cases.json` contra el modelo real con un catálogo y un carrito en memoria (no toca la base de datos), imprime una tabla, un resumen en JSON con el costo en tokens y guarda el detalle en `src/eval/assistant/results.json`. Pasa con ≥ 90 % de los casos y el 100 % de los de seguridad.

### Email SMTP (desarrollo con Mailpit)

En desarrollo, el `.env.example` apunta a **Mailpit** (servicio en `docker-compose.yaml`):

| Variable | Valor típico (dev) | Descripción |
|---|---|---|
| `SMTP_HOST` | `localhost` | Host SMTP. Vacío = emails solo en consola |
| `SMTP_PORT` | `1027` | Puerto host mapeado a Mailpit (`1027:1025`) |
| `SMTP_USER` | *(vacío)* | Mailpit no exige auth |
| `SMTP_PASS` | *(vacío)* | Mailpit no exige auth |
| `SMTP_FROM` | `Mercadito <noreply@mercadito.app>` | Remitente |

```bash
# Desde Mercadito_Backend/
docker compose up -d mailpit
# Inbox UI → http://localhost:8027
```

Los puertos host `1027` (SMTP) y `8027` (UI) evitan choques con otros Mailpit locales en `1025`/`1026`.

Para un proveedor real (staging/producción), configura `SMTP_*` con ese servicio (ej. Resend, SES).

---

## 10. Referencia de la API

### Documentación interactiva (OpenAPI / Swagger)

Con el servidor corriendo:

| URL | Contenido |
|---|---|
| `http://localhost:3000/docs` | Swagger UI: prueba los endpoints desde el navegador (botón **Authorize** con tu JWT de acceso) |
| `http://localhost:3000/docs.json` | Documento OpenAPI 3.1 (impórtalo en Postman, Insomnia o un generador de clientes) |

- Los cuerpos y *query params* de cada endpoint se generan **desde los esquemas Zod reales**, así que no se desactualizan. Las definiciones están en `src/docs/endpoints.ts`.
- Un test falla si agregas o quitas una ruta sin documentarla, o si `Mercadito.postman_collection.json` no coincide con la spec.
- Tras cambiar `src/docs/endpoints.ts` o un validador, regenera la colección de Postman con `npm run docs:export`.
- Por defecto `/docs` está activo, **excepto en producción** (`NODE_ENV=production`). Para forzarlo: `ENABLE_DOCS=true`; para apagarlo: `ENABLE_DOCS=false`.

Las tablas siguientes son un resumen; la referencia completa (esquemas de request y response, códigos de error) está en `/docs`.

### Health

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| `GET` | `/health` | Público | Verifica que el servidor responde |

### Auth

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| `POST` | `/auth/register` | Público | Registra un nuevo usuario (rol `user` por defecto) |
| `POST` | `/auth/login` | Público | Login → retorna `token` (JWT de acceso, 15 min) y `refreshToken` |
| `POST` | `/auth/refresh` | Público | Body `{ "refreshToken" }` → nuevo `token` + nuevo `refreshToken` (rotativo). `401` si es inválido, expirado o ya usado |
| `POST` | `/auth/logout` | Público | Body `{ "refreshToken" }` → revoca la sesión (idempotente) |
| `POST` | `/auth/password/forgot` | Público | Solicitar reset de contraseña |
| `POST` | `/auth/password/reset` | Público | Confirmar nuevo password con token |

### Seller (perfil de vendedor)

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| `POST` | `/seller` | Usuario autenticado | Crear perfil de vendedor (`status: active`) |
| `GET` | `/seller/mine` | Seller activo | Ver mi perfil de vendedor |
| `PATCH` | `/seller/mine` | Seller activo | Editar mi perfil de vendedor |
| `DELETE` | `/seller/mine` | Seller activo | Eliminar perfil (falla si hay productos) |
| `GET` | `/seller/sales` | Seller (activo o suspendido) | Resumen de ventas de mi puesto. Query opcional: `from`, `to` (`YYYY-MM-DD` o ISO 8601; una fecha sola en `to` incluye todo el día) |
| `GET` | `/seller/notification-settings` | Seller (activo o suspendido) | Qué eventos recibo (`order:new`, `stock:low`, `review:new`) y el umbral de stock bajo (`lowStockThreshold`, solo lectura) |
| `PATCH` | `/seller/notification-settings` | Seller (activo o suspendido) | Activar/desactivar eventos. Body parcial, p. ej. `{ "stock:low": false }`. Un evento desactivado no se emite ni se guarda en el historial |
| `GET` | `/seller` | Admin | Listar todos los sellers |
| `PATCH` | `/seller/:id/status` | Admin | Cambiar status (`active` \| `suspended`) |

> **Qué cuenta como venta:** en `/seller/sales`, los ítems del propio seller en órdenes `paid`, `confirmed`, `shipped` o `delivered`. Las `pending` y `cancelled` no suman ingresos, pero aparecen en `ordersByStatus`. El monto `total` es un string decimal (`"42.00"`), igual que los precios.

### Productos

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| `GET` | `/product` | Público | Listar productos (filtros: `name`, `category`, `minPrice`, `maxPrice`, `startAt`, `endAt`) |
| `GET` | `/product/search` | Usuario | Búsqueda híbrida (vectorial + texto en español): `q` (1-200), `limit` (1-25, default 10), `category`, `includeOutOfStock`. Responde `{ mode: "hybrid" | "text", items }`; `text` significa que Voyage no está disponible |
| `GET` | `/product/:id` | Público | Obtener un producto por ID |
| `GET` | `/product/mine` | Seller activo | Listar los productos propios |
| `POST` | `/product` | Seller activo | Crear producto |
| `PUT` | `/product/:id` | Seller activo (dueño) | Actualizar producto propio |
| `DELETE` | `/product/:id` | Seller activo (dueño) | Eliminar producto propio |

Categorías válidas: `verduras`, `frutas`, `panaderia`, `lacteos`, `artesanias`  
Unidades válidas: `kilogramo`, `unidad`, `frasco`, `litro`

### Asistente de compras

Todos los endpoints requieren sesión activa (JWT). Ver [Asistente de compras (OpenAI)](#asistente-de-compras-openai) para el funcionamiento y las variables.

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/assistant/status` | **Público (sin JWT).** `{ enabled, model }`. `enabled: false` si no hay `OPENAI_API_KEY` |
| `GET` | `/assistant/conversations/:id` | Retoma una conversación: mensajes visibles (`user`, `assistant`, `action_event`) y acciones aún pendientes y no vencidas; nunca `tool_call` ni `tool_result`. `404` inexistente, vencida (24 h) o ajena |
| `POST` | `/assistant/messages` | Body `{ conversationId?, message (1-1000) }`. Responde `{ conversationId, reply, products, pendingActions }`. `400` body inválido · `404` conversación inexistente o ajena · `429` límite (con `Retry-After`) · `503` asistente desactivado o con fallo |
| `POST` | `/assistant/actions/:id/confirm` | Ejecuta una acción propuesta, una sola vez. `404` inexistente, vencida o ajena · `409` ya resuelta o carrito cambiado · `400` ya no aplica (p. ej. sin stock) |
| `POST` | `/assistant/actions/:id/reject` | Descarta la acción sin ejecutar nada. `404` · `409` ya resuelta |

### Carrito

Todos los endpoints requieren sesión activa (JWT).

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/cart` | Ver el carrito (retorna `{ items: [] }` si está vacío) |
| `POST` | `/cart/add` | Agregar o aumentar un ítem — Body: `{ "productId": 1, "quantity": 2 }` |
| `PATCH` | `/cart/item/:itemId` | Actualizar cantidad de un ítem — Body: `{ "quantity": 3 }` |
| `DELETE` | `/cart/item/:itemId` | Eliminar un ítem del carrito |
| `DELETE` | `/cart` | Vaciar el carrito completo |
| `POST` | `/cart/checkout` | Crear los pedidos del carrito, **uno por puesto**, con el mismo `checkoutId` (descuenta stock, vacía carrito). Body: `{ "fulfillment": "pickup" | "delivery", "address"?, "addressRef"?, "contactPhone"?, "note"? }`; `delivery` exige `address` y `addressRef`. Responde `201 { checkoutId, orders }` |

### Órdenes

Todos los endpoints requieren sesión activa (JWT).

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| `GET` | `/order` | Cualquiera | Mis compras, agrupadas por `checkoutId` (un pedido por puesto) |
| `GET` | `/order/:id` | Cualquiera | Detalle de una orden propia |
| `GET` | `/order/seller/mine` | Seller activo | Pedidos de su puesto, con los datos de entrega |
| `PATCH` | `/order/:id/status` | Seller activo / Admin | Actualizar status de un pedido (solo del propio puesto; `403` si es de otro) |

Estados válidos: `pending` → `paid` → `confirmed` → `shipped` → `delivered` → `cancelled`

> Un seller solo puede actualizar órdenes que contengan al menos uno de sus productos.

### Usuarios

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| `GET` | `/user/profile` | Cualquiera | Perfil del usuario autenticado |
| `GET` | `/user` | Admin | Listar usuarios (filtros: `firstName`, `lastName`, `email`, `role`, `country`, `city`) |
| `GET` | `/user/:id` | Autenticado | Obtener usuario por ID |
| `PATCH` | `/user/:id` | Admin | Actualizar datos de usuario |
| `DELETE` | `/user/:id` | Admin | Eliminar usuario |

### Reseñas

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| `POST` | `/review` | Cualquiera | Crear reseña (requiere orden con status `delivered`) |
| `GET` | `/review/product/:productId` | Público | Listar reseñas de un producto |

Body de creación: `{ "productId": 5, "rating": 4, "comment": "Excelente" }` (rating: 1–5)

---

## 11. Autenticación y roles

El sistema usa **JWT (Bearer token)**. Incluye el token en cada request protegido:

```
Authorization: Bearer <tu_token>
```

### Sesión: access token + refresh token

- El **access token** (JWT) dura **15 minutos** (`ACCESS_TOKEN_TTL`) y se envía en `Authorization: Bearer`.
- El **refresh token** es opaco, dura **7 días** (`REFRESH_TOKEN_TTL_SECONDS`) y se guarda en Redis solo como hash.
- Cada `POST /auth/refresh` **rota** el refresh token: el anterior deja de servir. Usar un refresh token ya usado se interpreta como robo y **revoca toda esa sesión**.
- Los datos del access token (`role`, `sellerId`) se recalculan desde la base de datos en cada refresh, así que un cambio como crear el perfil Seller se refleja sin volver a iniciar sesión.
- Si Redis falla, `/auth/refresh` responde `500` (no `401`), para que los clientes no descarten una sesión válida.
- Dos refresh simultáneos con el mismo token (por ejemplo, dos pestañas a la vez) cuentan como reutilización y cierran la sesión. El frontend evita esto compartiendo un único refresh en curso.

### Roles y capacidades

| Rol / perfil | Cómo obtenerlo | Capacidades principales |
|---|---|---|
| `user` | Registro por defecto | Comprar, carrito, reseñas de productos entregados |
| Perfil `Seller` | `POST /seller` | Publicar productos, gestionar órdenes de venta |
| `admin` | Asignar desde Prisma Studio | Gestión de usuarios y sellers (no vende) |

Cualquier usuario autenticado puede comprar. Para vender hay que crear un perfil Seller:

```bash
POST /seller
Authorization: Bearer <jwt>
{ "businessName": "Puesto de Ana", "description": "...", "location": "Pasillo 3" }
```

La respuesta incluye un JWT nuevo con `sellerId`; si el cliente no lo guarda, el siguiente `POST /auth/refresh` lo trae.

---

## 12. Socket.IO — Tiempo real

El servidor Socket.IO comparte el mismo puerto HTTP. La conexión **requiere autenticación JWT**.

### Conectar desde el cliente

```js
const socket = io("http://localhost:3000", {
  auth: { token: "<tu_jwt>" }, // JWT sin el prefijo "Bearer " (con header Authorization sí lleva "Bearer ")
  transports: ["websocket"],
});

// Unirse a la sala personal para recibir notificaciones
socket.on("connect", () => {
  socket.emit("register", "TU_USER_ID");
});

// Escuchar actualizaciones de órdenes
socket.on("order:status", (payload) => {
  console.log("order:status", payload);
});
```

> El servidor rechaza la conexión si el token es inválido o está expirado.

### Eventos

Todos se emiten a la sala personal `user:<id>` y además se guardan en el historial (ver [Notificaciones](#notificaciones)).

| Evento | Destinatario | Cuándo | Payload |
|---|---|---|---|
| `order:status` | Comprador y vendedores del pedido | Un pedido pasa a `confirmed` | `{ orderId, status }` |
| `order:new` | Cada vendedor involucrado | Checkout exitoso (solo sus ítems) | `{ orderId, items: [{ productId, name, quantity }] }` |
| `stock:low` | Vendedor del producto | Tras una venta, el stock queda ≤ `LOW_STOCK_THRESHOLD` (incluye `0`) | `{ productId, name, stock, threshold }` |
| `review:new` | Vendedor del producto | Se crea una reseña | `{ productId, name, rating }` |

Las notificaciones son *best-effort*: si el socket no está inicializado o falla el guardado del historial, el flujo de negocio (checkout, reseña) no se interrumpe.

### Notificaciones

Historial persistente de los eventos anteriores. Todas las rutas requieren JWT y solo devuelven las notificaciones del usuario autenticado.

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/notification` | Listar (más recientes primero). Query: `page` (default `1`), `limit` (default `20`, máx. `50`), `unread=true` |
| `PATCH` | `/notification/read-all` | Marcar todas como leídas |
| `PATCH` | `/notification/:id/read` | Marcar una como leída (`404` si no es del usuario) |

La respuesta de `GET /notification` incluye `data: { items, total, unread, page, limit }`.

---

## 13. Email

Las notificaciones de email (confirmación de orden, reset de contraseña) usan BullMQ para encolarse y enviarse en segundo plano.

- **Sin `SMTP_HOST`**: los emails se imprimen en la consola del servidor.
- **Desarrollo con Mailpit**: `docker compose up -d mailpit`, UI en `http://localhost:8027`, SMTP en `localhost:1027` (ver `.env.example`). Flujo típico: `POST /auth/password/forgot` → correo en la inbox de Mailpit → link a `http://localhost:4200/reset-password?token=...`.
- **Producción / staging**: configura `SMTP_*` con un proveedor real (Resend, SES, etc.).

---

## 14. Estructura del proyecto

```
Mercadito_Backend/
├── docker-compose.yaml
├── .env.example
├── prisma/
│   ├── schema.prisma
│   └── migrations/
├── src/
│   ├── main.ts                      # Bootstrap del servidor
│   ├── config/
│   │   ├── env.config.ts            # Variables de entorno tipadas
│   │   ├── prisma.ts                # Cliente Prisma singleton
│   │   ├── server.routes.ts         # Montaje de rutas
│   │   └── socket.ts                # Socket.IO con auth JWT
│   ├── docs/
│   │   ├── endpoints.ts             # Catálogo de endpoints (fuente de la spec OpenAPI)
│   │   ├── schemas.ts               # Modelos de respuesta y validadores solo-documentación
│   │   ├── openapi.ts               # Genera el documento OpenAPI desde Zod
│   │   ├── postman.ts / export.ts   # Colección de Postman derivada de la spec
│   │   └── docs.router.ts           # /docs (Swagger UI) y /docs.json
│   ├── middleware/
│   │   ├── userSesion.middleware.ts  # Verifica JWT
│   │   └── userRole.middleware.ts   # Verifica rol y lo adjunta a req.user
│   ├── modules/
│   │   ├── auth/                    # Register, login, password reset
│   │   ├── products/                # CRUD + schemas Zod
│   │   ├── users/                   # Perfil y gestión (admin)
│   │   ├── carts/                   # Carrito + checkout
│   │   ├── orders/                  # Órdenes del buyer y seller
│   │   ├── reviews/                 # Reseñas post-entrega
│   │   ├── notifications/           # Historial de notificaciones
│   │   ├── search/                  # Búsqueda híbrida (pgvector + texto)
│   │   ├── assistant/               # Asistente de compras: LLM, herramientas, acciones pendientes
│   │   └── healthCheck/             # GET /health
│   ├── tools/
│   │   ├── mailQueue.tool.ts        # BullMQ + nodemailer
│   │   ├── mailTemplates.tool.ts    # HTML/text de emails transaccionales
│   │   ├── passwordReset.tool.ts    # Tokens Redis
│   │   ├── notify.tool.ts           # Guardar y emitir notificaciones (Socket.IO)
│   │   ├── crypto.tool.ts           # bcrypt
│   │   └── jwt.tool.ts              # Generación de tokens
│   └── __tests__/                   # Tests con Vitest
│       ├── auth.test.ts
│       ├── checkout.test.ts
│       └── reviews.test.ts
└── vitest.config.ts
```

---

## Licencia

ISC — ver [LICENSE](./LICENSE)
