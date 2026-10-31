
import { config } from "dotenv";
import { defineConfig, env } from "prisma/config";

if (!process.env.VERCEL) {
  config({ path: ".env.local" });
  config();
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations-sqlite",
  },
  engine: "classic",
  datasource: {
    url: process.env.DATABASE_URL ?? env("DATABASE_URL"),
  },
});
