import { useState, type FormEvent } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, KeyRound } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useCurrentUser } from "@/hooks/useAuth";
import type { SafeUser, UserRole } from "@shared/schema";

const USERS_KEY = ["/api/admin/users"] as const;

async function fetchUsers(): Promise<SafeUser[]> {
  const res = await fetch("/api/admin/users", { credentials: "include" });
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
  return res.json();
}

interface NewUserForm {
  email: string;
  name: string;
  role: UserRole;
  title: string;
  password: string;
}

const EMPTY_FORM: NewUserForm = {
  email: "",
  name: "",
  role: "user",
  title: "",
  password: "",
};

export default function AdminUsersPage() {
  const queryClient = useQueryClient();
  const { user: me } = useCurrentUser();
  const usersQuery = useQuery<SafeUser[]>({ queryKey: USERS_KEY, queryFn: fetchUsers });

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<NewUserForm>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: async (input: NewUserForm) => {
      const res = await apiRequest("POST", "/api/admin/users", {
        email: input.email,
        name: input.name,
        role: input.role,
        title: input.title || null,
        password: input.password,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: USERS_KEY });
      setForm(EMPTY_FORM);
      setShowForm(false);
      setFormError(null);
    },
    onError: (err: Error) => {
      setFormError(err.message.replace(/^\d+:\s*/, ""));
    },
  });

  const roleMutation = useMutation({
    mutationFn: async ({ id, role }: { id: number; role: UserRole }) => {
      const res = await apiRequest("PATCH", `/api/admin/users/${id}`, { role });
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: USERS_KEY }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/admin/users/${id}`);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: USERS_KEY }),
  });

  const resetPasswordMutation = useMutation({
    mutationFn: async ({ id, password }: { id: number; password: string }) => {
      await apiRequest("PATCH", `/api/admin/users/${id}`, { password });
    },
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!form.email || !form.name || form.password.length < 8) {
      setFormError("Email, name, and an 8+ character password are required.");
      return;
    }
    createMutation.mutate(form);
  }

  async function handleResetPassword(u: SafeUser) {
    const next = window.prompt(`New password for ${u.email} (min 8 characters):`);
    if (!next) return;
    if (next.length < 8) {
      window.alert("Password must be at least 8 characters.");
      return;
    }
    try {
      await resetPasswordMutation.mutateAsync({ id: u.id, password: next });
      window.alert("Password updated.");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to update password.";
      window.alert(msg);
    }
  }

  async function handleDelete(u: SafeUser) {
    if (!window.confirm(`Delete ${u.email}? This cannot be undone.`)) return;
    deleteMutation.mutate(u.id);
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex shrink-0 items-center justify-between border-b px-6 py-4">
        <div>
          <h1 className="text-base font-semibold">Team users</h1>
          <p className="text-xs text-muted-foreground">
            Manage who can sign in to SmartEO. Admins can manage other users; regular users can run reports and edit content.
          </p>
        </div>
        <button
          onClick={() => {
            setShowForm((s) => !s);
            setFormError(null);
          }}
          className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
          data-testid="button-add-user-toggle"
        >
          <Plus className="h-3 w-3" />
          {showForm ? "Cancel" : "Add user"}
        </button>
      </div>

      <div className="flex-1 overflow-auto p-6">
        {showForm && (
          <form
            onSubmit={handleSubmit}
            className="mb-6 grid grid-cols-1 gap-3 rounded-md border bg-card p-4 sm:grid-cols-2"
          >
            <div>
              <label className="text-[11px] font-medium">Email</label>
              <input
                type="email"
                required
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="mt-1 w-full rounded border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                data-testid="input-new-user-email"
              />
            </div>
            <div>
              <label className="text-[11px] font-medium">Name</label>
              <input
                type="text"
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="mt-1 w-full rounded border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                data-testid="input-new-user-name"
              />
            </div>
            <div>
              <label className="text-[11px] font-medium">Role</label>
              <select
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value as UserRole })}
                className="mt-1 w-full rounded border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                data-testid="select-new-user-role"
              >
                <option value="user">User</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <div>
              <label className="text-[11px] font-medium">Title (optional)</label>
              <input
                type="text"
                placeholder="e.g. Account Manager, Director of SEO"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                className="mt-1 w-full rounded border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                data-testid="input-new-user-title"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="text-[11px] font-medium">Initial password (min 8 chars)</label>
              <input
                type="text"
                required
                minLength={8}
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                className="mt-1 w-full rounded border bg-background px-2 py-1.5 font-mono text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                data-testid="input-new-user-password"
              />
              <p className="mt-1 text-[10px] text-muted-foreground">
                Share this password with the user out-of-band. They can change it later.
              </p>
            </div>
            {formError && (
              <p className="text-xs text-red-600 sm:col-span-2" data-testid="text-new-user-error">
                {formError}
              </p>
            )}
            <div className="sm:col-span-2">
              <button
                type="submit"
                disabled={createMutation.isPending}
                className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
                data-testid="button-new-user-submit"
              >
                {createMutation.isPending ? "Creating…" : "Create user"}
              </button>
            </div>
          </form>
        )}

        {usersQuery.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {usersQuery.isError && (
          <p className="text-sm text-red-600">Failed to load users: {(usersQuery.error as Error)?.message}</p>
        )}

        {usersQuery.data && (
          <div className="overflow-hidden rounded-md border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Email</th>
                  <th className="px-3 py-2 text-left font-medium">Name</th>
                  <th className="px-3 py-2 text-left font-medium">Title</th>
                  <th className="px-3 py-2 text-left font-medium">Role</th>
                  <th className="px-3 py-2 text-left font-medium">Last login</th>
                  <th className="px-3 py-2 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {usersQuery.data.map((u) => {
                  const isMe = me?.id === u.id;
                  return (
                    <tr key={u.id} className="border-t" data-testid={`row-user-${u.id}`}>
                      <td className="px-3 py-2">{u.email}</td>
                      <td className="px-3 py-2">{u.name}</td>
                      <td className="px-3 py-2 text-muted-foreground">{u.title ?? "—"}</td>
                      <td className="px-3 py-2">
                        <select
                          value={u.role}
                          disabled={isMe || roleMutation.isPending}
                          onChange={(e) => roleMutation.mutate({ id: u.id, role: e.target.value as UserRole })}
                          className="rounded border bg-background px-1.5 py-0.5 text-xs disabled:opacity-60"
                          data-testid={`select-user-role-${u.id}`}
                        >
                          <option value="user">User</option>
                          <option value="admin">Admin</option>
                        </select>
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">
                        {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString() : "Never"}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => handleResetPassword(u)}
                            className="rounded p-1.5 hover:bg-muted"
                            title="Reset password"
                            data-testid={`button-reset-password-${u.id}`}
                          >
                            <KeyRound className="h-3.5 w-3.5 text-muted-foreground" />
                          </button>
                          <button
                            onClick={() => handleDelete(u)}
                            disabled={isMe}
                            className="rounded p-1.5 hover:bg-muted disabled:opacity-30"
                            title={isMe ? "You can't delete yourself" : "Delete user"}
                            data-testid={`button-delete-user-${u.id}`}
                          >
                            <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
