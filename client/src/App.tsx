import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { ThemeProvider } from "@/components/theme-provider";
import NotFound from "@/pages/not-found";
import ReportsPage from "@/pages/reports";
import ClientsPage from "@/pages/clients";
import SetupPage from "@/pages/setup";
import HistoryPage from "@/pages/history";
import QbrPrepPage from "@/pages/qbr-prep";
import QbrPrepPrintPage from "@/pages/qbr-prep-print";
import BiweeklyPage from "@/pages/biweekly";
import BiweeklyPrintPage from "@/pages/biweekly-print";
import BiweeklyPdfPage from "@/pages/biweekly-pdf";
import MonthlyPage from "@/pages/monthly";
import MonthlyPrintPage from "@/pages/monthly-print";
import QbrFullPage from "@/pages/qbr-full";
import MidStrategyPage from "@/pages/mid-strategy";
import DashboardPage from "@/pages/dashboard";
import SampleReportsPage from "@/pages/sample-reports";
import TemplateBuilderPage from "@/pages/template-builder";

function RootRedirect() {
  const [, setLocation] = useLocation();
  setLocation("/dashboard");
  return null;
}

const PRINT_ROUTES = ["/biweekly/print", "/monthly/print", "/biweekly/pdf-render", "/qbr-prep-print"];

function Router() {
  return (
    <Switch>
      <Route path="/" component={RootRedirect} />
      <Route path="/dashboard" component={DashboardPage} />
      <Route path="/biweekly" component={BiweeklyPage} />
      <Route path="/monthly" component={MonthlyPage} />
      <Route path="/qbr" component={QbrFullPage} />
      <Route path="/mid-strategy" component={MidStrategyPage} />
      <Route path="/qbr-prep" component={QbrPrepPage} />
      <Route path="/reports" component={ReportsPage} />
      <Route path="/clients" component={ClientsPage} />
      <Route path="/setup" component={SetupPage} />
      <Route path="/history" component={HistoryPage} />
      <Route path="/sample-reports" component={SampleReportsPage} />
      <Route path="/template-builder" component={TemplateBuilderPage} />
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

  if (isPrintPage) {
    return (
      <QueryClientProvider client={queryClient}>
        <Switch>
          <Route path="/biweekly/print" component={BiweeklyPrintPage} />
          <Route path="/biweekly/pdf-render" component={BiweeklyPdfPage} />
          <Route path="/monthly/print" component={MonthlyPrintPage} />
          <Route path="/qbr-prep-print" component={QbrPrepPrintPage} />
        </Switch>
      </QueryClientProvider>
    );
  }

  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <SidebarProvider style={sidebarStyle as React.CSSProperties}>
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
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
