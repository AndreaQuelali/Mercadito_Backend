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
| `SALTS` | No | Rounds de bcrypt (default: `10`, rango válido: 1–31) |
| `APP_URL` | No | URL base para los links de reset de contraseña |
| `CORS_ORIGIN` | No | Origen permitido para CORS. Ej: `http://localhost:5173`. Usar `*` solo en dev. |

### Redis

| Variable | Descripción |
|---|---|
| `REDIS_HOST` | Host de Redis (default: `localhost`) |
| `REDIS_PORT` | Puerto de Redis (default: `6379`) |

> Si el backend corre en tu máquina y Redis en Docker: `REDIS_HOST=localhost`.  
> Si ambos corren dentro de Docker en la misma red: `REDIS_HOST=redis`.

### Email SMTP (opcional)

Si se deja vacío, los emails se imprimen en consola (modo desarrollo). Para enviar emails reales, configura un proveedor SMTP:

| Variable | Descripción |
|---|---|
| `SMTP_HOST` | Servidor SMTP (ej: `smtp.gmail.com`, `smtp.resend.com`) |
| `SMTP_PORT` | Puerto SMTP (ej: `587` para TLS, `465` para SSL) |
| `SMTP_USER` | Usuario / dirección del remitente |
| `SMTP_PASS` | Contraseña o App Password del proveedor |
| `SMTP_FROM` | Dirección "From" de los emails |

---

## 10. Referencia de la API

### Health

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| `GET` | `/health` | Público | Verifica que el servidor responde |

### Auth

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| `POST` | `/auth/register` | Público | Registra un nuevo usuario (rol `client` por defecto) |
| `POST` | `/auth/login` | Público | Login → retorna JWT |
| `POST` | `/auth/password/forgot` | Público | Solicitar reset de contraseña |
| `POST` | `/auth/password/reset` | Público | Confirmar nuevo password con token |

### Productos

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| `GET` | `/product` | Público | Listar productos (filtros: `name`, `category`, `minPrice`, `maxPrice`, `startAt`, `endAt`) |
| `GET` | `/product/:id` | Público | Obtener un producto por ID |
| `GET` | `/product/mine` | Seller | Listar los productos propios |
| `POST` | `/product` | Seller | Crear producto |
| `PUT` | `/product/:id` | Seller (dueño) | Actualizar producto propio |
| `DELETE` | `/product/:id` | Seller (dueño) | Eliminar producto propio |

Categorías válidas: `verduras`, `frutas`, `panaderia`, `lacteos`, `artesanias`  
Unidades válidas: `kilogramo`, `unidad`, `frasco`, `litro`

### Carrito

Todos los endpoints requieren sesión activa (JWT).

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/cart` | Ver el carrito (retorna `{ items: [] }` si está vacío) |
| `POST` | `/cart/add` | Agregar o aumentar un ítem — Body: `{ "productId": 1, "quantity": 2 }` |
| `PATCH` | `/cart/item/:itemId` | Actualizar cantidad de un ítem — Body: `{ "quantity": 3 }` |
| `DELETE` | `/cart/item/:itemId` | Eliminar un ítem del carrito |
| `DELETE` | `/cart` | Vaciar el carrito completo |
| `POST` | `/cart/checkout` | Crear orden desde el carrito (descuenta stock, vacía carrito) |

### Órdenes

Todos los endpoints requieren sesión activa (JWT).

| Método | Ruta | Roles | Descripción |
|---|---|---|---|
| `GET` | `/order` | Cualquiera | Mis órdenes |
| `GET` | `/order/:id` | Cualquiera | Detalle de una orden propia |
| `GET` | `/order/seller/mine` | Seller | Órdenes que contienen productos del seller |
| `PATCH` | `/order/:id/status` | Seller / Admin | Actualizar status de una orden |

Estados válidos: `pending` → `paid` → `confirmed` → `shipped` → `delivered` → `cancelled`

> Un seller solo puede actualizar órdenes que contengan al menos uno de sus productos.

### Usuarios

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| `GET` | `/user/profile` | Cualquiera | Perfil del usuario autenticado |
| `GET` | `/user` | Admin | Listar usuarios (filtros: `firstName`, `lastName`, `email`, `role`, `country`, `city`) |
| `GET` | `/user/:id` | Admin / Seller | Obtener usuario por ID |
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

### Roles

| Rol | Cómo obtenerlo | Capacidades principales |
|---|---|---|
| `client` | Registro por defecto | Comprar, reseñar productos entregados |
| `seller` | Asignar desde Prisma Studio o admin | Publicar productos, gestionar sus órdenes |
| `admin` | Asignar desde Prisma Studio | Gestión completa de usuarios |

Para asignar rol `seller` a un usuario durante el desarrollo, usa Prisma Studio:

```bash
npx prisma studio
# Ir a la tabla User → editar el campo role
```

---

## 12. Socket.IO — Tiempo real

El servidor Socket.IO comparte el mismo puerto HTTP. La conexión **requiere autenticación JWT**.

### Conectar desde el cliente

```js
const socket = io("http://localhost:3000", {
  auth: { token: "Bearer <tu_jwt>" },
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

---

## 13. Email

Las notificaciones de email (confirmación de orden, reset de contraseña) usan BullMQ para encolarse y enviarse en segundo plano.

- **Sin SMTP configurado** (desarrollo): los emails se imprimen en la consola del servidor.
- **Con SMTP configurado** (producción): rellena las variables `SMTP_*` en `.env` para activar el envío real.

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
│   │   └── healthCheck/             # GET /health
│   ├── tools/
│   │   ├── mailQueue.tool.ts        # BullMQ + nodemailer
│   │   ├── passwordReset.tool.ts    # Tokens Redis
│   │   ├── notify.tool.ts           # Emitir eventos Socket.IO
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
