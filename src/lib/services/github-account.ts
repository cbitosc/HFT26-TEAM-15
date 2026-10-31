import { prisma } from "@/lib/db";

/** Read a user's GitHub credential only on the server. Never attach it to a session or client response. */
export async function getGitHubAccessTokenForUser(userId: string): Promise<string | null> {
    const account = await prisma.account.findFirst({
        where: { userId, provider: "github" },
        select: { access_token: true },
    });
    return account?.access_token ?? null;
}
