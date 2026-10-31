export const REPO_INTELLIGENCE_VERSION = "1.4.0";

export type EvidenceStrength = "high" | "medium" | "low";
export type EvidenceKind = "import" | "route" | "symbol" | "manifest" | "entry-point" | "configuration";

export interface IntelligenceEvidence {
    path: string;
    startLine?: number;
    endLine?: number;
    kind: EvidenceKind;
    description: string;
    strength: EvidenceStrength;
    observed: true;
}

export interface SourceImport {
    source: string;
    line: number;
    kind: "internal" | "external" | "relative" | "unresolved";
    resolvedPath?: string;
    bindings?: { local: string; imported: string }[];
}

export interface SourceSymbol {
    name: string;
    kind: "function" | "class" | "variable" | "type" | "interface" | "route-handler";
    line: number;
    exported: boolean;
}

export interface SourceCall {
    caller?: string;
    target: string;
    line: number;
    kind: "call" | "construct";
}

export interface SourceRoute {
    path: string;
    kind: "page" | "layout" | "route-handler";
    methods: string[];
    line?: number;
}

export type ArchitectureLayer = "application" | "api" | "presentation" | "services" | "domain" | "data" | "configuration" | "tests" | "infrastructure" | "other";

export interface IntelligenceFile {
    path: string;
    blobSha: string;
    size: number;
    lineCount: number;
    language: string;
    layer: ArchitectureLayer;
    category: "source" | "configuration" | "manifest" | "documentation";
    analysisState: "analyzed" | "parse-warning";
    entryPoint: boolean;
    imports: SourceImport[];
    symbols: SourceSymbol[];
    calls: SourceCall[];
    routes: SourceRoute[];
    warning?: string;
}

export interface TechnologyFinding {
    name: string;
    ecosystem: string;
    evidence: IntelligenceEvidence[];
}

export interface RepositoryDependency {
    name: string;
    version: string;
    ecosystem: "npm" | "PyPI" | "Go" | "crates.io" | "Maven" | "Gradle" | "RubyGems" | "Packagist" | "unknown";
    direct: boolean;
    development: boolean;
    evidence: IntelligenceEvidence[];
    advisories?: { id: string; summary?: string; url: string; severity: "critical" | "high" | "medium" | "low" | "unknown"; fixedVersion?: string }[];
    advisoryState: "checked" | "unavailable" | "not-checked";
}

export interface ImplementedFeature {
    title: string;
    description: string;
    confidence: EvidenceStrength;
    evidence: IntelligenceEvidence[];
}

export interface FileSkip {
    path: string;
    reason: string;
}

export interface AnalysisCoverage {
    status: "complete" | "partial";
    totalDiscoveredFiles: number;
    inspectedFiles: number;
    skippedFiles: number;
    skipReasons: Record<string, number>;
    skippedFileExamples: FileSkip[];
    treeTruncated: boolean;
    durationMs: number;
    limits: {
        maxFiles: number;
        maxFileBytes: number;
        maxTotalBytes: number;
        maxDurationMs: number;
    };
}

export interface RepositoryIntelligence {
    id?: string;
    owner: string;
    repo: string;
    branch: string;
    commitSha: string;
    analyzerVersion: string;
    startedAt: string;
    completedAt: string;
    coverage: AnalysisCoverage;
    files: IntelligenceFile[];
    technologies: TechnologyFinding[];
    dependencies: RepositoryDependency[];
    dependencyCoverage: {
        reported: number;
        truncated: boolean;
        advisoryChecked: number;
        advisoryUnavailable: number;
        advisoryNotChecked: number;
        advisoryLimit: number;
    };
    features: ImplementedFeature[];
}

export interface SourceFileInput {
    path: string;
    sha: string;
    size: number;
    content: string;
}
