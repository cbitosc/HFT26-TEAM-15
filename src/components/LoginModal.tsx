"use client";

import { X, ShieldAlert } from "lucide-react";
import { AuthProviderButtons } from "@/components/AuthProviderButtons";

interface LoginModalProps {
    isOpen: boolean;
    onClose: () => void;
    title?: string;
    description?: string;
    callbackUrl?: string;
}

export function LoginModal({
    isOpen,
    onClose,
    title = "Authentication Required",
    description = "Please sign in with Google to access Premium features like Thinking Mode and Deep Security Scans.",
    callbackUrl,
}: LoginModalProps) {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div className="bg-zinc-900 border border-white/10 rounded-2xl w-full max-w-md overflow-hidden flex flex-col relative shadow-2xl">
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 p-2 text-zinc-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors z-10"
                >
                    <X className="w-5 h-5" />
                </button>
                <div className="p-6">
                    <div className="w-12 h-12 rounded-xl bg-purple-500/10 flex items-center justify-center mb-6 border border-purple-500/20">
                        <ShieldAlert className="w-6 h-6 text-purple-400" />
                    </div>

                    <h2 className="text-xl font-bold text-white mb-2 pr-8">
                        {title}
                    </h2>
                    <p className="text-zinc-400 text-sm mb-8 leading-relaxed">
                        {description}
                    </p>

                    <div className="flex justify-center">
                        <AuthProviderButtons callbackUrl={callbackUrl} />
                    </div>
                </div>
            </div>
        </div>
    );
}
