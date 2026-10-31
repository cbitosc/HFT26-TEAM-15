const AUTH_ERROR_MESSAGES: Record<string, string> = {
    Configuration: "GitHub sign-in is not configured correctly. Check the OAuth Client ID, Client Secret, and callback URL in your app settings.",
    OAuthSignin: "RepoMind could not start GitHub sign-in. Check that the OAuth Client ID and Client Secret are valid.",
    OAuthCallback: "GitHub could not complete sign-in. Check the OAuth app callback URL and try again.",
    OAuthCallbackError: "GitHub could not complete sign-in. Check the OAuth app callback URL and try again.",
    OAuthCreateAccount: "RepoMind could not create your account from GitHub. Try again, or contact the site administrator.",
    OAuthAccountNotLinked: "This email is already linked to another account. Sign in with the provider you used originally.",
    AccessDenied: "GitHub sign-in was denied. Try again and approve the requested access.",
    Callback: "The sign-in response could not be verified. Check your browser cookies and try again.",
    Signin: "GitHub sign-in failed. Check the OAuth app configuration and try again.",
    SessionRequired: "Sign in to continue.",
};

export function getAuthErrorMessage(code: string | null | undefined): string | null {
    if (!code) return null;
    return AUTH_ERROR_MESSAGES[code] ?? "GitHub sign-in failed. Please try again.";
}
