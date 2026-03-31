import { useState } from "react";
import smarteoIconPath from "@assets/SmartEO-Icon_1773606395230.png";
import {
  Settings, LogOut, Shield, User, BookOpen, Layers,
  LayoutTemplate, Users, CalendarClock, Palette,
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
import { Link, useLocation } from "wouter";
import { useAuth } from "@/contexts/auth-context";

// ─── Sidebar nav link ─────────────────────────────────────────────────────────

function NavLink({
  href,
  icon: Icon,
  label,
  testId,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  testId?: string;
}) {
  const [location] = useLocation();
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const active = location === href || (href !== "/" && location.startsWith(href));

  if (collapsed) {
    return (
      <Link href={href}>
        <button
          className={`p-1.5 rounded hover:bg-muted transition-colors w-full flex justify-center ${active ? "text-foreground bg-muted" : "text-muted-foreground"}`}
          title={label}
          data-testid={testId ? `${testId}-collapsed` : undefined}
        >
          <Icon className="w-4 h-4" />
        </button>
      </Link>
    );
  }

  return (
    <Link href={href}>
      <div
        className={`flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-muted transition-colors cursor-pointer ${active ? "bg-muted text-foreground font-medium" : "text-foreground"}`}
        data-testid={testId}
      >
        <Icon className={`w-3.5 h-3.5 shrink-0 ${active ? "text-foreground" : "text-muted-foreground"}`} />
        <span className="text-xs">{label}</span>
      </div>
    </Link>
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

function SidebarDivider() {
  return <div className="mx-3 my-1 h-px bg-border" />;
}

// ─── User profile block ───────────────────────────────────────────────────────

function UserProfileBlock() {
  const { user, logout, isAdmin } = useAuth();
  const { state } = useSidebar();
  const collapsed = state === "collapsed";

  if (!user) return null;

  if (collapsed) {
    return (
      <div className="flex justify-center py-1">
        <button
          onClick={() => logout()}
          title={user.fullName}
          className="flex items-center justify-center w-8 h-8 rounded-lg bg-muted hover:bg-muted/80 transition-colors"
          data-testid="button-user-avatar-collapsed"
        >
          <User className="w-4 h-4 text-muted-foreground" />
        </button>
      </div>
    );
  }

  return (
    <div className="px-2 py-2">
      <div className="flex items-start gap-2.5">
        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-muted shrink-0 mt-0.5">
          <User className="w-4 h-4 text-muted-foreground" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground truncate leading-tight" data-testid="text-user-name">
            {user.fullName}
          </p>
          <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">{user.email}</p>
          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
            <span
              className={`inline-flex px-1.5 py-0.5 rounded text-[9px] font-semibold tracking-wide uppercase border ${
                isAdmin()
                  ? "bg-[#1B3A6B]/10 text-[#1B3A6B] border-[#1B3A6B]/20 dark:text-blue-300 dark:border-blue-800"
                  : "bg-muted text-muted-foreground border-border"
              }`}
              data-testid="badge-user-role"
            >
              {isAdmin() ? "Admin" : "User"}
            </span>
          </div>
        </div>
        <button
          onClick={() => logout()}
          className="p-1 rounded hover:bg-muted transition-colors shrink-0 mt-0.5"
          title="Sign out"
          data-testid="button-logout"
        >
          <LogOut className="w-3.5 h-3.5 text-muted-foreground" />
        </button>
      </div>
    </div>
  );
}

// ─── App sidebar ─────────────────────────────────────────────────────────────

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { user, isAdmin } = useAuth();

  if (!user) return null;

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="p-3 pb-2">
        <Link
          href="/command-center"
          className="flex items-center gap-2 group-data-[collapsible=icon]:justify-center"
          data-testid="link-sidebar-logo"
        >
          <img src={smarteoIconPath} alt="SmartEO" className="w-8 h-8 aspect-square rounded-md shrink-0 object-cover" />
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

        <SidebarSectionLabel label="Account" />
        <UserProfileBlock />

        {isAdmin() && (
          <>
            <SidebarDivider />
            <SidebarSectionLabel label="Admin" />
            <div className={collapsed ? "flex flex-col items-center gap-1 py-1" : "px-1 py-1 space-y-0.5"}>
              <NavLink href="/admin/users" icon={Users} label="User Management" testId="link-admin-users" />
              <NavLink href="/admin/schedules" icon={CalendarClock} label="Scheduled Reports" testId="link-admin-schedules" />
              <NavLink href="/admin" icon={Layers} label="Governance" testId="link-admin-governance" />
              <NavLink href="/admin/guidance" icon={BookOpen} label="Guidance Library" testId="link-admin-guidance" />
              <NavLink href="/design-system" icon={Palette} label="Design System" testId="link-design-system" />
              <NavLink href="/admin/templates" icon={LayoutTemplate} label="Template Controls" testId="link-admin-templates" />
              <NavLink href="/clients" icon={Shield} label="Manage Clients" testId="link-admin-clients" />
              <NavLink href="/integrations" icon={Settings} label="Integrations" testId="link-admin-integrations" />
            </div>
          </>
        )}
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
