import { describe, expect, it } from "vitest";
import { validateRepoAnalysisInput } from "./validation";

describe("validateRepoAnalysisInput", () => {
    it("normalizes GitHub identifiers and accepts an optional branch", () => {
        expect(validateRepoAnalysisInput({ owner: "  OctoCat ", repo: "Hello-World.git", branch: "release/v2" })).toEqual({
            ok: true, value: { owner: "octocat", repo: "hello-world", branch: "release/v2" },
        });
    });

    it.each([
        null, [], { owner: "a/b", repo: "repo" }, { owner: "owner", repo: ".." },
        { owner: "owner", repo: "repo", branch: `main\nbranch` }, { owner: "owner", repo: "repo", forceRefresh: "yes" },
    ])("rejects malformed analysis input: %j", (input) => {
        expect(validateRepoAnalysisInput(input).ok).toBe(false);
    });
});
