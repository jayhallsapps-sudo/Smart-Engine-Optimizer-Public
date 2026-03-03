import { Switch, Route } from "wouter";
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

function Router() {
  return (
    <Switch>
      <Route path="/" component={ReportsPage} />
      <Route path="/clients" component={ClientsPage} />
      <Route path="/setup" component={SetupPage} />
      <Route path="/history" component={HistoryPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

const sidebarStyle = {
  "--sidebar-width": "14rem",
  "--sidebar-width-icon": "3rem",
};

export default function App() {
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
