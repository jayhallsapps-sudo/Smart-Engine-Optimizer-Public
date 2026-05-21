import { Switch, Route, useLocation, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { ThemeProvider } from "@/components/theme-provider";
import { AuthProvider, useAuth } from "@/contexts/auth-context";
import { ReportAccessDenied } from "@/components/reports/ReportAccessDenied";
import type { ReportSubKey } from "@shared/schema";
import NotFound from "@/pages/not-found";
import LoginPage from "@/pages/login";
import ClientsPage from "@/pages/clients";
import SetupPage from "@/pages/setup";
import QbrPrepPage from "@/pages/qbr-prep";
import QbrPrepPrintPage from "@/pages/qbr-prep-print";
import BiweeklyPage from "@/pages/biweekly";
import BiweeklyPrintPage from "@/pages/biweekly-print";
import BiweeklyPdfPage from "@/pages/biweekly-pdf";
import MonthlyPage from "@/pages/monthly";
import MonthlyPrintPage from "@/pages/monthly-print";
import QbrFullPage from "@/pages/qbr-full";
import MidStrategyPage from "@/pages/mid-strategy";
import MidStrategyPrintPage from "@/pages/mid-strategy-print";
import EvalSheetsPage from "@/pages/eval-sheets";
import MidStrategyDeckPage from "@/pages/mid-strategy-deck";
import DashboardPage from "@/pages/dashboard";
import SampleReportsPage from "@/pages/sample-reports";
import TemplateBuilderPage from "@/pages/template-builder";
import SecurityPage from "@/pages/security";
import CommandCenterPage from "@/pages/command-center";
import PrepareReportPage from "@/pages/prepare-report";
import WorkflowPage from "@/pages/workflow";
import AdminPage from "@/pages/admin";
import AdminConfigPage from "@/pages/admin-config";
import AdminGuidancePage from "@/pages/admin-guidance";
import AdminTemplatesPage from "@/pages/admin-templates";
import AdminUsersPage from "@/pages/admin-users";
import AdminSchedulesPage from "@/pages/admin-schedules";
import AcaPage from "@/pages/aca";
import SavedReportsPage from "@/pages/saved-reports";
import DiscoverabilityPage from "@/pages/discoverability";
import QuarterlyContentRoadmapPage from "@/pages/quarterly-content-roadmap";
import TemplatesPage from "@/pages/templates";
import TemplateEditorPage from "@/pages/template-editor";
import ThemePage from "@/pages/theme";
import DesignSystemPage from "@/pages/design-system";
import ChangePasswordPage from "@/pages/change-password";

const PRINT_ROUTES = ["/biweekly/print", "/monthly/print", "/biweekly/pdf-render", "/qbr-prep-print", "/mid-strategy/pdf-render"];
const PUBLIC_ROUTES = ["/login", "/change-password"];

// Wrap a report page in a sub-key access check. Renders ReportAccessDenied if the
// signed-in user lacks the matching reportSubKey, otherwise renders the page.
// Admins always pass (handled inside useAuth().hasReportSubKey).
function withReportSubKey(
  Component: React.ComponentType<any>,
  subKey: ReportSubKey,
  label: string,
): React.ComponentType<any> {
  const Gated = (props: any) => {
    const { hasReportSubKey } = useAuth();
    if (!hasReportSubKey(subKey)) {
      return <ReportAccessDenied reportLabel={label} />;
    }
    return <Component {...props} />;
  };
  Gated.displayName = `Gated(${Component.displayName ?? Component.name ?? "Report"})`;
  return Gated;
}

// Wrap a page so only admins can render it. Non-admins get ReportAccessDenied.
// Used for beta / WIP modules that aren't part of MVP 1 (AMA, Discoverability,
// Templates, Theme, Eval Sheets, Mid-Strategy Deck, QCR, Sample Reports, etc.).
function withAdminOnly(
  Component: React.ComponentType<any>,
  label: string,
): React.ComponentType<any> {
  const Gated = (props: any) => {
    const { isAdmin } = useAuth();
    if (!isAdmin()) {
      return <ReportAccessDenied reportLabel={label} />;
    }
    return <Component {...props} />;
  };
  Gated.displayName = `AdminOnly(${Component.displayName ?? Component.name ?? "Page"})`;
  return Gated;
}

const GatedBiweeklyPage = withReportSubKey(BiweeklyPage, "biweekly", "Bi-Weekly Report");
const GatedMonthlyPage = withReportSubKey(MonthlyPage, "monthly", "Monthly Report");
const GatedQbrFullPage = withReportSubKey(QbrFullPage, "qbr_full", "QBR Full Report");
const GatedQbrPrepPage = withReportSubKey(QbrPrepPage, "qbr_prep", "QBR Prep Report");
const GatedMidStrategyPage = withReportSubKey(MidStrategyPage, "mid_strategy", "Mid-Strategy Report");
const GatedQuarterlyContentRoadmapPage = withReportSubKey(
  QuarterlyContentRoadmapPage,
  "quarterly_content_roadmap",
  "Quarterly Content Roadmap",
);

// Admin-only beta / WIP pages — hidden from AM sidebar, gated at route level.
const AdminOnlyAcaPage = withAdminOnly(AcaPage, "AMA Chat");
const AdminOnlyDiscoverabilityPage = withAdminOnly(DiscoverabilityPage, "Discoverability Tool");
const AdminOnlyEvalSheetsPage = withAdminOnly(EvalSheetsPage, "Evaluation Sheets");
const AdminOnlyMidStrategyDeckPage = withAdminOnly(MidStrategyDeckPage, "Mid-Strategy Deck");
const AdminOnlyTemplatesPage = withAdminOnly(TemplatesPage, "Templates");
const AdminOnlyTemplateEditorPage = withAdminOnly(TemplateEditorPage, "Template Editor");
const AdminOnlyTemplateBuilderPage = withAdminOnly(TemplateBuilderPage, "Template Builder");
const AdminOnlyThemePage = withAdminOnly(ThemePage, "Theme Designer");
const AdminOnlySampleReportsPage = withAdminOnly(SampleReportsPage, "Sample Reports");
const AdminOnlyDesignSystemPage = withAdminOnly(DesignSystemPage, "Design System");

function AiStatusIndicator() {
  const { data } = useQuery<{ provider: string | null; label: string }>({
    queryKey: ["/api/ai/status"],
    refetchInterval: 1500,
    staleTime: 0,
  });

  const isActive = !!data?.provider;
  const label = data?.label ?? "None";

  return (
    <span className="flex items-center gap-1.5" data-testid="ai-status-indicator">
      <span className="text-muted-foreground/60">AI:</span>
      {isActive && (
        <span className="relative flex h-1.5 w-1.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-green-500" />
        </span>
      )}
      <span className={isActive ? "text-green-600 dark:text-green-400 font-medium" : ""}>
        {label}
      </span>
    </span>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/">{() => <Redirect to="/command-center" />}</Route>
      <Route path="/command-center" component={CommandCenterPage} />

      {/* MVP 1 — AM-visible routes */}
      <Route path="/prepare" component={PrepareReportPage} />
      <Route path="/workflow" component={WorkflowPage} />
      <Route path="/dashboard" component={DashboardPage} />
      <Route path="/saved-reports" component={SavedReportsPage} />
      <Route path="/integrations" component={SetupPage} />
      <Route path="/setup">{() => <Redirect to="/integrations" />}</Route>

      {/* Report pages — gated by reportSubKey permission */}
      <Route path="/biweekly" component={GatedBiweeklyPage} />
      <Route path="/monthly" component={GatedMonthlyPage} />
      <Route path="/qbr" component={GatedQbrFullPage} />
      <Route path="/qbr-prep" component={GatedQbrPrepPage} />
      <Route path="/mid-strategy" component={GatedMidStrategyPage} />
      <Route path="/quarterly-content-roadmap" component={GatedQuarterlyContentRoadmapPage} />

      {/* Admin routes */}
      <Route path="/admin" component={AdminPage} />
      <Route path="/admin/config" component={AdminConfigPage} />
      <Route path="/admin/guidance" component={AdminGuidancePage} />
      <Route path="/admin/templates" component={AdminTemplatesPage} />
      <Route path="/admin/users" component={AdminUsersPage} />
      <Route path="/admin/schedules" component={AdminSchedulesPage} />
      <Route path="/client-connections" component={ClientsPage} />
      <Route path="/clients">{() => <Redirect to="/client-connections" />}</Route>
      <Route path="/security" component={SecurityPage} />

      {/* Beta / WIP — admin-only at route level */}
      <Route path="/aca" component={AdminOnlyAcaPage} />
      <Route path="/discoverability" component={AdminOnlyDiscoverabilityPage} />
      <Route path="/eval-sheets" component={AdminOnlyEvalSheetsPage} />
      <Route path="/mid-strategy-deck" component={AdminOnlyMidStrategyDeckPage} />
      <Route path="/templates" component={AdminOnlyTemplatesPage} />
      <Route path="/templates/:templateId" component={AdminOnlyTemplateEditorPage} />
      <Route path="/template-builder" component={AdminOnlyTemplateBuilderPage} />
      <Route path="/theme" component={AdminOnlyThemePage} />
      <Route path="/sample-reports" component={AdminOnlySampleReportsPage} />
      <Route path="/design-system" component={AdminOnlyDesignSystemPage} />

      <Route component={NotFound} />
    </Switch>
  );
}

const sidebarStyle = {
  "--sidebar-width": "14rem",
  "--sidebar-width-icon": "3rem",
};

function AuthGate({ children }: { children: React.ReactNode }) {
  const { user, loading, requiresPasswordChange } = useAuth();
  const [location] = useLocation();

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="text-sm text-muted-foreground">Loading…</div>
      </div>
    );
  }

  if (!user && location !== "/login") {
    return <Redirect to="/login" />;
  }

  if (user && requiresPasswordChange && location !== "/change-password") {
    return <Redirect to="/change-password" />;
  }

  return <>{children}</>;
}

