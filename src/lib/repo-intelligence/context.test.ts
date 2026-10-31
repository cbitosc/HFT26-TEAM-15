import { describe, expect, it } from "vitest";
import { prioritizeRepositoryPaths } from "./context";
import type { RepositoryIntelligence } from "./types";

const result = {
    files: [
        { path: "src/auth/login.ts", routes: [], symbols: [{ name: "loginUser", kind: "function", line: 2, exported: true }] },
        { path: "src/db/client.ts", routes: [], symbols: [{ name: "createClient", kind: "function", line: 1, exported: true }] },
    ],
} as unknown as RepositoryIntelligence;

describe("repository intelligence chat retrieval", () => {
    it("prioritizes matching route, symbol, and path evidence without adding stale files", () => {
        const paths = ["src/db/client.ts", "README.md", "src/auth/login.ts", "src/deleted/login.ts"];
        expect(prioritizeRepositoryPaths(result, "explain login route and loginUser", paths)).toEqual([
            "src/auth/login.ts", "src/db/client.ts", "README.md", "src/deleted/login.ts",
        ]);
    });

    it("preserves candidate paths when no index term matches", () => {
        const paths = ["src/db/client.ts", "src/auth/login.ts"];
        expect(prioritizeRepositoryPaths(result, "what is the weather", paths)).toEqual(paths);
    });
});
