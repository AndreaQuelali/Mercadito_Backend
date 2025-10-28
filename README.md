# Mercadito Backend

Backend en Node.js + TypeScript para el proyecto Mercadito.

---

## ⚙️ Guía de Inicio Rápido

Sigue estos pasos para levantar el proyecto en tu entorno local.

### Prerrequisitos

Asegúrate de tener instalado:

- Node.js: Versión 18 o superior
- npm 
- Docker: para bases de datos como PostgreSQL

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
   - Si NO existe `.env.example`, crea manualmente un archivo `.env` en la raíz del proyecto con tus variables (por ejemplo, `PORT=3000`, `DATABASE_URL=...`).

4. Levantar la Base de Datos con Docker Compose

   ```bash
   docker-compose up -d
   # o
   docker compose up -d
   ```

5. Ejecutar Migraciones

   ```bash
   npm run migrate
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

## ❗ Solución de problemas

- Asegúrate de estar en Node.js 18 o superior: `node -v`.
- Si `npm run start:dev` falla, confirma que `src/main.ts` existe y que no tiene errores de compilación.
- Si usas base de datos, confirma que las variables de entorno (`DATABASE_URL`, etc.) están configuradas.

---

## 📜 Licencia

Este proyecto está distribuido bajo la Licencia ISC.

Puedes leer el texto completo aquí: [LICENSE](./LICENSE)

