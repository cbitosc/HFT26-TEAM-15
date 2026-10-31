import { mkdirSync, existsSync, writeFileSync } from "node:fs";
import path from "node:path";
import { config } from "dotenv";

config({ path: ".env.local" });
config();

const databaseUrl = process.env.DATABASE_URL ?? "file:./dev.db";
if (!databaseUrl.startsWith("file:")) {
    throw new Error("RepoMind now uses SQLite. Set DATABASE_URL to a local file URL such as file:./dev.db.");
}

const configuredPath = decodeURIComponent(databaseUrl.slice("file:".length).split("?")[0]);
const databasePath = path.isAbsolute(configuredPath)
    ? configuredPath
    : path.resolve(process.cwd(), "prisma", configuredPath.replace(/^[.][/\\]/, ""));
mkdirSync(path.dirname(databasePath), { recursive: true });
if (!existsSync(databasePath)) writeFileSync(databasePath, new Uint8Array());
