import type { IntelligenceEvidence, RepositoryDependency, SourceFileInput } from "./types";
export type { RepositoryDependency } from "./types";

const evidence = (path: string, line: number | undefined, description: string, strength: "high" | "medium" = "high"): IntelligenceEvidence => ({
    path, ...(line ? { startLine: line, endLine: line } : {}), kind: "manifest", description, strength, observed: true,
});

function parsePackageJson(content: string, path: string): RepositoryDependency[] {
    try {
        const json = JSON.parse(content) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string>; optionalDependencies?: Record<string, string> };
        return [[json.dependencies, false], [json.devDependencies, true], [json.optionalDependencies, false]].flatMap(([group, development]) => Object.entries((group ?? {}) as Record<string, string>).map(([name, version]) => ({
            name, version: typeof version === "string" ? version.trim() : "unknown", ecosystem: "npm" as const, direct: true, development: Boolean(development),
            evidence: [evidence(path, undefined, `Declared as ${version} in package.json.`, "medium")], advisoryState: "not-checked" as const,
        })));
    } catch { return []; }
}

function parsePackageLock(content: string, path: string): RepositoryDependency[] {
    try {
        interface LockedDependency { version?: string; dependencies?: Record<string, LockedDependency> }
        const json = JSON.parse(content) as { packages?: Record<string, { version?: string }>; dependencies?: Record<string, LockedDependency> };
        const dependencies = Object.entries(json.packages ?? {}).filter(([key]) => key.startsWith("node_modules/")).map(([key, item]) => ({
            name: key.replace(/^node_modules\//, "").replace(/\/node_modules\//g, "/"), version: item.version ?? "unknown",
        }));
        if (!dependencies.length) {
            const flattened: { name: string; version: string }[] = [];
            const pending = Object.entries(json.dependencies ?? {});
            while (pending.length > 0 && flattened.length < 10_000) {
                const [name, item] = pending.pop()!;
                flattened.push({ name, version: item.version ?? "unknown" });
                if (item.dependencies) pending.push(...Object.entries(item.dependencies));
            }
            return flattened.map(({ name, version }) => ({ name, version, ecosystem: "npm" as const, direct: false, development: false,
                evidence: [evidence(path, undefined, `Resolved version ${version} in npm lockfile.`)], advisoryState: "not-checked" as const }));
        }
        return dependencies.map(({ name, version }) => ({ name, version, ecosystem: "npm" as const, direct: false, development: false,
            evidence: [evidence(path, undefined, `Resolved version ${version} in npm lockfile.`)], advisoryState: "not-checked" as const }));
    } catch { return []; }
}

function parseRequirements(content: string, path: string): RepositoryDependency[] {
    return content.split(/\r?\n/).flatMap((line, index) => {
        const match = line.trim().match(/^([A-Za-z0-9_.-]+)\s*(===|==|~=|>=|<=|>|<)\s*([A-Za-z0-9_.+!-]+)/);
        const version = match ? (match[2] === "==" || match[2] === "===" ? match[3] : `${match[2]}${match[3]}`) : "";
        return match ? [{ name: match[1], version, ecosystem: "PyPI" as const, direct: true, development: /(?:dev|test)/i.test(path.split("/").at(-1) ?? ""), evidence: [evidence(path, index + 1, `Pinned or constrained in requirements file.`)], advisoryState: "not-checked" as const }] : [];
    });
}

function parsePyProject(content: string, path: string): RepositoryDependency[] {
    const result: RepositoryDependency[] = [];
    let section = "";
    let inProjectArray = false;
    const add = (spec: string, line: number) => {
        const match = spec.trim().replace(/^["']|["'],?$/g, "").match(/^([A-Za-z0-9_.-]+)(?:\[[^\]]+\])?\s*(.*)$/);
        if (!match) return;
        const rawVersion = match[2].trim().replace(/^,|,$/g, "");
        const version = rawVersion.startsWith("==") ? rawVersion.replace(/^===?/, "") : rawVersion || "unknown";
        result.push({ name: match[1], version, ecosystem: "PyPI", direct: true, development: /optional-dependencies|dev|test/i.test(section),
            evidence: [evidence(path, line, "Declared in pyproject.toml.", "medium")], advisoryState: "not-checked" });
    };
    content.split(/\r?\n/).forEach((line, index) => {
        const sectionMatch = line.match(/^\s*\[([^\]]+)\]/);
        if (sectionMatch) { section = sectionMatch[1].trim(); inProjectArray = false; }
        if ((section === "project" || section === "project.optional-dependencies") && /^\s*(?:dependencies|dev|test)\s*=\s*\[/.test(line)) inProjectArray = true;
        if (section === "project" && inProjectArray) {
            for (const match of line.matchAll(/["']([^"']+)["']/g)) add(match[1], index + 1);
            if (line.includes("]")) inProjectArray = false;
        } else if (section === "tool.poetry.dependencies" || section === "tool.poetry.group.dev.dependencies" || section === "tool.poetry.dev-dependencies") {
            const match = line.match(/^\s*([A-Za-z0-9_.-]+)\s*=\s*(?:["']([^"']+)["']|\{[^}]*version\s*=\s*["']([^"']+)["'])/);
            if (match && match[1] !== "python") {
                const before = result.length;
                add(`${match[1]}${match[2] ?? match[3]}`, index + 1);
                if (/\.dev-dependencies$|group\.dev\.dependencies$/.test(section) && result[before]) result[before].development = true;
            }
        }
    });
    return result;
}

function parseGoMod(content: string, path: string): RepositoryDependency[] {
    return content.split(/\r?\n/).flatMap((line, index) => {
        const match = line.match(/^\s*(?:require\s+)?([\w.-]+\.[\w.-]+(?:\/[\w./-]+)*)\s+(v\S+)/);
        return match ? [{ name: match[1], version: match[2], ecosystem: "Go" as const, direct: true, development: false, evidence: [evidence(path, index + 1, "Declared in go.mod.")], advisoryState: "not-checked" as const }] : [];
    });
}

function parseCargo(content: string, path: string): RepositoryDependency[] {
    let inDeps = false;
    let development = false;
    return content.split(/\r?\n/).flatMap((line, index) => {
        const section = line.trim().match(/^\[([^\]]+)\]$/);
        if (section) { inDeps = /^(?:dev-|build-)?dependencies(?:\.|$)/.test(section[1]); development = /^dev-dependencies/.test(section[1]); return []; }
        if (!inDeps) return [];
        const match = line.match(/^\s*([\w-]+)\s*=\s*(?:"([^"]+)"|\{[^}]*version\s*=\s*"([^"]+)"[^}]*\})/);
        const version = match ? (match[2] ?? match[3] ?? "unknown") : "";
        return match ? [{ name: match[1], version: /^[~^<>=]/.test(version) ? version : `^${version}`, ecosystem: "crates.io" as const, direct: true, development, evidence: [evidence(path, index + 1, "Declared in Cargo.toml.", "medium")], advisoryState: "not-checked" as const }] : [];
    });
}

