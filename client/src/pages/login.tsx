import { useState, type FormEvent } from "react";
import { useLocation } from "wouter";
import { Zap } from "lucide-react";
import { useCurrentUser, useLogin } from "@/hooks/useAuth";

function getRedirectTarget(): string {
  if (typeof window === "undefined") return "/";
  const params = new URLSearchParams(window.location.search);
  const redirect = params.get("redirect");
  // Only allow same-origin paths to prevent open-redirect.
  if (redirect && redirect.startsWith("/") && !redirect.startsWith("//")) {
    return redirect;
  }
  return "/";
}

export default function LoginPage() {
  const [, setLocation] = useLocation();
  const { user, isLoading } = useCurrentUser();
  const login = useLogin();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Already logged in? Bounce to the redirect target.
  if (!isLoading && user) {
    setLocation(getRedirectTarget());
    return null;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await login.mutateAsync({ email: email.trim(), password });
      setLocation(getRedirectTarget());
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Login failed";
      // apiRequest throws "401: <body>" on bad creds — surface a friendlier message.
      if (/^401/.test(msg)) {
        setError("Invalid email or password.");
      } else {
        setError(msg);
      }
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-md bg-primary">
            <Zap className="h-6 w-6 text-primary-foreground" />
          </div>
          <h1 className="text-xl font-semibold tracking-tight">SmartEO</h1>
          <p className="text-xs text-muted-foreground">by Webserv</p>
        </div>

        <div className="rounded-lg border bg-card p-6 shadow-sm">
          <h2 className="text-sm font-semibold">Sign in</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Enter your team email and password to continue.
          </p>

          <form onSubmit={handleSubmit} className="mt-5 space-y-4">
            <div>
              <label htmlFor="email" className="text-xs font-medium">
                Email
              </label>
              <input
                id="email"
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                data-testid="input-login-email"
              />
            </div>

            <div>
              <label htmlFor="password" className="text-xs font-medium">
                Password
              </label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                data-testid="input-login-password"
              />
            </div>

            {error && (
              <p className="text-xs text-red-600 dark:text-red-400" data-testid="text-login-error">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={login.isPending}
              className="w-full rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
              data-testid="button-login-submit"
            >
              {login.isPending ? "Signing in…" : "Sign in"}
            </button>
          </form>
        </div>

        <p className="mt-4 text-center text-[11px] text-muted-foreground">
          Trouble signing in? Ask an admin to reset your password.
        </p>
      </div>
    </div>
  );
}
