import { afterEach, describe, expect, it, vi } from "vitest";
import { createGitHubClient } from "@/lib/github";

afterEach(() => {
    vi.clearAllTimers();
    vi.unstubAllGlobals();
    vi.useRealTimers();
});

describe("createGitHubClient request handling", () => {
    it("rejects an exhausted primary rate limit promptly without retrying", async () => {
        vi.useFakeTimers();
        const resetAt = Math.floor(Date.now() / 1000) + 60;
        const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(
            JSON.stringify({ message: "API rate limit exceeded" }),
            {
                status: 403,
                headers: {
                    "content-type": "application/json",
                    "x-ratelimit-limit": "60",
                    "x-ratelimit-remaining": "0",
                    "x-ratelimit-reset": String(resetAt),
                },
            },
        ));
        vi.stubGlobal("fetch", fetchMock);

        const request = createGitHubClient("test-token").rest.repos.get({ owner: "octocat", repo: "Hello-World" });
        const outcome = await Promise.race([
            request.then(() => "resolved", (error: unknown) => ({ error })),
            vi.advanceTimersByTimeAsync(100).then(() => "timed-out"),
        ]);

        expect(outcome).not.toBe("timed-out");
        expect(outcome).not.toBe("resolved");
        expect(fetchMock).toHaveBeenCalledOnce();
        if (typeof outcome !== "object" || outcome === null || !("error" in outcome)) {
            throw new Error("Expected the rate-limited request to reject.");
        }
        expect(outcome.error).toMatchObject({ status: 403 });
    });

    it("enforces its timeout when the request already has an abort signal", async () => {
        const callerController = new AbortController();
        let fetchSignal: AbortSignal | null | undefined;
        let abortObservedByFetch = false;
        let resolveFetchAbort: (() => void) | undefined;
        const fetchAbortObserved = new Promise<void>((resolve) => { resolveFetchAbort = resolve; });
        const fetchMock = vi.fn<typeof fetch>((_input, init) => new Promise<Response>((_resolve, reject) => {
            fetchSignal = init?.signal;
            const signal = init?.signal;
            if (!signal) {
                reject(new Error("Expected the request to carry an abort signal."));
                return;
            }
            const rejectOnAbort = () => {
                abortObservedByFetch = true;
                resolveFetchAbort?.();
                reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
            };
            if (signal.aborted) rejectOnAbort();
            else signal.addEventListener("abort", rejectOnAbort, { once: true });
        }));
        vi.stubGlobal("fetch", fetchMock);

        const request = createGitHubClient("test-token", 25).rest.repos.get({
            owner: "octocat",
            repo: "Hello-World",
            request: { signal: callerController.signal },
        });
        const outcome = await Promise.race([
            Promise.all([
                fetchAbortObserved.then(() => "aborted" as const),
                request.then(() => "resolved" as const, () => "rejected" as const),
            ]).then(([fetch, request]) => ({ fetch, request })),
            new Promise<"timed-out">((resolve) => setTimeout(() => resolve("timed-out"), 500)),
        ]);

        expect(fetchMock).toHaveBeenCalledOnce();
        expect(fetchSignal?.aborted).toBe(true);
        expect(abortObservedByFetch).toBe(true);
        expect(callerController.signal.aborted).toBe(false);
        expect(outcome).toEqual({ fetch: "aborted", request: "rejected" });
        callerController.abort();
    });
});
