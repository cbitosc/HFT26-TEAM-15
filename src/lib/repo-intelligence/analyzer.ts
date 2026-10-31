import { parse } from "@babel/parser";
import type { File as BabelFile, Node } from "@babel/types";
import type {
    ArchitectureLayer,
    ImplementedFeature,
    IntelligenceEvidence,
    IntelligenceFile,
    SourceFileInput,
    SourceCall,
    SourceImport,
    SourceRoute,
    SourceSymbol,
    TechnologyFinding,
} from "./types";

const SOURCE_EXTENSIONS: Record<string, string> = {
    ts: "TypeScript", tsx: "TypeScript", js: "JavaScript", jsx: "JavaScript", mjs: "JavaScript", cjs: "JavaScript",
    py: "Python", go: "Go", rs: "Rust", java: "Java", rb: "Ruby", php: "PHP", cs: "C#", kt: "Kotlin", swift: "Swift",
    c: "C", h: "C", cc: "C++", cpp: "C++", hpp: "C++", vue: "Vue", svelte: "Svelte",
};

const CONFIG_NAMES = /(^|\/)(next\.config\.|vite\.config\.|webpack\.config\.|tsconfig\.json$|jsconfig\.json$|\.eslintrc|eslint\.config\.|postcss\.config\.|tailwind\.config\.|Dockerfile$|docker-compose\.|\.github\/workflows\/)/i;
const DOC_EXTENSIONS = new Set(["md", "mdx", "rst", "txt"]);
const MANIFEST_NAMES = new Set(["package.json", "package-lock.json", "requirements.txt", "pyproject.toml", "cargo.toml", "go.mod", "pom.xml", "build.gradle", "build.gradle.kts", "gemfile", "composer.json"]);
function extension(path: string): string {
    const file = path.split("/").at(-1) ?? path;
    const dot = file.lastIndexOf(".");
    return dot > 0 ? file.slice(dot + 1).toLowerCase() : "";
}

function fileName(path: string): string {
    return path.split("/").at(-1)?.toLowerCase() ?? path.toLowerCase();
}

function fileCategory(path: string): IntelligenceFile["category"] | null {
    const name = fileName(path);
    const ext = extension(path);
    if (MANIFEST_NAMES.has(name)) return "manifest";
    if (DOC_EXTENSIONS.has(ext)) return "documentation";
    if (CONFIG_NAMES.test(path) || [".gitignore", ".editorconfig", ".env.example", ".nvmrc"].includes(name)) return "configuration";
    if (SOURCE_EXTENSIONS[ext]) return "source";
    return null;
}

