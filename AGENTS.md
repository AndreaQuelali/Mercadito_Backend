# Guía para Agentes de Inteligencia Artificial (AGENTS.md) - Mercadito Backend

Este documento establece las pautas, convenciones y estándares técnicos obligatorios para cualquier agente de IA o desarrollador que modifique o extienda la base de código de **Mercadito_Backend**.

---

## 1. Visión General del Proyecto

- **Entorno & Lenguaje**: Node.js, TypeScript 5.
- **Framework Web**: Express 5.
- **ORM / Base de Datos**: Prisma ORM 6 + PostgreSQL.
- **Validación**: Zod.
- **Autenticación & Seguridad**: JWT (JsonWebToken), Bcrypt.
- **Procesos Asíncronos & Caché**: BullMQ + Redis + ioredis.
- **WebSockets / Tiempo Real**: Socket.io.
- **Pruebas**: Vitest + Supertest.

---

## 2. Arquitectura de Directorios

El código fuente del backend se organiza bajo `src/` aplicando una arquitectura por capas estrictamente desacoplada:

```
src/
├── config/         # Configuración global y validación de variables de entorno (Zod)
├── controllers/    # Controladores HTTP (manejo de req/res, delegación a servicios)
├── services/       # Lógica de negocio pura e integraciones
├── repositories/   # Acceso a base de datos mediante Prisma Client
├── middlewares/    # Middlewares de autenticación, validación Zod y manejo centralizado de errores
├── routes/         # Definición y agrupamiento de rutas Express
├── schemas/        # Esquemas de validación Zod para peticiones y respuestas
├── jobs/           # Procesadores de tareas en segundo plano (BullMQ)
├── sockets/        # Manejadores de eventos WebSockets en tiempo real (Socket.io)
├── utils/          # Helpers, constantes y generadores de tokens
└── main.ts         # Punto de entrada principal del servidor Express
```

---

## 3. Reglas Estrictas de Código y Convenciones

### 3.1 Arquitectura por Capas
1. **Controladores (`controllers/`)**: Solo procesan peticiones HTTP (`req`, `res`, `next`), invocan validaciones y llaman al servicio correspondiente. **No deben contener lógica de negocio directa ni consultas SQL/Prisma**.
2. **Servicios (`services/`)**: Contienen toda la lógica de negocio, reglas de dominio y coordinación de eventos/trabajos asíncronos.
3. **Repositorios / ORM (`prisma/`)**: Toda interacción con la base de datos debe ejecutarse vía `@prisma/client`.

### 3.2 Validación con Zod
- Toda petición entrante (body, params, query) debe validarse mediante un esquema Zod utilizando el middleware de validación antes de llegar al controlador.
- No confiar en datos no sanitizados del cliente.

### 3.3 Manejo Centralizado de Errores
- Utilizar clases de error personalizadas (`AppError`, `NotFoundError`, `UnauthorizedError`, `ValidationError`).
- Todos los errores asíncronos en controladores deben ser capturados y pasados a `next(error)`.
- El middleware global de errores (`error.middleware.ts`) formateará la respuesta en formato estándar JSON:
  ```json
  {
    "success": false,
    "error": {
      "message": "Descripción legible del error",
      "code": "NOMBRE_DEL_ERROR",
      "details": []
    }
  }
  ```

### 3.4 Prisma ORM y Migraciones
- Al modificar el archivo `prisma/schema.prisma`, generar la migración adecuada con `npm run prisma:migrate:dev`.
- Mantener nombres de modelos en PascalCase (`User`, `Seller`, `Product`, `Order`) y tablas en snake_case utilizando `@map`.

---

## 4. Comandos de Desarrollo y Verificación

Antes de entregar cualquier cambio, el agente debe verificar que el proyecto compile y pase las pruebas:

- **Servidor de Desarrollo**: `npm run start:dev`
- **Compilación**: `npm run build`
- **Ejecutar Pruebas Unitarias / Integración**: `npm run test`
- **Generar Prisma Client**: `npm run prisma:generate`

---

## 5. Proceso de Contribución y Pull Requests

Cualquier nuevo endpoint o servicio debe incluir sus correspondientes pruebas unitarias/de integración con Vitest y respetar la plantilla de PR del proyecto (`pullrequest_template.md`).
