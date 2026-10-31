export interface RepoAnalysisInput {
    owner: string;
    repo: string;
    branch?: string;
}

export type RepoAnalysisInputResult = { ok: true; value: RepoAnalysisInput } | { ok: false; error: string };

export function validateRepoAnalysisInput(input: unknown): RepoAnalysisInputResult {
    if (!input || typeof input !== "object" || Array.isArray(input)) return { ok: false, error: "Request body must be a JSON object." };
    const value = input as Record<string, unknown>;
    if (typeof value.owner !== "string" || typeof value.repo !== "string") return { ok: false, error: "GitHub owner and repository are required." };
    const owner = value.owner.trim().toLowerCase();
    const repo = value.repo.trim().toLowerCase().replace(/\.git$/i, "");
    if (!/^[a-z0-9._-]{1,100}$/.test(owner) || owner.startsWith(".") || owner.endsWith(".")) return { ok: false, error: "Invalid GitHub owner." };
    if (!/^[a-z0-9._-]{1,100}$/.test(repo) || repo.startsWith(".") || repo.endsWith(".")) return { ok: false, error: "Invalid GitHub repository name." };
    const branch = typeof value.branch === "string" ? value.branch.trim() : undefined;
    if (branch && (branch.length > 200 || /[\u0000-\u001f]/.test(branch))) return { ok: false, error: "Invalid branch name." };
    if (value.forceRefresh !== undefined && typeof value.forceRefresh !== "boolean") return { ok: false, error: "forceRefresh must be a boolean." };
    return { ok: true, value: { owner, repo, ...(branch ? { branch } : {}) } };
}
