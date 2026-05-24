import { useState } from "react";
import { useAuth } from "@/contexts/auth-context";
import smarteoIconPath from "@assets/SmartEO-Icon_1773606395230.png";
import { apiRequest } from "@/lib/queryClient";

export default function ChangePasswordPage() {
  const { user } = useAuth();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (newPassword !== confirmPassword) {
      setError("New passwords do not match.");
      return;
    }
    if (newPassword.length < 8) {
      setError("New password must be at least 8 characters.");
      return;
    }

    setLoading(true);
    try {
      await apiRequest("POST", "/api/auth/change-password", { currentPassword, newPassword });
      // Hard reload to /command-center. This avoids a race where wouter's
      // navigate() fires before the auth context's refresh() has updated
      // requiresPasswordChange — which previously bounced the user right
      // back to /change-password and made it look like nothing happened.
      window.location.assign("/command-center");
    } catch (err: any) {
      const msg = err.message ?? "";
      // apiRequest throws `${status}: ${text}` where text is usually a JSON body
      // like '{"message":"Current password is incorrect."}'. Extract a clean message.
      const jsonMatch = msg.match(/^\d+:\s*(.*)$/);
      let clean = jsonMatch ? jsonMatch[1] : msg;
      try {
        const parsed = JSON.parse(clean);
        if (parsed?.message) clean = parsed.message;
      } catch {
        // Not JSON — leave clean as-is
      }
      setError(clean || "Failed to change password.");
      setLoading(false);
    }
  }

  const isFirstLogin = user?.accountState === "first_login_required";
  const isReset = user?.accountState === "password_reset_required";

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-8">
        <div className="text-center space-y-2">
          <div className="flex justify-center">
            <img src={smarteoIconPath} alt="SmartEO" className="w-14 h-14 rounded-xl object-cover" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            {isFirstLogin ? "Create your password" : "Set a new password"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {isFirstLogin
              ? "Your account requires a new password before you can continue."
              : isReset
              ? "Your password has been reset. Please choose a new password."
              : "Change your current password."}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <label htmlFor="currentPassword" className="text-sm font-medium text-foreground">
              {isFirstLogin ? "Temporary password" : "Current password"}
            </label>
            <input
              id="currentPassword"
              type="password"
              value={currentPassword}
              onChange={e => setCurrentPassword(e.target.value)}
              placeholder="••••••••"
              required
              autoComplete="current-password"
              data-testid="input-current-password"
              className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/50 focus:border-ring transition-colors"
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="newPassword" className="text-sm font-medium text-foreground">
              New password
            </label>
            <input
              id="newPassword"
              type="password"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              placeholder="At least 8 characters"
              required
              minLength={8}
              autoComplete="new-password"
              data-testid="input-new-password"
              className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/50 focus:border-ring transition-colors"
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="confirmPassword" className="text-sm font-medium text-foreground">
              Confirm new password
            </label>
            <input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              placeholder="••••••••"
              required
              autoComplete="new-password"
              data-testid="input-confirm-password"
              className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/50 focus:border-ring transition-colors"
            />
          </div>

          {error && (
            <div
              className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
              data-testid="text-change-password-error"
            >
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            data-testid="button-change-password"
            className="w-full rounded-lg bg-[#C0392B] hover:bg-[#C0392B]/90 text-white font-medium py-2.5 text-sm transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loading ? "Updating…" : "Set new password"}
          </button>
        </form>
      </div>
    </div>
  );
}