function parseMaven(content: string, path: string): RepositoryDependency[] {
    const deps: RepositoryDependency[] = [];
    const blocks = content.matchAll(/<dependency>([\s\S]*?)<\/dependency>/g);
    for (const block of blocks) {
        const group = block[1].match(/<groupId>([^<]+)<\/groupId>/)?.[1];
        const artifact = block[1].match(/<artifactId>([^<]+)<\/artifactId>/)?.[1];
        const version = block[1].match(/<version>([^<]+)<\/version>/)?.[1];
        if (group && artifact) deps.push({ name: `${group}:${artifact}`, version: version?.trim() ?? "managed/unknown", ecosystem: "Maven", direct: true, development: /<scope>\s*test\s*<\/scope>/.test(block[1]), evidence: [evidence(path, undefined, "Declared in Maven pom.xml.", "medium")], advisoryState: "not-checked" });
    }
    return deps;
}

function parseGradle(content: string, path: string): RepositoryDependency[] {
    return content.split(/\r?\n/).flatMap((line, index) => {
        const match = line.match(/\b(?:implementation|api|compileOnly|runtimeOnly|testImplementation)\s*\(?\s*["']([^:"']+):([^:"']+):([^"']+)["']/);
        return match ? [{ name: `${match[1]}:${match[2]}`, version: match[3], ecosystem: "Gradle" as const, direct: true, development: /\btestImplementation\b/.test(line), evidence: [evidence(path, index + 1, "Declared in Gradle build file.", "medium")], advisoryState: "not-checked" as const }] : [];
    });
}

/** Parse supported text manifests conservatively. This never executes repository code. */
export function extractRepositoryDependencies(files: SourceFileInput[]): RepositoryDependency[] {
    const found: RepositoryDependency[] = [];
    for (const file of files) {
        const name = file.path.split("/").at(-1)?.toLowerCase();
        if (name === "package.json") found.push(...parsePackageJson(file.content, file.path));
        else if (name === "package-lock.json") found.push(...parsePackageLock(file.content, file.path));
        else if (name === "requirements.txt") found.push(...parseRequirements(file.content, file.path));
        else if (name === "pyproject.toml") found.push(...parsePyProject(file.content, file.path));
        else if (name === "go.mod") found.push(...parseGoMod(file.content, file.path));
        else if (name === "cargo.toml") found.push(...parseCargo(file.content, file.path));
        else if (name === "pom.xml") found.push(...parseMaven(file.content, file.path));
        else if (name === "build.gradle" || name === "build.gradle.kts") found.push(...parseGradle(file.content, file.path));
        else if (name === "gemfile") {
            let development = false;
            file.content.split(/\r?\n/).forEach((line, index) => {
                if (/^\s*group\s+:(?:development|test)\b/.test(line)) development = true;
                if (/^\s*end\s*$/.test(line)) development = false;
                const match = line.match(/^\s*gem\s+["']([^"']+)["'](?:,\s*["']([^"']+)["'])?/);
                if (match) found.push({ name: match[1], version: match[2]?.trim() || "unknown", ecosystem: "RubyGems", direct: true, development, evidence: [evidence(file.path, index + 1, "Declared in Gemfile.", "medium")], advisoryState: "not-checked" });
            });
        }
        else if (name === "composer.json") { try { const json = JSON.parse(file.content) as { require?: Record<string, string>; "require-dev"?: Record<string, string> }; for (const [packageName, version] of Object.entries(json.require ?? {})) if (packageName !== "php") found.push({ name: packageName, version: version.trim(), ecosystem: "Packagist", direct: true, development: false, evidence: [evidence(file.path, undefined, "Declared in composer.json.", "medium")], advisoryState: "not-checked" }); for (const [packageName, version] of Object.entries(json["require-dev"] ?? {})) if (packageName !== "php") found.push({ name: packageName, version: version.trim(), ecosystem: "Packagist", direct: true, development: true, evidence: [evidence(file.path, undefined, "Declared in composer require-dev.", "medium")], advisoryState: "not-checked" }); } catch { /* malformed manifests stay unclassified */ } }
    }
    const directTypes = new Map(found.filter((item) => item.direct).map((item) => [`${item.ecosystem}:${item.name}`, item.development]));
    const deduplicated = new Map<string, RepositoryDependency>();
    for (const item of found) {
        const key = `${item.ecosystem}:${item.name}:${item.version}`;
        const prior = deduplicated.get(key);
        if (prior) { prior.evidence.push(...item.evidence); prior.direct ||= item.direct; prior.development ||= item.development; }
        else deduplicated.set(key, { ...item, direct: item.direct || directTypes.has(`${item.ecosystem}:${item.name}`), development: item.development || directTypes.get(`${item.ecosystem}:${item.name}`) === true });
    }
    return [...deduplicated.values()].sort((a, b) => a.ecosystem.localeCompare(b.ecosystem) || a.name.localeCompare(b.name)).slice(0, 2000);
}

const osvNames: Record<RepositoryDependency["ecosystem"], string | null> = { npm: "npm", PyPI: "PyPI", Go: "Go", "crates.io": "crates.io", Maven: "Maven", Gradle: "Maven", RubyGems: "RubyGems", Packagist: "Packagist", unknown: null };

function advisorySeverity(value: unknown): "critical" | "high" | "medium" | "low" | "unknown" {
    if (typeof value === "string") {
        const normalized = value.toLowerCase();
        if (["critical", "high", "medium", "low"].includes(normalized)) return normalized as "critical" | "high" | "medium" | "low";
        const score = Number.parseFloat(normalized);
        if (Number.isFinite(score)) return score >= 9 ? "critical" : score >= 7 ? "high" : score >= 4 ? "medium" : "low";
    }
    return "unknown";
}

/** Query OSV for bounded exact versions; preserve inventory and report unavailable lookups explicitly. */
export async function enrichWithOsv(dependencies: RepositoryDependency[], fetcher: typeof fetch = fetch): Promise<RepositoryDependency[]> {
    const checks = dependencies.filter((dependency) => dependency.version !== "unknown" && !/[<>=*^~|,()[\]\s]/.test(dependency.version) && osvNames[dependency.ecosystem]);
    const bounded = checks.slice(0, 50);
    if (!bounded.length) return dependencies;
    type OsvVulnerability = { id?: string; summary?: string; database_specific?: { severity?: unknown }; affected?: { ranges?: { events?: { fixed?: string }[] }[] }[] };
    let results: { vulns?: OsvVulnerability[] }[] | null = null;
    try {
        const response = await fetcher("https://api.osv.dev/v1/querybatch", {
            method: "POST", headers: { "content-type": "application/json" },
            body: JSON.stringify({ queries: bounded.map((dependency) => ({ package: { name: dependency.name, ecosystem: osvNames[dependency.ecosystem]! }, version: dependency.version })) }),
            signal: AbortSignal.timeout(5000),
        });
        if (response.ok) {
            const data = await response.json() as { results?: { vulns?: OsvVulnerability[] }[] };
            if (Array.isArray(data.results)) results = data.results;
        }
    } catch { /* retain the inventory and surface unavailable advisory results below */ }
    const byIdentity = new Map<string, { advisoryState: RepositoryDependency["advisoryState"]; advisories: NonNullable<RepositoryDependency["advisories"]> }>();
    bounded.forEach((dependency, index) => {
        const result = results?.[index];
        const advisories = (result?.vulns ?? []).slice(0, 20).map((item) => ({
            id: item.id ?? "Unknown advisory", ...(item.summary ? { summary: item.summary } : {}),
            url: `https://osv.dev/vulnerability/${encodeURIComponent(item.id ?? "")}`,
            severity: advisorySeverity(item.database_specific?.severity),
            ...(() => { const fixedVersion = item.affected?.flatMap((affected) => affected.ranges ?? []).flatMap((range) => range.events ?? []).find((event) => event.fixed)?.fixed; return fixedVersion ? { fixedVersion } : {}; })(),
        }));
        byIdentity.set(`${dependency.ecosystem}:${dependency.name}:${dependency.version}`, {
            advisoryState: result ? "checked" : "unavailable", advisories,
        });
    });
    return dependencies.map((dependency) => {
        const result = byIdentity.get(`${dependency.ecosystem}:${dependency.name}:${dependency.version}`);
        return result ? { ...dependency, advisoryState: result.advisoryState, advisories: result.advisories } : dependency;
    });
}
