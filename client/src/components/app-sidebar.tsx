import { useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Zap, ExternalLink, Settings, LogOut, Shield, User, ChevronDown, Check,
  BookOpen, Layers, LayoutTemplate, Users,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarFooter,
  SidebarRail,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { ThemeToggle } from "@/components/theme-toggle";
import { ALL_ROLES, type UserRole } from "@/lib/reportFamilyUtils";
import { loadProfile, saveProfile, type UserProfile } from "@/lib/userProfile";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Link } from "wouter";
import { useCurrentUser, useIsAdmin, useLogout } from "@/hooks/useAuth";

// ─── Role badge color ─────────────────────────────────────────────────────────

function roleBadgeStyle(role: UserRole): string {
  const map: Record<UserRole, string> = {
    "Account Manager": "bg-blue-500/10 text-blue-600 dark:text-blue-400",
    "ADR": "bg-violet-500/10 text-violet-600 dark:text-violet-400",
    "Director of SEO": "bg-[#1B3A6B]/10 text-[#1B3A6B] dark:text-blue-300",
    "Owner": "bg-[#C0392B]/10 text-[#C0392B] dark:text-red-400",
  };
  return map[role] ?? "bg-muted text-muted-foreground";
}

// ─── Client URL helper ────────────────────────────────────────────────────────

function clientWebsiteUrl(gscSiteUrl: string | null | undefined): string | null {
  if (!gscSiteUrl) return null;
  if (gscSiteUrl.startsWith("sc-domain:")) {
    return "https://" + gscSiteUrl.replace("sc-domain:", "");
  }
  return gscSiteUrl;
}

// ─── User profile area ────────────────────────────────────────────────────────

interface UserProfileBlockProps {
  profile: UserProfile;
  onUpdate: (p: UserProfile) => void;
}

