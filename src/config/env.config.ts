import dotenv from "dotenv";
dotenv.config();

// Fail fast on missing critical secrets so misconfiguration is caught at startup
if (process.env.NODE_ENV === "production" && !process.env.JWT_SECRET) {
  throw new Error("JWT_SECRET environment variable is required in production");
}

export const ENV = {
    PORT: process.env.PORT || 3000,
    POSTGRES_USER: process.env.POSTGRES_USER || "andy",
    POSTGRES_PASSWORD: process.env.POSTGRES_PASSWORD || "mercadito123",
    POSTGRES_DB: process.env.POSTGRES_DB || "mercaditoDB",
    PGDATA: process.env.PGDATA || "/var/lib/postgresql/data/pgdata",
    PGHOST: process.env.PGHOST || "localhost",
    PGPORT: process.env.PGPORT || 5433,
    NODE_ENV: process.env.NODE_ENV || "development",
    /** IMPORTANT: always set a strong secret in production */
    JWT_SECRET: process.env.JWT_SECRET || "secretKey",
    /** Access token lifetime (jsonwebtoken format: "15m", "1h"...). Kept short; sessions last via refresh tokens */
    ACCESS_TOKEN_TTL: process.env.ACCESS_TOKEN_TTL || "15m",
    /** Refresh token / session lifetime in seconds (default 7 days) */
    REFRESH_TOKEN_TTL_SECONDS: Number(process.env.REFRESH_TOKEN_TTL_SECONDS) > 0
        ? Number(process.env.REFRESH_TOKEN_TTL_SECONDS)
        : 60 * 60 * 24 * 7,
    PWD_SECRET: process.env.PWD_SECRET || "secretPwd",
    /** bcrypt rounds — valid range 1-31; 10-12 recommended */
    SALTS: Number(process.env.SALTS) || 10,
    REDIS_HOST: process.env.REDIS_HOST || "localhost",
    REDIS_PORT: process.env.REDIS_PORT || 6379,
    /** Frontend origin for CORS (comma-separated list or * for all) */
    CORS_ORIGIN: process.env.CORS_ORIGIN || "*",
    /** Frontend base URL used in password-reset emails */
    APP_URL: process.env.APP_URL || "http://localhost:4200",
    /** A seller gets a stock:low event when a sale leaves a product at or below this stock */
    LOW_STOCK_THRESHOLD: (() => {
        const raw = process.env.LOW_STOCK_THRESHOLD;
        const n = raw === undefined || raw === "" ? NaN : Number(raw);
        return Number.isInteger(n) && n >= 0 ? n : 5;
    })(),
    // SMTP settings — leave empty to use console-log fallback in dev
    SMTP_HOST: process.env.SMTP_HOST || "",
    SMTP_PORT: Number(process.env.SMTP_PORT) || 587,
    SMTP_USER: process.env.SMTP_USER || "",
    SMTP_PASS: process.env.SMTP_PASS || "",
    SMTP_FROM: process.env.SMTP_FROM || "noreply@mercadito.app",
}
