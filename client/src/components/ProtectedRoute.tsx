import { type ReactNode } from "react";
import { useLocation } from "wouter";
import { useCurrentUser } from "@/hooks/useAuth";

interface ProtectedRouteProps {
  children: ReactNode;
  /** If true, only admin-role users may render the children. Non-admins see a 403 message. */
  adminOnly?: boolean;
}

export function ProtectedRoute({ children, adminOnly = false }: ProtectedRouteProps) {
  const [, setLocation] = useLocation();
  const { user, isLoading } = useCurrentUser();

  if (isLoading) {
    return (
      <div className="flex h-full w-full items-center justify-center text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }

  if (!user) {
    const here =
      typeof window !== "undefined"
        ? window.location.pathname + window.location.search
        : "/";
    setLocation(`/login?redirect=${encodeURIComponent(here)}`);
    return null;
  }

  if (adminOnly && user.role !== "admin") {
    return (
      <div className="flex h-full w-full items-center justify-center p-8">
        <div className="max-w-md text-center">
          <h2 className="text-lg font-semibold">Admin access required</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            You're signed in as {user.fullName}, but this page is restricted to admins.
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
