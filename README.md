# Mercadito Backend

Backend en Node.js + TypeScript para el proyecto Mercadito: un marketplace simple para publicar productos (vendedores), gestionar carritos, crear órdenes y dejar reseñas. Incluye autenticación JWT, autorización por roles (client/seller/admin), Socket.IO para notificaciones en tiempo real y Redis (BullMQ) para colas y tokens de recuperación de contraseña.

---

## ⚙️ Guía de Inicio Rápido

Sigue estos pasos para levantar el proyecto en tu entorno local.

### Prerrequisitos

Asegúrate de tener instalado:

- Node.js: Versión 18 o superior
- npm 
- Docker: para PostgreSQL y Redis (vía docker-compose)

### Pasos

1. Clonar el repositorio

   Nota: Reemplaza la URL y nombre del folder según corresponda.

   ```bash
   git clone [URL-DE-TU-REPOSITORIO]
   cd [nombre-del-repositorio]
   ```

2. Instalar dependencias

   ```bash
   npm install
   ```

3. Configurar Variables de Entorno

   - Si existe `.env.example`, crea tu archivo `.env` a partir de la plantilla:
     ```bash
     cp .env.example .env
     ```
   
     # Si el backend corre en tu máquina (host) y Redis está en Docker
     REDIS_HOST=localhost
     REDIS_PORT=6379
     ```
     Nota: Usa `REDIS_HOST=redis` y `REDIS_PORT=6379` solo si el backend también corre dentro de Docker en la misma red de `docker-compose`.

4. Levantar la Base de Datos y Redis con Docker Compose

   ```bash
   docker compose up -d
   ```

   Servicios incluidos:
   - PostgreSQL (con volumen `./database`)
   - Redis (con volumen `./redis` y puerto `${REDIS_PORT}:6379`)

5. Ejecutar Migraciones

   ```bash
   npx prisma migrate dev
   ```

6. Iniciar el Servidor en modo desarrollo

   ```bash
   npm run start:dev
   ```

   Por defecto, el servidor suele correr en `http://localhost:3000` (o el puerto que hayas configurado en `.env`).

---

## 📦 Scripts disponibles

Estos scripts están definidos en `package.json`:

- `npm run start:dev`: levanta el servidor en modo desarrollo con `nodemon` usando `src/main.ts`.
- `npm run build`: compila TypeScript a JavaScript en la carpeta `dist/`.

---

## 🧭 Estructura del Proyecto

```
Mercadito_Backend/
├─ docker-compose.yaml
├─ .env.example
├─ src/
│  ├─ main.ts
│  ├─ config/
│  │  ├─ env.config.ts
│  │  ├─ prisma.ts
│  │  ├─ server.routes.ts
│  │  └─ socket.ts
│  ├─ middleware/
│  │  ├─ userSesion.middleware.ts
│  │  └─ userRole.middleware.ts
│  ├─ modules/
│  │  ├─ auth/
│  │  │  ├─ auth.controller.ts
│  │  │  ├─ auth.routes.ts
│  │  │  └─ auth.service.ts
│  │  ├─ products/
│  │  │  ├─ products.controller.ts
│  │  │  ├─ products.routes.ts
│  │  │  └─ products.service.ts
│  │  ├─ carts/
│  │  │  ├─ carts.controller.ts
│  │  │  ├─ carts.routes.ts
│  │  │  └─ carts.service.ts
│  │  ├─ orders/
│  │  │  ├─ orders.controller.ts
│  │  │  ├─ orders.routes.ts
│  │  │  └─ orders.service.ts
│  │  ├─ reviews/
│  │  │  ├─ reviews.controller.ts
│  │  │  ├─ reviews.routes.ts
│  │  │  └─ reviews.service.ts
│  │  └─ healthCheck/
│  │     ├─ healthCheck.controller.ts
│  │     └─ healthCheck.routes.ts
│  └─ tools/
│     ├─ mailQueue.tool.ts
│     ├─ passwordReset.tool.ts
│     └─ notify.tool.ts
└─ README.md
```