function AppShell() {
  const [location] = useLocation();
  const isPrintPage = PRINT_ROUTES.some((route) => location === route || location.startsWith(route + "?"));
  const isPublicPage = PUBLIC_ROUTES.some((route) => location === route || location.startsWith(route + "?"));

  if (isPrintPage) {
    return (
      <Switch>
        <Route path="/biweekly/print" component={BiweeklyPrintPage} />
        <Route path="/biweekly/pdf-render" component={BiweeklyPdfPage} />
        <Route path="/monthly/print" component={MonthlyPrintPage} />
        <Route path="/qbr-prep-print" component={QbrPrepPrintPage} />
        <Route path="/mid-strategy/pdf-render" component={MidStrategyPrintPage} />
      </Switch>
    );
  }

  if (isPublicPage) {
    return (
      <Switch>
        <Route path="/login" component={LoginPage} />
        <Route path="/change-password" component={ChangePasswordPage} />
      </Switch>
    );
  }

  return (
    <AuthGate>
      <TooltipProvider>
        <SidebarProvider defaultOpen={false} style={sidebarStyle as React.CSSProperties}>
          <div className="flex h-screen w-full">
            <AppSidebar />
            <div className="flex flex-col flex-1 min-w-0">
              <main className="flex-1 overflow-hidden flex flex-col">
                <Router />
              </main>
              <footer className="shrink-0 border-t px-4 py-2 flex items-center justify-between text-[11px] text-muted-foreground">
                <span>
                  Designed by{" "}
                  <a
                    href="https://syncds.ca"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline underline-offset-2 hover:text-foreground transition-colors"
                  >
                    Sync Digital Solutions
                  </a>
                </span>
                <AiStatusIndicator />
              </footer>
            </div>
          </div>
        </SidebarProvider>
        <Toaster />
      </TooltipProvider>
    </AuthGate>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <AppShell />
        </AuthProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
