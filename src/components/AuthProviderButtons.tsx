"use client";

import { signIn, getProviders } from "next-auth/react";
import { Globe } from "lucide-react";
import { useEffect, useState } from "react";

type ProviderId = "google";

export function AuthProviderButtons({ callbackUrl }: { callbackUrl?: string }) {
    const [providers, setProviders] = useState<ProviderId[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let active = true;
        getProviders()
            .then((configured) => {
                if (active) setProviders(Object.keys(configured ?? {}).filter((id): id is ProviderId => id === "google"));
            })
            .catch(() => { if (active) setProviders([]); })
            .finally(() => { if (active) setLoading(false); });
        return () => { active = false; };
    }, []);

    if (loading) return <span role="status" className="inline-block h-10 w-28 animate-pulse rounded-full border border-white/5 bg-zinc-900" />;
    if (providers.length === 0) return <span role="status" className="rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">Configure Google OAuth to sign in</span>;

    return <div className="flex flex-wrap items-center gap-2">
        {providers.map((provider) => <button
            key={provider}
            type="button"
            onClick={() => void signIn(provider, callbackUrl ? { callbackUrl } : undefined)}
            className="flex items-center gap-2 rounded-full border border-zinc-700/70 bg-zinc-900/80 px-3 py-2 text-xs font-medium text-white shadow-lg backdrop-blur-md transition-colors hover:border-blue-400/60 hover:bg-zinc-800"
        >
            <Globe aria-hidden="true" className="h-4 w-4 text-blue-300" />
            <span>Continue with Google</span>
        </button>)}
    </div>;
}