---

## 🔐 Autenticación y Roles

- Registro: `POST /auth/register` (rol por defecto: `client`).
- Login: `POST /auth/login` → retorna JWT (usar en `Authorization: Bearer <token>`).
- Algunos endpoints requieren rol `seller` o `admin` (p.ej. actualizar estado de una orden). Promociona el rol desde la base de datos (Prisma Studio) para pruebas.

---

## 🧺 Carrito y Órdenes

- Obtener mi carrito (requiere sesión):
  - `GET /cart`
- Agregar producto al carrito (requiere sesión):
  - `POST /cart/add`
  - Body: `{ "productId": 1, "quantity": 2 }`
- Crear orden (Checkout desde el carrito, requiere sesión):
  - `POST /cart/checkout`
  - Crea una orden con status `pending`, descuenta stock y vacía el carrito.
- Listar mis órdenes (requiere sesión):
  - `GET /order`
- Detalle de orden (requiere sesión):
  - `GET /order/:id`
- Actualizar estado de la orden (requiere `seller` o `admin`):
  - `PATCH /order/:id/status`
  - Body: `{ "status": "shipped" }` (usa un valor válido de `OrderStatus` de Prisma)

---

## ⭐ Reviews

- Crear review (requiere sesión):
  - `POST /review`
  - Body: `{ "productId": 5, "rating": 5, "comment": "Excelente" }`
- Listar reviews de un producto (público):
  - `GET /review/product/:productId`

---

## 🔔 Socket.IO (tiempo real)

- El servidor Socket.IO comparte el mismo puerto que HTTP (`PORT`) porque se inicializa con `initSocket(server)`.
- Cliente (navegador):
  ```js
  const socket = io("http://localhost:3000", { transports: ["websocket"] });
  socket.on("connect", () => {
    console.log("connected", socket.id);
    socket.emit("register", "USER_ID_DE_PRUEBA");
  });
  socket.on("order:status", (p) => console.log("order:status", p));
  ```
- Desde el backend: emite a la sala del usuario `user:<userId>` usando `notify.tool.ts` (helper) y `getIO()` de `src/config/socket.ts`.

---

## 🧰 Redis y BullMQ

- Redis corre con docker-compose (servicio `redis`).
- Configurar `.env` para Backend en Host + Redis en Docker:
  - `REDIS_HOST=localhost`
  - `REDIS_PORT=6379`
- Probar Redis en contenedor:
  ```bash
  docker exec -it redis-mercadito redis-cli ping          # PONG
  docker exec -it redis-mercadito redis-cli set test 1    # OK
  docker exec -it redis-mercadito redis-cli get test      # 1
  ```
- Forgot/Reset Password:
  - `POST /auth/password/forgot` → genera token temporal (clave `pwdreset:*` en Redis) y encola un "mail" con BullMQ (se loguea en consola).
  - `POST /auth/password/reset` con `{ token, newPassword }` → actualiza contraseña y borra el token.

---

## ❗ Solución de problemas

- Asegúrate de estar en Node.js 18 o superior: `node -v`.
- Si `npm run start:dev` falla, confirma que `src/main.ts` existe y que no tiene errores de compilación.
- Si usas base de datos, confirma que las variables de entorno (`DATABASE_URL`, etc.) están configuradas.
- Error `ENOTFOUND redis`: usa `REDIS_HOST=localhost` cuando el backend corre en host. Usa `redis` solo si backend también corre dentro de Docker.
- Error `EADDRINUSE :3000`/`:3001`: el puerto está ocupado. Mata el proceso (`lsof -i :3000` y `kill -9 <PID>`) o cambia `PORT` en `.env`.
- Error en Postman "Invalid character in header content [Host]": No agregues el header `Host` manualmente. Escribe la URL manualmente (`http://localhost:3000`) y revisa que no tenga caracteres ocultos.

---

## 📜 Licencia

Este proyecto está distribuido bajo la Licencia ISC.

Puedes leer el texto completo aquí: [LICENSE](./LICENSE)

