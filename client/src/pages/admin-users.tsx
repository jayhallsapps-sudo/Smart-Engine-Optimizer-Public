import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/auth-context";
import { useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import {
  Shield, Plus, RefreshCw, Ban, CheckCircle2, RotateCcw,
  Copy, Check, MoreHorizontal, KeyRound, Pencil, UserX, UserCheck,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MODULE_KEYS, REPORT_SUB_KEYS, type ModuleKey, type ReportSubKey } from "@shared/schema";

const MODULE_LABELS: Record<ModuleKey, string> = {
  ama: "AMA (Ask Me Anything)",
  prepare_report: "Prepare a Report",
  past_reports: "Past Reports",
  client_info: "Client Info",
  client_integrations: "Client Integrations",
  integrations: "Integrations",
  discoverability_tool: "Discoverability Tool",
  templates: "Templates",
  theme: "Theme",
};

const REPORT_SUB_LABELS: Record<ReportSubKey, string> = {
  biweekly: "Bi-Weekly",
  monthly: "Monthly",
  qbr_prep: "QBR Prep (QBS)",
  qbr_full: "QBR (Full)",
  mid_strategy: "Mid-Strategy",
  quarterly_content_roadmap: "Quarterly Content Roadmap",
};

interface UserRow {
  id: number;
  fullName: string;
  email: string;
  role: "admin" | "user";
  accountState: "active" | "suspended" | "first_login_required" | "password_reset_required";
  lastLoginAt: string | null;
  createdAt: string;
}

interface UserDetail extends UserRow {
  modules: ModuleKey[];
  reportSubKeys: ReportSubKey[];
}

const STATE_LABELS: Record<string, string> = {
  active: "Active",
  suspended: "Suspended",
  first_login_required: "Awaiting First Login",
  password_reset_required: "Password Reset Pending",
};

const STATE_COLORS: Record<string, string> = {
  active: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-800",
  suspended: "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/30 dark:text-red-400 dark:border-red-800",
  first_login_required: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800",
  password_reset_required: "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/30 dark:text-orange-400 dark:border-orange-800",
};

// ─── Copy block ───────────────────────────────────────────────────────────────

function CopyBlock({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  function handleCopy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  }
  return (
    <div className="relative mt-3">
      <pre className="text-xs bg-muted/60 rounded-lg p-4 whitespace-pre-wrap font-mono text-foreground border border-border leading-relaxed">
        {text}
      </pre>
      <button
        onClick={handleCopy}
        data-testid="button-copy-credentials"
        className="absolute top-2 right-2 flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-background border border-border text-xs font-medium hover:bg-muted transition-colors"
      >
        {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
        {copied ? "Copied!" : "Copy"}
      </button>
    </div>
  );
}

// ─── Permission selector ──────────────────────────────────────────────────────

interface PermissionSelectorProps {
  selectedModules: ModuleKey[];
  selectedReportSubKeys: ReportSubKey[];
  onModulesChange: (m: ModuleKey[]) => void;
  onReportSubKeysChange: (k: ReportSubKey[]) => void;
}

function PermissionSelector({
  selectedModules,
  selectedReportSubKeys,
  onModulesChange,
  onReportSubKeysChange,
}: PermissionSelectorProps) {
  function toggleModule(m: ModuleKey) {
    if (selectedModules.includes(m)) {
      onModulesChange(selectedModules.filter(x => x !== m));
      if (m === "prepare_report") onReportSubKeysChange([]);
    } else {
      onModulesChange([...selectedModules, m]);
    }
  }

  function toggleSubKey(k: ReportSubKey) {
    if (selectedReportSubKeys.includes(k)) {
      onReportSubKeysChange(selectedReportSubKeys.filter(x => x !== k));
    } else {
      onReportSubKeysChange([...selectedReportSubKeys, k]);
    }
  }

  const hasPrepareReport = selectedModules.includes("prepare_report");

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Module Access</p>
      <div className="grid grid-cols-1 gap-1">
        {MODULE_KEYS.map(m => (
          <div key={m}>
            <label className="flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-muted/50 cursor-pointer transition-colors">
              <input
                type="checkbox"
                checked={selectedModules.includes(m)}
                onChange={() => toggleModule(m)}
                className="rounded border-border"
                data-testid={`checkbox-module-${m}`}
              />
              <span className="text-sm text-foreground">{MODULE_LABELS[m]}</span>
            </label>
            {m === "prepare_report" && hasPrepareReport && (
              <div className="ml-8 mt-1 mb-1 space-y-1 border-l-2 border-border pl-3">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide pb-0.5">Report Types</p>
                {REPORT_SUB_KEYS.map(k => (
                  <label key={k} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-muted/50 cursor-pointer transition-colors">
                    <input
                      type="checkbox"
                      checked={selectedReportSubKeys.includes(k)}
                      onChange={() => toggleSubKey(k)}
                      className="rounded border-border"
                      data-testid={`checkbox-report-${k}`}
                    />
                    <span className="text-xs text-foreground">{REPORT_SUB_LABELS[k]}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Create user panel ────────────────────────────────────────────────────────

function CreateUserPanel({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"admin" | "user">("user");
  const [modules, setModules] = useState<ModuleKey[]>([]);
  const [reportSubKeys, setReportSubKeys] = useState<ReportSubKey[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ credentialBlock: string; tempPassword: string } | null>(null);

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/users", { fullName, email, role, modules, reportSubKeys });
      return res.json();
    },
    onSuccess: (data) => {
      setResult({ credentialBlock: data.credentialBlock, tempPassword: data.tempPassword });
      qc.invalidateQueries({ queryKey: ["/api/admin/users"] });
    },
    onError: (err: any) => {
      const msg = err.message ?? "";
      const m = msg.match(/\d+: (.*)/);
      setError(m ? JSON.parse(m[1]).message ?? m[1] : msg || "Failed to create user.");
    },
  });

  if (result) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          <h3 className="text-base font-semibold text-foreground">User created successfully</h3>
        </div>
        <p className="text-sm text-muted-foreground">
          Share the credentials below with the new user. The temporary password is stored and accessible from the Actions menu until they log in.
        </p>
        <CopyBlock text={result.credentialBlock} />
        <div className="flex gap-2 pt-2">
          <button
            onClick={() => { setResult(null); setFullName(""); setEmail(""); setRole("user"); setModules([]); setReportSubKeys([]); }}
            className="px-4 py-2 rounded-lg border border-border text-sm hover:bg-muted transition-colors"
            data-testid="button-create-another"
          >
            Create another user
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-[#1B3A6B] text-white text-sm hover:bg-[#1B3A6B]/90 transition-colors"
            data-testid="button-done-creating"
          >
            Done
          </button>
        </div>
      </div>
    );
  }

  return (
    <form
      onSubmit={e => { e.preventDefault(); setError(null); mutation.mutate(); }}
      className="space-y-5"
    >
      <h3 className="text-base font-semibold text-foreground">Create new user</h3>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <label className="text-sm font-medium text-foreground">Full name</label>
          <input
            type="text"
            value={fullName}
            onChange={e => setFullName(e.target.value)}
            required
            placeholder="Jane Smith"
            data-testid="input-user-fullname"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/50 transition-colors"
          />
        </div>
        <div className="space-y-1">
          <label className="text-sm font-medium text-foreground">Email</label>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            placeholder="jane@example.com"
            data-testid="input-user-email"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/50 transition-colors"
          />
        </div>
      </div>

      <div className="space-y-1">
        <label className="text-sm font-medium text-foreground">Role</label>
        <div className="flex gap-3">
          {(["user", "admin"] as const).map(r => (
            <label key={r} className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="role"
                value={r}
                checked={role === r}
                onChange={() => setRole(r)}
                data-testid={`radio-role-${r}`}
              />
              <span className="text-sm capitalize text-foreground">{r === "admin" ? "Admin" : "User"}</span>
            </label>
          ))}
        </div>
      </div>

      {role === "user" && (
        <PermissionSelector
          selectedModules={modules}
          selectedReportSubKeys={reportSubKeys}
          onModulesChange={setModules}
          onReportSubKeysChange={setReportSubKeys}
        />
      )}

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive" data-testid="text-create-user-error">
          {error}
        </div>
      )}

      <div className="flex gap-2 pt-1">
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-2 rounded-lg border border-border text-sm hover:bg-muted transition-colors"
          data-testid="button-cancel-create-user"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={mutation.isPending}
          data-testid="button-submit-create-user"
          className="px-4 py-2 rounded-lg bg-[#1B3A6B] text-white text-sm hover:bg-[#1B3A6B]/90 transition-colors disabled:opacity-60"
        >
          {mutation.isPending ? "Creating…" : "Create user"}
        </button>
      </div>
    </form>
  );
}

// ─── Edit user panel ──────────────────────────────────────────────────────────

function EditUserPanel({ userId, onClose }: { userId: number; onClose: () => void }) {
  const qc = useQueryClient();
  const { data: user, isLoading } = useQuery<UserDetail>({
    queryKey: ["/api/admin/users", userId],
  });

  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<"admin" | "user">("user");
  const [modules, setModules] = useState<ModuleKey[]>([]);
  const [reportSubKeys, setReportSubKeys] = useState<ReportSubKey[]>([]);
  const [initialized, setInitialized] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  if (user && !initialized) {
    setFullName(user.fullName);
    setRole(user.role);
    setModules(user.modules);
    setReportSubKeys(user.reportSubKeys);
    setInitialized(true);
  }

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PATCH", `/api/admin/users/${userId}`, { fullName, role, modules, reportSubKeys });
      return res.json();
    },
    onSuccess: () => {
      setSuccess(true);
      qc.invalidateQueries({ queryKey: ["/api/admin/users"] });
      qc.invalidateQueries({ queryKey: ["/api/admin/users", userId] });
      setTimeout(() => setSuccess(false), 2000);
    },
    onError: (err: any) => {
      const msg = err.message ?? "";
      const m = msg.match(/\d+: (.*)/);
      try { setError(m ? JSON.parse(m[1]).message : msg || "Failed to update."); } catch { setError(msg || "Failed to update."); }
    },
  });

  if (isLoading) {
    return <div className="py-6 text-center text-sm text-muted-foreground">Loading user…</div>;
  }

  return (
    <form
      onSubmit={e => { e.preventDefault(); setError(null); mutation.mutate(); }}
      className="space-y-5"
    >
      <h3 className="text-base font-semibold text-foreground">Edit user</h3>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <label className="text-sm font-medium text-foreground">Full name</label>
          <input
            type="text"
            value={fullName}
            onChange={e => setFullName(e.target.value)}
            required
            data-testid="input-edit-fullname"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/50 transition-colors"
          />
        </div>
        <div className="space-y-1">
          <label className="text-sm font-medium text-foreground">Email</label>
          <input
            type="email"
            value={user?.email ?? ""}
            disabled
            className="w-full rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm text-muted-foreground cursor-not-allowed"
          />
        </div>
      </div>

      <div className="space-y-1">
        <label className="text-sm font-medium text-foreground">Role</label>
        <div className="flex gap-3">
          {(["user", "admin"] as const).map(r => (
            <label key={r} className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="edit-role"
                value={r}
                checked={role === r}
                onChange={() => setRole(r)}
                data-testid={`radio-edit-role-${r}`}
              />
              <span className="text-sm capitalize text-foreground">{r === "admin" ? "Admin" : "User"}</span>
            </label>
          ))}
        </div>
      </div>

      {role === "user" && (
        <PermissionSelector
          selectedModules={modules}
          selectedReportSubKeys={reportSubKeys}
          onModulesChange={setModules}
          onReportSubKeysChange={setReportSubKeys}
        />
      )}

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">{error}</div>
      )}
      {success && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 dark:bg-emerald-950/30 dark:border-emerald-800 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-400">
          User updated successfully.
        </div>
      )}

      <div className="flex gap-2 pt-1">
        <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg border border-border text-sm hover:bg-muted transition-colors">
          Close
        </button>
        <button
          type="submit"
          disabled={mutation.isPending}
          data-testid="button-save-user"
          className="px-4 py-2 rounded-lg bg-[#1B3A6B] text-white text-sm hover:bg-[#1B3A6B]/90 transition-colors disabled:opacity-60"
        >
          {mutation.isPending ? "Saving…" : "Save changes"}
        </button>
      </div>
    </form>
  );
}

