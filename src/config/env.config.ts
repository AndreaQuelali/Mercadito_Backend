import dotenv from "dotenv";
dotenv.config();

export const ENV = {
    PORT: process.env.PORT || 3001,
    POSTGRES_USER: process.env.POSTGRES_USER || "andy",
    POSTGRES_PASSWORD: process.env.POSTGRES_PASSWORD || "mercadito123",
    POSTGRES_DB: process.env.POSTGRES_DB || "mercaditoDB",
    PGDATA: process.env.PGDATA || "/var/lib/postgresql/data/pgdata",
    PGHOST: process.env.PGHOST || "localhost",
    PGPORT: process.env.PGPORT || 5433,
    NODE_ENV: process.env.NODE_ENV || "development",
    JWT_SECRET: process.env.JWT_SECRET || "secretKey",
    PWD_SECRET: process.env.PWD_SECRET || "secretPwd",
    SALTS: process.env.SALTS || 512,
    REDIS_URL: process.env.REDIS_URL || "redis://localhost:6379",
}