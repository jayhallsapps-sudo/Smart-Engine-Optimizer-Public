import { Switch, Route, useLocation, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { ThemeProvider } from "@/components/theme-provider";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import NotFound from "@/pages/not-found";
import LoginPage from "@/pages/login";
import ReportsPage from "@/pages/reports";
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

function RootRedirect() {
  const [, setLocation] = useLocation();
  setLocation("/command-center");
  return null;
}

const PRINT_ROUTES = ["/biweekly/print", "/monthly/print", "/biweekly/pdf-render", "/qbr-prep-print", "/mid-strategy/pdf-render"];
const AUTH_ROUTES = ["/login"];

function adminOnly(Component: React.ComponentType) {
  return () => (
    <ProtectedRoute adminOnly>
      <Component />
    </ProtectedRoute>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={RootRedirect} />
      <Route path="/command-center" component={CommandCenterPage} />
      <Route path="/prepare" component={PrepareReportPage} />
      <Route path="/workflow" component={WorkflowPage} />
      <Route path="/dashboard" component={DashboardPage} />
      <Route path="/biweekly" component={BiweeklyPage} />
      <Route path="/monthly" component={MonthlyPage} />
      <Route path="/qbr" component={QbrFullPage} />
      <Route path="/mid-strategy" component={MidStrategyPage} />
      <Route path="/qbr-prep" component={QbrPrepPage} />
      <Route path="/reports" component={ReportsPage} />
      <Route path="/clients" component={ClientsPage} />
      <Route path="/integrations" component={SetupPage} />
      <Route path="/setup">{() => <Redirect to="/integrations" />}</Route>
      <Route path="/security" component={SecurityPage} />
      <Route path="/sample-reports" component={SampleReportsPage} />
      <Route path="/template-builder" component={TemplateBuilderPage} />
      <Route path="/admin" component={adminOnly(AdminPage)} />
      <Route path="/admin/config" component={adminOnly(AdminConfigPage)} />
      <Route path="/admin/guidance" component={adminOnly(AdminGuidancePage)} />
      <Route path="/admin/templates" component={adminOnly(AdminTemplatesPage)} />
      <Route path="/admin/users" component={adminOnly(AdminUsersPage)} />
      <Route component={NotFound} />
    </Switch>
  );
}

const sidebarStyle = {
  "--sidebar-width": "14rem",
  "--sidebar-width-icon": "3rem",
};

export default function App() {
  const [location] = useLocation();
  const isPrintPage = PRINT_ROUTES.includes(location);
  const isAuthPage = AUTH_ROUTES.includes(location);

  if (isPrintPage) {
    return (
      <QueryClientProvider client={queryClient}>
        <Switch>
          <Route path="/biweekly/print" component={BiweeklyPrintPage} />
          <Route path="/biweekly/pdf-render" component={BiweeklyPdfPage} />
          <Route path="/monthly/print" component={MonthlyPrintPage} />
          <Route path="/qbr-prep-print" component={QbrPrepPrintPage} />
          <Route path="/mid-strategy/pdf-render" component={MidStrategyPrintPage} />
        </Switch>
      </QueryClientProvider>
    );
  }

  if (isAuthPage) {
    return (
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <Switch>
            <Route path="/login" component={LoginPage} />
          </Switch>
          <Toaster />
        </ThemeProvider>
      </QueryClientProvider>
    );
  }

  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <ProtectedRoute>
            <SidebarProvider defaultOpen={false} style={sidebarStyle as React.CSSProperties}>
              <div className="flex h-screen w-full">
                <AppSidebar />
                <div className="flex flex-col flex-1 min-w-0">
                  <main className="flex-1 overflow-hidden flex flex-col">
                    <Router />
                  </main>
                  <footer className="shrink-0 border-t px-4 py-2 text-center text-[11px] text-muted-foreground">
                    Designed by{" "}
                    <a
                      href="https://syncds.ca"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline underline-offset-2 hover:text-foreground transition-colors"
                    >
                      Sync Digital Solutions
                    </a>
                  </footer>
                </div>
              </div>
            </SidebarProvider>
          </ProtectedRoute>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