function UserProfileBlock({ profile, onUpdate }: UserProfileBlockProps) {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";

  if (collapsed) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className="flex items-center justify-center w-8 h-8 rounded-lg bg-muted hover:bg-muted/80 transition-colors mx-auto"
            title={profile.name}
            data-testid="button-user-profile-collapsed"
          >
            <User className="w-4 h-4 text-muted-foreground" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="right" align="start" className="w-48">
          <div className="px-2 py-1.5">
            <p className="text-xs font-semibold text-foreground truncate">{profile.name}</p>
            <p className="text-[10px] text-muted-foreground">{profile.role}</p>
          </div>
          <DropdownMenuSeparator />
          {ALL_ROLES.map(role => (
            <DropdownMenuItem
              key={role}
              className="text-xs gap-2"
              onClick={() => onUpdate({ ...profile, role })}
            >
              {role === profile.role && <Check className="w-3 h-3 shrink-0" />}
              <span className={role === profile.role ? "ml-0" : "ml-5"}>{role}</span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  return (
    <div className="px-2 py-2">
      <div className="flex items-center gap-2.5">
        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-muted shrink-0">
          <User className="w-4 h-4 text-muted-foreground" />
        </div>
        <div className="flex-1 min-w-0">
          <EditableText
            value={profile.name}
            onChange={name => onUpdate({ ...profile, name })}
            className="text-sm font-semibold text-foreground truncate block leading-tight"
            data-testid="text-user-name"
          />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className={`flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded mt-0.5 ${roleBadgeStyle(profile.role)}`}
                data-testid="button-user-role"
              >
                {profile.role}
                <ChevronDown className="w-2.5 h-2.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-48">
              {ALL_ROLES.map(role => (
                <DropdownMenuItem
                  key={role}
                  className="text-xs gap-2"
                  onClick={() => onUpdate({ ...profile, role })}
                >
                  {role === profile.role && <Check className="w-3 h-3 shrink-0" />}
                  <span className={role === profile.role ? "ml-0" : "ml-5"}>{role}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  );
}

// ─── Editable text (click to edit) ───────────────────────────────────────────

function EditableText({
  value,
  onChange,
  className,
  "data-testid": testId,
}: {
  value: string;
  onChange: (v: string) => void;
  className?: string;
  "data-testid"?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  if (editing) {
    return (
      <input
        autoFocus
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={() => { onChange(draft); setEditing(false); }}
        onKeyDown={e => { if (e.key === "Enter") { onChange(draft); setEditing(false); } if (e.key === "Escape") setEditing(false); }}
        className="text-sm font-semibold text-foreground bg-transparent border-b border-border outline-none w-full leading-tight"
        data-testid="input-user-name"
      />
    );
  }

  return (
    <span
      className={`${className} cursor-text hover:underline underline-offset-2 decoration-dotted`}
      onClick={() => { setDraft(value); setEditing(true); }}
      title="Click to edit"
      data-testid={testId}
    >
      {value}
    </span>
  );
}

// ─── Client list ──────────────────────────────────────────────────────────────

interface Client {
  id: number;
  name: string;
  gscSiteUrl?: string | null;
}

function ClientList() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";

  const { data: clients = [] } = useQuery<Client[]>({
    queryKey: ["/api/clients"],
  });

  if (collapsed) return null;

  if (clients.length === 0) {
    return (
      <div className="px-2 py-2">
        <p className="text-[10px] text-muted-foreground">No clients configured.</p>
      </div>
    );
  }

  return (
    <ScrollArea className="max-h-52">
      <div className="flex flex-col gap-0.5 px-1 py-1">
        {clients.map(client => {
          const url = clientWebsiteUrl(client.gscSiteUrl);
          return url ? (
            <a
              key={client.id}
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-md hover:bg-muted transition-colors group"
              data-testid={`link-client-${client.id}`}
            >
              <span className="text-xs text-foreground truncate">{client.name}</span>
              <ExternalLink className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
            </a>
          ) : (
            <div
              key={client.id}
              className="flex items-center px-2 py-1.5"
              data-testid={`item-client-${client.id}`}
            >
              <span className="text-xs text-muted-foreground truncate">{client.name}</span>
            </div>
          );
        })}
      </div>
    </ScrollArea>
  );
}

// ─── Sidebar section label ────────────────────────────────────────────────────

function SidebarSectionLabel({ label }: { label: string }) {
  const { state } = useSidebar();
  if (state === "collapsed") return null;
  return (
    <p className="px-3 pt-3 pb-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">
      {label}
    </p>
  );
}

// ─── Divider ─────────────────────────────────────────────────────────────────

function SidebarDivider() {
  return <div className="mx-3 my-1 h-px bg-border" />;
}

// ─── App sidebar ─────────────────────────────────────────────────────────────

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";

  const { user: authUser } = useCurrentUser();
  const isAdmin = useIsAdmin();
  const logoutMutation = useLogout();

  const [profile, setProfile] = useState<UserProfile>(loadProfile);

  const handleProfileUpdate = useCallback((updated: UserProfile) => {
    setProfile(updated);
    saveProfile(updated);
  }, []);

  function handleSignOut() {
    logoutMutation.mutate(undefined, {
      onSettled: () => {
        if (typeof window !== "undefined") {
          window.location.assign("/login");
        }
      },
    });
  }

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="p-3 pb-2">
        <Link
          href="/command-center"
          className="flex items-center gap-2 group-data-[collapsible=icon]:justify-center"
          data-testid="link-sidebar-logo"
        >
          <div className="flex items-center justify-center w-8 h-8 rounded-md bg-primary shrink-0">
            <Zap className="w-4 h-4 text-primary-foreground" />
          </div>
          {!collapsed && (
            <div>
              <h1 className="text-sm font-semibold tracking-tight" data-testid="text-app-name">SmartEO</h1>
              <p className="text-[10px] text-muted-foreground leading-none">by Webserv</p>
            </div>
          )}
        </Link>
      </SidebarHeader>

      <SidebarContent className="overflow-hidden">
        <SidebarDivider />

        <SidebarSectionLabel label="Profile" />
        <UserProfileBlock profile={profile} onUpdate={handleProfileUpdate} />

        <SidebarDivider />

        <SidebarSectionLabel label="My Clients" />
        <ClientList />

        {isAdmin && (
          <>
            <SidebarDivider />
            {!collapsed ? (
              <>
                <div className="px-3 pt-3 pb-1">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">Admin</p>
                </div>
                <div className="px-1 py-1">
                  <Link
                    href="/admin"
                    className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-muted transition-colors"
                    data-testid="link-admin-governance"
                  >
                    <Layers className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <span className="text-xs text-foreground">Governance</span>
                  </Link>
                  <Link
                    href="/admin/guidance"
                    className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-muted transition-colors"
                    data-testid="link-admin-guidance"
                  >
                    <BookOpen className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <span className="text-xs text-foreground">Guidance Library</span>
                  </Link>
                  <Link
                    href="/admin/templates"
                    className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-muted transition-colors"
                    data-testid="link-admin-templates"
                  >
                    <LayoutTemplate className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <span className="text-xs text-foreground">Template Controls</span>
                  </Link>
                  <Link
                    href="/admin/users"
                    className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-muted transition-colors"
                    data-testid="link-admin-users"
                  >
                    <Users className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <span className="text-xs text-foreground">Team Users</span>
                  </Link>
                  <Link
                    href="/clients"
                    className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-muted transition-colors"
                    data-testid="link-admin-clients"
                  >
                    <Shield className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <span className="text-xs text-foreground">Manage Clients</span>
                  </Link>
                  <Link
                    href="/integrations"
                    className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-muted transition-colors"
                    data-testid="link-admin-integrations"
                  >
                    <Settings className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <span className="text-xs text-foreground">Integrations</span>
                  </Link>
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center gap-1 py-1">
                <Link href="/admin" title="Governance">
                  <button className="p-1.5 rounded hover:bg-muted transition-colors" data-testid="link-admin-governance-collapsed">
                    <Layers className="w-4 h-4 text-muted-foreground" />
                  </button>
                </Link>
                <Link href="/admin/guidance" title="Guidance Library">
                  <button className="p-1.5 rounded hover:bg-muted transition-colors" data-testid="link-admin-guidance-collapsed">
                    <BookOpen className="w-4 h-4 text-muted-foreground" />
                  </button>
                </Link>
                <Link href="/admin/templates" title="Template Controls">
                  <button className="p-1.5 rounded hover:bg-muted transition-colors" data-testid="link-admin-templates-collapsed">
                    <LayoutTemplate className="w-4 h-4 text-muted-foreground" />
                  </button>
                </Link>
                <Link href="/admin/users" title="Team Users">
                  <button className="p-1.5 rounded hover:bg-muted transition-colors" data-testid="link-admin-users-collapsed">
                    <Users className="w-4 h-4 text-muted-foreground" />
                  </button>
                </Link>
                <Link href="/clients" title="Manage Clients">
                  <button className="p-1.5 rounded hover:bg-muted transition-colors" data-testid="link-admin-clients-collapsed">
                    <Shield className="w-4 h-4 text-muted-foreground" />
                  </button>
                </Link>
              </div>
            )}
          </>
        )}

        <SidebarDivider />

        {!collapsed && authUser && (
          <div className="px-3 py-2">
            <p className="truncate text-[11px] font-medium text-foreground" data-testid="text-current-user">
              {authUser.name}
            </p>
            <p className="truncate text-[10px] text-muted-foreground">
              {authUser.email}
            </p>
          </div>
        )}
        <button
          onClick={handleSignOut}
          disabled={logoutMutation.isPending}
          className="mx-1 flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-muted transition-colors text-left disabled:opacity-50 group-data-[collapsible=icon]:justify-center"
          data-testid="button-sign-out"
          title="Sign out"
        >
          <LogOut className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          {!collapsed && (
            <span className="text-xs text-muted-foreground">
              {logoutMutation.isPending ? "Signing out…" : "Sign out"}
            </span>
          )}
        </button>
      </SidebarContent>

      <SidebarFooter className="p-2">
        <div className="flex items-center justify-between gap-1 group-data-[collapsible=icon]:flex-col group-data-[collapsible=icon]:justify-center">
          {!collapsed && (
            <div className="text-[10px] text-muted-foreground">SmartEO v2.0</div>
          )}
          <div className="flex items-center gap-1 group-data-[collapsible=icon]:flex-col">
            <ThemeToggle />
            <SidebarTrigger data-testid="button-sidebar-toggle" />
          </div>
        </div>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}
