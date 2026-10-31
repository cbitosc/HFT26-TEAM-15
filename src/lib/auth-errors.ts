const AUTH_ERROR_MESSAGES: Record<string, string> = {
    Configuration: "OAuth sign-in is not configured correctly. Check the provider Client ID, Client Secret, and callback URL in your app settings.",
    OAuthSignin: "RepoMind could not start sign-in. Check that the selected provider's Client ID and Client Secret are valid.",
    OAuthCallback: "The provider could not complete sign-in. Check its callback URL and try again.",
    OAuthCallbackError: "The provider could not complete sign-in. Check its callback URL and try again.",
    OAuthCreateAccount: "RepoMind could not create your account with the OAuth provider. Try again, or contact the site administrator.",
    OAuthAccountNotLinked: "This email is already linked to another account. Sign in with the provider you used originally.",
    AccessDenied: "The sign-in request was denied. Try again and approve the requested access.",
    Callback: "The sign-in response could not be verified. Check your browser cookies and try again.",
    Signin: "Sign-in failed. Check the OAuth app configuration and try again.",
    SessionRequired: "Sign in to continue.",
};

export function getAuthErrorMessage(code: string | null | undefined): string | null {
    if (!code) return null;
    return AUTH_ERROR_MESSAGES[code] ?? "Sign-in failed. Please try again.";
}
