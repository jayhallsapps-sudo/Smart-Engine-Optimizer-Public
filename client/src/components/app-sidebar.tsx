import { CalendarDays, BarChart3, TrendingUp, Sparkles, Users, Settings, Zap, LayoutDashboard, FlaskConical, PenSquare, Target, ShieldCheck } from "lucide-react";
import { useLocation, Link } from "wouter";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
  SidebarRail,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { ThemeToggle } from "@/components/theme-toggle";

const dashboardItem = { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard };

const reportItems = [
  { title: "Mid-Strategy", url: "/mid-strategy", icon: Target },
  { title: "Bi-Weekly", url: "/biweekly", icon: CalendarDays },
  { title: "Monthly", url: "/monthly", icon: BarChart3 },
  { title: "QBR Prep", url: "/qbr-prep", icon: Sparkles },
  { title: "QBR", url: "/qbr", icon: TrendingUp },
];

const utilItems = [
  { title: "Clients", url: "/clients", icon: Users },
  { title: "Sample Exports", url: "/sample-reports", icon: FlaskConical },
  { title: "Template Builder", url: "/template-builder", icon: PenSquare },
  { title: "Integrations", url: "/integrations", icon: Settings },
  { title: "Security", url: "/security", icon: ShieldCheck },
];

function SidebarLogo() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";

  return (
    <Link
      href="/dashboard"
      className="flex items-center gap-2 px-2 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0"
    >
      <div className="flex items-center justify-center w-8 h-8 rounded-md bg-primary shrink-0">
        <Zap className="w-4 h-4 text-primary-foreground" />
      </div>
      {!collapsed && (
        <div>
          <h1 className="text-sm font-semibold tracking-tight" data-testid="text-app-name">SmartEO</h1>
          <p className="text-[10px] text-muted-foreground leading-none">Smart Engine Optimization</p>
        </div>
      )}
    </Link>
  );
}

export function AppSidebar() {
  const [location] = useLocation();

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="p-4 pb-2 group-data-[collapsible=icon]:p-2 group-data-[collapsible=icon]:pb-2">
        <SidebarLogo />
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {[dashboardItem].map(item => {
                const isActive = location === item.url;
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild tooltip={item.title} isActive={isActive}>
                      <Link href={item.url} data-testid="link-nav-dashboard">
                        <item.icon className="w-4 h-4 shrink-0" />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Reports</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {reportItems.map(item => {
                const isActive = location === item.url;
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      asChild
                      tooltip={item.title}
                      isActive={isActive}
                    >
                      <Link href={item.url} data-testid={`link-nav-${item.title.toLowerCase().replace(/\s/g, "-")}`}>
                        <item.icon className="w-4 h-4 shrink-0" />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Tools</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {utilItems.map(item => {
                const isActive = location === item.url;
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      asChild
                      tooltip={item.title}
                      isActive={isActive}
                    >
                      <Link href={item.url} data-testid={`link-nav-${item.title.toLowerCase()}`}>
                        <item.icon className="w-4 h-4 shrink-0" />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="p-2">
        <div className="flex items-center justify-between gap-1 group-data-[collapsible=icon]:flex-col group-data-[collapsible=icon]:justify-center">
          <div className="text-[10px] text-muted-foreground group-data-[collapsible=icon]:hidden">
            SmartEO v1.2
          </div>
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
