import { describe, expect, it, vi } from "vitest";
import { enrichWithOsv, extractRepositoryDependencies } from "./dependencies";
import type { SourceFileInput } from "./types";

const source = (path: string, content: string): SourceFileInput => ({ path, content, sha: "sha", size: content.length });

describe("repository dependency inventory", () => {
    it("extracts versions and source evidence from supported manifests", () => {
        const dependencies = extractRepositoryDependencies([
            source("package.json", JSON.stringify({ dependencies: { react: "^19.0.0" } })),
            source("package-lock.json", JSON.stringify({ packages: { "": {}, "node_modules/react": { version: "19.0.1" }, "node_modules/lodash": { version: "4.17.21" } } })),
            source("requirements.txt", "flask==3.0.1\n# urllib3>=1.0\n"),
            source("pyproject.toml", "[project]\ndependencies = [\n  \"httpx>=0.27\",\n]\n"),
            source("go.mod", "module example.com/test\n\nrequire github.com/pkg/errors v0.9.1\n"),
            source("Cargo.toml", "[dependencies]\nserde = \"1.0.200\"\n"),
            source("pom.xml", "<dependencies><dependency><groupId>org.example</groupId><artifactId>demo</artifactId><version>2.0</version></dependency></dependencies>"),
            source("build.gradle", "implementation 'org.example:thing:1.4.0'"),
        ]);
        expect(dependencies.map(({ ecosystem, name, version }) => `${ecosystem}:${name}@${version}`)).toEqual(expect.arrayContaining([
            "npm:react@^19.0.0", "npm:react@19.0.1", "npm:lodash@4.17.21", "PyPI:flask@3.0.1",
            "Go:github.com/pkg/errors@v0.9.1", "crates.io:serde@^1.0.200", "PyPI:httpx@>=0.27", "Maven:org.example:demo@2.0", "Gradle:org.example:thing@1.4.0",
        ]));
        expect(dependencies.find((item) => item.name === "react" && item.version === "19.0.1")?.direct).toBe(true);
        expect(dependencies.every((item) => item.evidence[0].observed)).toBe(true);
    });

    it("keeps malformed manifests empty and reports OSV outages", async () => {
        expect(extractRepositoryDependencies([source("package.json", "not json")])).toEqual([]);
        const fetcher = vi.fn<typeof fetch>().mockRejectedValue(new Error("network unavailable"));
        const input = extractRepositoryDependencies([source("requirements.txt", "flask==3.0.1")]);
        const output = await enrichWithOsv(input, fetcher);
        expect(output[0].advisoryState).toBe("unavailable");
        expect(output[0].advisories).toEqual([]);
    });

    it("uses one bounded OSV batch and reports severity and known fixed versions", async () => {
        const input = extractRepositoryDependencies([source("requirements.txt", "flask==3.0.1")]);
        const fetcher = vi.fn(async (input: RequestInfo | URL) => { void input; return new Response(JSON.stringify({ results: [{ vulns: [{ id: "GHSA-test", summary: "Example issue", database_specific: { severity: "HIGH" }, affected: [{ ranges: [{ events: [{ introduced: "0" }, { fixed: "3.0.2" }] }] }] }] }] }), { status: 200 }); });
        const output = await enrichWithOsv(input, fetcher as unknown as typeof fetch);
        expect(fetcher).toHaveBeenCalledOnce();
        expect(output[0].advisoryState).toBe("checked");
        expect(output[0].advisories?.[0]).toMatchObject({ id: "GHSA-test", severity: "high", fixedVersion: "3.0.2" });
        expect(String(fetcher.mock.calls[0]?.[0])).toContain("querybatch");
    });
});