function architectureLayer(path: string): ArchitectureLayer {
    const normalized = path.toLowerCase().replace(/\\/g, "/");
    if (/(^|\/)(__tests__|tests?|spec)\//.test(normalized) || /\.(test|spec)\.[^.]+$/.test(normalized)) return "tests";
    if (/(^|\/)app\/api\//.test(normalized) || /(^|\/)pages\/api\//.test(normalized)) return "api";
    if (/(^|\/)(components|ui|views)\//.test(normalized)) return "presentation";
    if (/(^|\/)(services|service)\//.test(normalized)) return "services";
    if (/(^|\/)(prisma|migrations|database|db|repositories)\//.test(normalized)) return "data";
    if (/(^|\/)(config|configs)\//.test(normalized) || MANIFEST_NAMES.has(fileName(path))) return "configuration";
    if (/(^|\/)(scripts|infra|infrastructure|deploy)\//.test(normalized)) return "infrastructure";
    if (/(^|\/)(app|pages|routes)\//.test(normalized)) return "application";
    if (/(^|\/)(lib|domain|core)\//.test(normalized)) return "domain";
    return "other";
}

export function getIntelligenceFileCategory(path: string): IntelligenceFile["category"] | null {
    return fileCategory(path);
}

function lineOf(node: Node): number | undefined {
    return node.loc?.start.line;
}

function appRouteForPath(path: string): SourceRoute[] {
    const normalized = path.replace(/\\/g, "/");
    const routeIndex = normalized.indexOf("src/app/");
    const appRelative = routeIndex >= 0 ? normalized.slice(routeIndex + "src/app/".length) : normalized.startsWith("app/") ? normalized.slice(4) : null;
    if (appRelative === null) return [];

    if (/(^|\/)route\.(ts|tsx|js|jsx)$/.test(appRelative)) {
        const routePath = appRelative.replace(/(^|\/)route\.(ts|tsx|js|jsx)$/, "").split("/")
            .filter((segment) => !/^\(.+\)$/.test(segment))
            .map((segment) => segment.startsWith("[") && segment.endsWith("]") ? `:${segment.slice(1, -1)}` : segment)
            .filter(Boolean).join("/");
        return [{ path: `/${routePath}`, kind: "route-handler", methods: [], line: 1 }];
    }

    const match = appRelative.match(/(^|\/)(page|layout)\.(tsx?|jsx?)$/);
    if (!match) return [];
    const routePath = appRelative.replace(/(^|\/)(page|layout)\.(tsx?|jsx?)$/, "").split("/")
        .filter((segment) => !/^\(.+\)$/.test(segment))
        .map((segment) => segment.startsWith("[") && segment.endsWith("]") ? `:${segment.slice(1, -1)}` : segment)
        .filter(Boolean).join("/");
    return [{ path: `/${routePath}`, kind: match[2] === "page" ? "page" : "layout", methods: [], line: 1 }];
}

function isEntryPoint(path: string, routes: SourceRoute[]): boolean {
    const normalized = path.replace(/\\/g, "/").toLowerCase();
    const base = fileName(path);
    return routes.some((route) => route.kind !== "layout") || /(^|\/)(index|main|app|server)\.(ts|tsx|js|jsx|py|go|rs)$/.test(normalized) ||
        ["main.py", "manage.py", "wsgi.py", "asgi.py"].includes(base);
}

function importedPackageKind(source: string): SourceImport["kind"] {
    if (source.startsWith("./") || source.startsWith("../")) return "relative";
    if (source.startsWith("@/")) return "internal";
    if (source.startsWith("node:") || source.startsWith("#")) return "external";
    return "external";
}

function memberName(node: Node): string | undefined {
    if (node.type === "Identifier") return node.name;
    if (node.type === "StringLiteral" || node.type === "NumericLiteral") return String(node.value);
    return undefined;
}

function callTarget(node: Node, className: string): string | undefined {
    if (node.type === "Identifier") return node.name;
    if (node.type !== "MemberExpression") return undefined;
    const property = memberName(node.property as Node);
    if (!property) return undefined;
    if (node.object.type === "ThisExpression" && className) return `${className}.${property}`;
    if (node.object.type === "Identifier") return `${node.object.name}.${property}`;
    const constructedExpression = node.object.type === "NewExpression" ? node.object :
        node.object.type === "CallExpression" && node.object.callee.type === "NewExpression" ? node.object.callee : null;
    if (constructedExpression) {
        const constructed = callTarget(constructedExpression.callee as Node, className);
        if (constructed) return `${constructed}.${property}`;
    }
    return property;
}

function classElementName(node: Node): string | undefined {
    if ((node.type === "ClassMethod" || node.type === "ClassPrivateMethod" || node.type === "ObjectMethod") && "key" in node) {
        return memberName(node.key as Node);
    }
    return undefined;
}

function collectJsTs(content: string, path: string): {
    imports: SourceImport[];
    symbols: SourceSymbol[];
    calls: SourceCall[];
    methods: Set<string>;
    warnings: string[];
} {
    const imports: SourceImport[] = [];
    const symbols: SourceSymbol[] = [];
    const calls: SourceCall[] = [];
    const methods = new Set<string>();
    const warnings: string[] = [];
    let ast: BabelFile;

    try {
        ast = parse(content, {
            sourceType: "unambiguous",
            sourceFilename: path,
            plugins: ["typescript", "jsx", "decorators-legacy", "classProperties", "dynamicImport", "importAttributes"],
        });
    } catch (error) {
        return { imports, symbols, calls, methods, warnings: [error instanceof Error ? error.message : "Unable to parse source file"] };
    }

    const explicitlyExported = new Set<string>();
    const walk = (node: Node, parent: Node | null, exportContext: boolean, currentCallable = "", currentClass = "") => {
        const nodeExported = parent?.type === "ExportNamedDeclaration" || parent?.type === "ExportDefaultDeclaration" ||
            node.type === "VariableDeclarator" && parent?.type === "VariableDeclaration" && exportContext;
        const className = node.type === "ClassDeclaration" || node.type === "ClassExpression" ? node.id?.name ?? currentClass : currentClass;
        let callable = currentCallable;
        if (node.type === "FunctionDeclaration" && node.id?.name) callable = node.id.name;
        else if (node.type === "ClassMethod" || node.type === "ClassPrivateMethod" || node.type === "ObjectMethod") {
            const elementName = classElementName(node);
            if (elementName) callable = node.type === "ObjectMethod" || !className ? elementName : `${className}.${elementName}`;
        } else if (node.type === "VariableDeclarator" && node.id.type === "Identifier" && node.init &&
            (node.init.type === "ArrowFunctionExpression" || node.init.type === "FunctionExpression")) {
            callable = className ? `${className}.${node.id.name}` : node.id.name;
        }

        if (node.type === "CallExpression" || node.type === "NewExpression") {
            const target = callTarget(node.callee as Node, className);
            if (target) calls.push({ ...(callable ? { caller: callable } : {}), target, line: lineOf(node) ?? 1, kind: node.type === "NewExpression" ? "construct" : "call" });
        }
        if (node.type === "ExportNamedDeclaration") {
            for (const specifier of node.specifiers) if (specifier.type === "ExportSpecifier" && specifier.local.type === "Identifier") explicitlyExported.add(specifier.local.name);
        }
        if (node.type === "ImportDeclaration" && typeof node.source.value === "string") {
            const bindings = node.specifiers.map((specifier) => ({
                local: specifier.local.name,
                imported: specifier.type === "ImportSpecifier" ? memberName(specifier.imported as Node) ?? "default" : specifier.type === "ImportNamespaceSpecifier" ? "*" : "default",
            }));
            imports.push({ source: node.source.value, line: lineOf(node) ?? 1, kind: importedPackageKind(node.source.value), ...(bindings.length ? { bindings } : {}) });
        }
        if (node.type === "ExportNamedDeclaration" && node.source && typeof node.source.value === "string") {
            imports.push({ source: node.source.value, line: lineOf(node) ?? 1, kind: importedPackageKind(node.source.value) });
        }
        if (node.type === "CallExpression" && node.callee.type === "Identifier" && node.callee.name === "require" && node.arguments[0]?.type === "StringLiteral") {
            const source = node.arguments[0].value;
            imports.push({ source, line: lineOf(node) ?? 1, kind: importedPackageKind(source) });
        }
        if (node.type === "ImportExpression" && node.source.type === "StringLiteral") {
            const source = node.source.value;
            imports.push({ source, line: lineOf(node) ?? 1, kind: importedPackageKind(source) });
        }

        const addSymbol = (name: string | undefined, kind: SourceSymbol["kind"]) => {
            if (!name) return;
            symbols.push({ name, kind, line: lineOf(node) ?? 1, exported: nodeExported });
            if (/^(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)$/.test(name)) methods.add(name);
        };

        if (node.type === "FunctionDeclaration") addSymbol(node.id?.name, "function");
        else if (node.type === "ClassDeclaration") addSymbol(node.id?.name, "class");
        else if (node.type === "ClassMethod" || node.type === "ClassPrivateMethod" || node.type === "ObjectMethod") {
            const elementName = classElementName(node);
            if (elementName) addSymbol(className ? `${className}.${elementName}` : elementName, "function");
        }
        else if (node.type === "TSTypeAliasDeclaration") addSymbol(node.id.name, "type");
        else if (node.type === "TSInterfaceDeclaration") addSymbol(node.id.name, "interface");
        else if (node.type === "VariableDeclarator" && node.id.type === "Identifier") {
            addSymbol(node.id.name, node.init?.type === "ArrowFunctionExpression" || node.init?.type === "FunctionExpression" ? "function" : "variable");
        }

        for (const [key, value] of Object.entries(node)) {
            if (key === "loc" || key === "start" || key === "end" || key === "leadingComments" || key === "trailingComments" || key === "innerComments") continue;
            if (Array.isArray(value)) {
                for (const child of value) {
                    if (child && typeof child === "object" && "type" in child) walk(child as Node, node, node.type === "ExportNamedDeclaration" || node.type === "ExportDefaultDeclaration" || node.type === "VariableDeclaration" && exportContext, callable, className);
                }
            } else if (value && typeof value === "object" && "type" in value) {
                walk(value as Node, node, node.type === "ExportNamedDeclaration" || node.type === "ExportDefaultDeclaration" || node.type === "VariableDeclaration" && exportContext, callable, className);
            }
        }
    };

    walk(ast.program, null, false);
    for (const symbol of symbols) if (explicitlyExported.has(symbol.name)) symbol.exported = true;
    return { imports, symbols, calls, methods, warnings };
}

function collectGenericImports(content: string, language: string): SourceImport[] {
    const imports: SourceImport[] = [];
    const lines = content.split(/\r?\n/);
    lines.forEach((text, index) => {
        let source: string | undefined;
        if (language === "Python") {
            source = text.match(/^\s*(?:from\s+([\w.]+)\s+import|import\s+([\w.]+))/)?.slice(1).find(Boolean);
        } else if (language === "Go") {
            source = text.match(/^\s*"([^"]+)"\s*$/)?.[1] ?? text.match(/^\s*import\s+"([^"]+)"/)?.[1];
        } else if (language === "Rust") {
            source = text.match(/^\s*use\s+([\w:]+)/)?.[1];
        } else if (language === "Java" || language === "Kotlin") {
            source = text.match(/^\s*import\s+([\w.]+)/)?.[1];
        }
        if (!source) return;
        imports.push({ source, line: index + 1, kind: source.startsWith(".") ? "relative" : "external" });
    });
    return imports;
}

function makeEvidence(path: string, line: number | undefined, kind: IntelligenceEvidence["kind"], description: string, strength: IntelligenceEvidence["strength"] = "high"): IntelligenceEvidence {
    return { path, startLine: line, endLine: line, kind, description, strength, observed: true };
}

function routeMethodsFromSymbols(symbols: SourceSymbol[]): string[] {
    return symbols.filter((symbol) => symbol.kind === "route-handler" || /^(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)$/.test(symbol.name))
        .map((symbol) => symbol.name).filter((value, index, array) => array.indexOf(value) === index);
}

function analyzeSourceFile(file: SourceFileInput): IntelligenceFile | null {
    const category = fileCategory(file.path);
    if (!category) return null;
    const ext = extension(file.path);
    const language = SOURCE_EXTENSIONS[ext] ?? (category === "manifest" ? "Manifest" : category === "documentation" ? "Documentation" : "Configuration");
    const imports: SourceImport[] = [];
    const symbols: SourceSymbol[] = [];
    const calls: SourceCall[] = [];
    const warnings: string[] = [];
    const routes = appRouteForPath(file.path);

    if (category === "source" && ["ts", "tsx", "js", "jsx", "mjs", "cjs"].includes(ext)) {
        const extracted = collectJsTs(file.content, file.path);
        imports.push(...extracted.imports);
        symbols.push(...extracted.symbols);
        calls.push(...extracted.calls);
        warnings.push(...extracted.warnings);
        if (routes.some((route) => route.kind === "route-handler")) {
            for (const symbol of symbols) {
                if (symbol.exported && /^(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)$/.test(symbol.name)) symbol.kind = "route-handler";
            }
            routes[0].methods = routeMethodsFromSymbols(symbols);
            routes[0].line = symbols.find((symbol) => symbol.kind === "route-handler")?.line ?? routes[0].line;
        } else if (routes.some((route) => route.kind === "page")) {
            routes[0].line = symbols.find((symbol) => symbol.exported)?.line ?? routes[0].line;
        }
    } else if (category === "source") {
        imports.push(...collectGenericImports(file.content, language));
        const classScopes: { name: string; indent: number }[] = [];
        const functionScopes: { name: string; indent: number }[] = [];
        file.content.split(/\r?\n/).forEach((line, index) => {
            if (/^\s*(?:#|\/\/|\*)/.test(line)) return;
            const indent = line.match(/^\s*/)?.[0].length ?? 0;
            while (classScopes.length && indent <= classScopes.at(-1)!.indent) classScopes.pop();
            while (functionScopes.length && indent <= functionScopes.at(-1)!.indent) functionScopes.pop();
            const classMatch = line.match(/^(\s*)class\s+([A-Za-z_$][\w$]*)/);
            if (classMatch) {
                classScopes.push({ name: classMatch[2], indent });
                symbols.push({ name: classMatch[2], kind: "class", line: index + 1, exported: /^\s*(?:export|pub)/.test(line) });
                return;
            }
            const functionMatch = line.match(/^(\s*)(?:(?:(?:public|private|protected|internal|static|final|abstract|synchronized|override|open|suspend|virtual|async|pub)\s+)*(?:(?:async\s+)?def|(?:pub\s+)?fn|func|fun|function))\s+([A-Za-z_$][\w$]*)/);
            const typedMethodMatch = !functionMatch && /^(?:Java|Kotlin|C#|C|C\+\+|PHP)$/.test(language)
                ? line.match(/^\s*(?:(?:public|private|protected|internal|static|final|abstract|synchronized|override|open|suspend|virtual|async|extern|inline|pub|unsafe|const)\s+)*(?:[A-Za-z_$][\w$<>,.?\[\]&:]*\s+)+([A-Za-z_$][\w$]*)\s*\([^;]*\)\s*(?:\{|$)/)
                : null;
            const functionName = functionMatch?.[2] ?? typedMethodMatch?.[1];
            const typedMethodIsControlFlow = typedMethodMatch && /^(?:return|throw|new|if|for|while|switch|catch|assert|yield|super|this)\b/.test(line.trimStart());
            if (functionName && !typedMethodIsControlFlow) {
                const name = classScopes.length ? `${classScopes.at(-1)!.name}.${functionName}` : functionName;
                symbols.push({ name, kind: "function", line: index + 1, exported: /^\s*(?:export|pub)/.test(line) });
                functionScopes.push({ name, indent });
                return;
            }
            const caller = functionScopes.at(-1)?.name;
            const searchable = line.replace(/(["']).*?\1/g, "").replace(/#.*$|\/\/.*$/, "");
            for (const match of searchable.matchAll(/\b([A-Za-z_$][\w$]*)\s*\(/g)) {
                if (["if", "for", "while", "switch", "catch", "with", "def", "fn", "func", "function"].includes(match[1])) continue;
                calls.push({ ...(caller ? { caller } : {}), target: match[1], line: index + 1, kind: "call" });
            }
        });
    }

    const filePath = file.path.replace(/\\/g, "/");
    return {
        path: filePath,
        blobSha: file.sha,
        size: file.size,
        lineCount: file.content.length === 0 ? 0 : file.content.split(/\r?\n/).length,
        language,
        layer: architectureLayer(filePath),
        category,
        analysisState: warnings.length > 0 ? "parse-warning" : "analyzed",
        entryPoint: isEntryPoint(filePath, routes),
        imports,
        symbols,
        calls,
        routes,
        ...(warnings.length > 0 ? { warning: warnings.slice(0, 3).join("; ") } : {}),
    };
}

function technologiesFromFiles(files: SourceFileInput[], analyzed: IntelligenceFile[]): TechnologyFinding[] {
    const byName = new Map<string, TechnologyFinding>();
    const ecosystems: Record<string, string> = { TypeScript: "npm", JavaScript: "npm", Python: "PyPI", Go: "Go", Rust: "crates.io", Java: "Maven", Kotlin: "Maven", Ruby: "RubyGems", PHP: "Packagist" };
    const nodeBuiltins = new Set(["assert", "buffer", "child_process", "crypto", "events", "fs", "http", "https", "module", "os", "path", "process", "querystring", "stream", "timers", "tls", "url", "util", "vm", "worker_threads", "zlib"]);
    const pythonBuiltins = new Set(["argparse", "asyncio", "collections", "datetime", "functools", "itertools", "json", "logging", "math", "os", "pathlib", "re", "socket", "subprocess", "sys", "threading", "typing"]);
    const add = (name: string, ecosystem: string, evidence: IntelligenceEvidence) => {
        const key = name.toLowerCase();
        const item = byName.get(key) ?? { name, ecosystem, evidence: [] };
        if (!item.evidence.some((entry) => entry.path === evidence.path && entry.startLine === evidence.startLine)) item.evidence.push(evidence);
        byName.set(key, item);
    };

    for (const file of analyzed) {
        for (const imported of file.imports) {
            if (imported.kind !== "external") continue;
            const pkg = imported.source.startsWith("@") ? imported.source.split("/").slice(0, 2).join("/") : imported.source.split("/")[0];
            const builtin = (file.language === "JavaScript" || file.language === "TypeScript") && nodeBuiltins.has(pkg)
                || file.language === "Python" && pythonBuiltins.has(pkg)
                || file.language === "Rust" && /^(std|core|alloc)::/.test(imported.source)
                || (file.language === "Java" || file.language === "Kotlin") && /^(java|javax|kotlin)\./.test(imported.source);
            if (pkg && !pkg.startsWith("node:") && !builtin) {
                add(pkg, ecosystems[file.language] ?? file.language, makeEvidence(file.path, imported.line, "import", `Imported package “${pkg}” in source code.`));
            }
        }
    }

    for (const source of files) {
        if (fileName(source.path) !== "package.json") continue;
        try {
            const manifest = JSON.parse(source.content) as { dependencies?: Record<string, unknown>; devDependencies?: Record<string, unknown> };
            for (const name of [...Object.keys(manifest.dependencies ?? {}), ...Object.keys(manifest.devDependencies ?? {})]) {
                if (byName.has(name.toLowerCase())) continue;
                add(name, "npm", makeEvidence(source.path, undefined, "manifest", `Declared in package.json; source usage was not found in the inspected files.`, "medium"));
            }
        } catch {
            // The file-level parser warning reports malformed JSON; no dependency facts are inferred.
        }
    }

    return Array.from(byName.values()).sort((a, b) => a.name.localeCompare(b.name));
}

function featuresFromFiles(files: IntelligenceFile[]): ImplementedFeature[] {
    const features: ImplementedFeature[] = [];
    for (const file of files) {
        for (const route of file.routes) {
            if (route.kind === "layout") continue;
            const kind = route.kind === "page" ? "Page" : "API route";
            const methods = route.methods.length > 0 ? ` (${route.methods.join(", ")})` : "";
            features.push({
                title: `${kind}: ${route.path}${methods}`,
                description: "Observed application entry point. This confirms a route file exists; it does not claim every user-facing behavior is complete.",
                confidence: "high",
                evidence: [makeEvidence(file.path, route.line, "route", `${kind} file maps to ${route.path}.`)],
            });
        }
        if (/\/actions\.(ts|tsx|js|jsx)$/.test(file.path)) {
            for (const symbol of file.symbols.filter((item) => item.exported && item.kind === "function")) {
                features.push({
                    title: `Server action: ${symbol.name}`,
                    description: "Exported function in the app server-actions module; implementation behavior should be inspected before relying on it.",
                    confidence: "medium",
                    evidence: [makeEvidence(file.path, symbol.line, "symbol", `Exported server action ${symbol.name}.`, "medium")],
                });
            }
        }
    }
    return features;
}

export function analyzeSourceFiles(inputs: SourceFileInput[]): {
    files: IntelligenceFile[];
    technologies: TechnologyFinding[];
    features: ImplementedFeature[];
} {
    const files = inputs.map(analyzeSourceFile).filter((file): file is IntelligenceFile => file !== null);
    return {
        files,
        technologies: technologiesFromFiles(inputs, files),
        features: featuresFromFiles(files).slice(0, 500),
    };
}