// ─── Reset password result panel ──────────────────────────────────────────────

function ResetPasswordResult({ credentialBlock, onClose }: { credentialBlock: string; onClose: () => void }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
        <h3 className="text-base font-semibold text-foreground">Password reset</h3>
      </div>
      <p className="text-sm text-muted-foreground">Share the new credentials with the user. Accessible again from Actions → View Login Info until they log in.</p>
      <CopyBlock text={credentialBlock} />
      <button
        onClick={onClose}
        className="px-4 py-2 rounded-lg bg-[#1B3A6B] text-white text-sm hover:bg-[#1B3A6B]/90 transition-colors"
        data-testid="button-close-reset"
      >
        Done
      </button>
    </div>
  );
}

// ─── View credentials panel ───────────────────────────────────────────────────

function ViewCredentialsPanel({ userId, onClose }: { userId: number; onClose: () => void }) {
  const { data, isLoading } = useQuery<{ available: boolean; credentialBlock: string | null }>({
    queryKey: ["/api/admin/users", userId, "credentials"],
    queryFn: async () => {
      const res = await fetch(`/api/admin/users/${userId}/credentials`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load credentials.");
      return res.json();
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <KeyRound className="w-5 h-5 text-[#1B3A6B] dark:text-blue-300 shrink-0" />
        <h3 className="text-base font-semibold text-foreground">Login Info</h3>
      </div>

      {isLoading && (
        <p className="text-sm text-muted-foreground">Loading…</p>
      )}

      {!isLoading && data?.available && data.credentialBlock && (
        <>
          <p className="text-sm text-muted-foreground">
            These credentials are available until the user completes their first login and sets a new password.
          </p>
          <CopyBlock text={data.credentialBlock} />
        </>
      )}

      {!isLoading && !data?.available && (
        <div className="rounded-lg border border-border bg-muted/30 px-4 py-6 text-center">
          <KeyRound className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
          <p className="text-sm font-medium text-foreground">Credentials no longer available</p>
          <p className="text-xs text-muted-foreground mt-1">
            This user has already set their own password. Use "Reset Password" from Actions to generate new credentials.
          </p>
        </div>
      )}

      <button
        onClick={onClose}
        className="px-4 py-2 rounded-lg border border-border text-sm hover:bg-muted transition-colors"
        data-testid="button-close-credentials"
      >
        Close
      </button>
    </div>
  );
}

// ─── Actions dropdown ─────────────────────────────────────────────────────────

type PanelState =
  | { type: "create" }
  | { type: "edit"; userId: number }
  | { type: "reset"; credentialBlock: string }
  | { type: "credentials"; userId: number }
  | null;

function ActionsMenu({
  user,
  onEdit,
  onViewCreds,
  onResetPassword,
  onSuspend,
  onReactivate,
  resetPending,
  suspendPending,
  reactivatePending,
}: {
  user: UserRow;
  onEdit: () => void;
  onViewCreds: () => void;
  onResetPassword: () => void;
  onSuspend: () => void;
  onReactivate: () => void;
  resetPending: boolean;
  suspendPending: boolean;
  reactivatePending: boolean;
}) {
  const credAvailable =
    user.accountState === "first_login_required" ||
    user.accountState === "password_reset_required";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="p-1.5 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
          title="Actions"
          data-testid={`button-actions-${user.id}`}
        >
          <MoreHorizontal className="w-4 h-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem onClick={onEdit} data-testid={`action-edit-${user.id}`}>
          <Pencil className="w-3.5 h-3.5 mr-2" />
          Edit user
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuItem
          onClick={credAvailable ? onViewCreds : undefined}
          disabled={!credAvailable}
          data-testid={`action-view-creds-${user.id}`}
          className={!credAvailable ? "opacity-40 cursor-not-allowed" : ""}
        >
          <KeyRound className="w-3.5 h-3.5 mr-2" />
          View Login Info
          {!credAvailable && (
            <span className="ml-auto text-[10px] text-muted-foreground">Used</span>
          )}
        </DropdownMenuItem>

        <DropdownMenuItem
          onClick={onResetPassword}
          disabled={resetPending}
          data-testid={`action-reset-${user.id}`}
        >
          <RefreshCw className={`w-3.5 h-3.5 mr-2 ${resetPending ? "animate-spin" : ""}`} />
          {resetPending ? "Resetting…" : "Reset Password"}
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        {user.accountState === "suspended" ? (
          <DropdownMenuItem
            onClick={onReactivate}
            disabled={reactivatePending}
            data-testid={`action-reactivate-${user.id}`}
            className="text-emerald-600 dark:text-emerald-400 focus:text-emerald-600"
          >
            <UserCheck className="w-3.5 h-3.5 mr-2" />
            {reactivatePending ? "Reactivating…" : "Reactivate"}
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem
            onClick={onSuspend}
            disabled={suspendPending}
            data-testid={`action-suspend-${user.id}`}
            className="text-destructive focus:text-destructive"
          >
            <UserX className="w-3.5 h-3.5 mr-2" />
            {suspendPending ? "Suspending…" : "Suspend"}
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AdminUsersPage() {
  const { isAdmin } = useAuth();
  const [, navigate] = useLocation();
  const qc = useQueryClient();

  const { data: userList = [], isLoading } = useQuery<UserRow[]>({
    queryKey: ["/api/admin/users"],
  });

  const [panel, setPanel] = useState<PanelState>(null);

  const suspendMutation = useMutation({
    mutationFn: (id: number) => apiRequest("POST", `/api/admin/users/${id}/suspend`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/admin/users"] }),
  });

  const reactivateMutation = useMutation({
    mutationFn: (id: number) => apiRequest("POST", `/api/admin/users/${id}/reactivate`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/admin/users"] }),
  });

  const resetPasswordMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("POST", `/api/admin/users/${id}/reset-password`);
      return res.json();
    },
    onSuccess: (data) => {
      setPanel({ type: "reset", credentialBlock: data.credentialBlock });
      qc.invalidateQueries({ queryKey: ["/api/admin/users"] });
    },
  });

  if (!isAdmin()) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        You do not have permission to access this page.
      </div>
    );
  }

  const panelOpen = panel !== null;

  const closePanel = () => setPanel(null);

  return (
    <div className="flex h-full">
      {/* ── Main table ── */}
      <div className={`flex-1 min-w-0 overflow-auto ${panelOpen ? "border-r border-border" : ""}`}>
        <div className="border-b border-border bg-background px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-widest mb-1">Admin · Users</p>
              <h1 className="text-2xl font-bold text-foreground tracking-tight">User Management</h1>
              <p className="mt-1 text-sm text-muted-foreground">Create and manage user accounts, roles, and module access.</p>
            </div>
            <button
              onClick={() => setPanel({ type: "create" })}
              data-testid="button-create-user"
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#1B3A6B] text-white text-sm font-medium hover:bg-[#1B3A6B]/90 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Create user
            </button>
          </div>
        </div>

        <div className="px-8 py-6">
          {isLoading ? (
            <div className="text-sm text-muted-foreground py-8 text-center">Loading users…</div>
          ) : (
            <div className="rounded-xl border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/30 text-muted-foreground text-xs font-semibold uppercase tracking-wide">
                  <tr>
                    <th className="px-4 py-3 text-left">Name</th>
                    <th className="px-4 py-3 text-left">Email</th>
                    <th className="px-4 py-3 text-left">Role</th>
                    <th className="px-4 py-3 text-left">Status</th>
                    <th className="px-4 py-3 text-left">Created</th>
                    <th className="px-4 py-3 text-left">Last login</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {userList.map(u => (
                    <tr key={u.id} className="bg-background hover:bg-muted/20 transition-colors" data-testid={`row-user-${u.id}`}>
                      <td className="px-4 py-3 font-medium text-foreground">{u.fullName}</td>
                      <td className="px-4 py-3 text-muted-foreground">{u.email}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium border ${u.role === "admin" ? "bg-[#1B3A6B]/10 text-[#1B3A6B] border-[#1B3A6B]/20 dark:text-blue-300 dark:border-blue-800" : "bg-muted text-muted-foreground border-border"}`}>
                          {u.role === "admin" ? "Admin" : "User"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium border ${STATE_COLORS[u.accountState]}`} data-testid={`status-user-${u.id}`}>
                          {STATE_LABELS[u.accountState]}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">
                        {new Date(u.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">
                        {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleDateString() : "Never"}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 justify-end">
                          <ActionsMenu
                            user={u}
                            onEdit={() => setPanel({ type: "edit", userId: u.id })}
                            onViewCreds={() => setPanel({ type: "credentials", userId: u.id })}
                            onResetPassword={() => resetPasswordMutation.mutate(u.id)}
                            onSuspend={() => suspendMutation.mutate(u.id)}
                            onReactivate={() => reactivateMutation.mutate(u.id)}
                            resetPending={resetPasswordMutation.isPending}
                            suspendPending={suspendMutation.isPending}
                            reactivatePending={reactivateMutation.isPending}
                          />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* ── Side panel ── */}
      {panelOpen && (
        <div className="w-[420px] shrink-0 overflow-y-auto border-l border-border bg-background p-6">
          {panel.type === "create" && <CreateUserPanel onClose={closePanel} />}
          {panel.type === "edit" && <EditUserPanel userId={panel.userId} onClose={closePanel} />}
          {panel.type === "reset" && <ResetPasswordResult credentialBlock={panel.credentialBlock} onClose={closePanel} />}
          {panel.type === "credentials" && <ViewCredentialsPanel userId={panel.userId} onClose={closePanel} />}
        </div>
      )}
    </div>
  );
}
