import { FileBarChart, Users, Settings, Zap, History, Sparkles } from "lucide-react";
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

const navItems = [
  { title: "Reports", url: "/", icon: FileBarChart },
  { title: "QBR Prep", url: "/qbr-prep", icon: Sparkles },
  { title: "Clients", url: "/clients", icon: Users },
  { title: "History", url: "/history", icon: History },
  { title: "Setup", url: "/setup", icon: Settings },
];

function SidebarLogo() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";

  return (
    <Link
      href="/"
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
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    tooltip={item.title}
                    data-active={location === item.url || (item.url !== "/" && location.startsWith(item.url))}
                    className="data-[active=true]:bg-sidebar-accent"
                  >
                    <Link href={item.url} data-testid={`link-nav-${item.title.toLowerCase()}`}>
                      <item.icon className="w-4 h-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="p-2">
        <div className="flex items-center justify-between gap-1 group-data-[collapsible=icon]:flex-col group-data-[collapsible=icon]:justify-center">
          <div className="text-[10px] text-muted-foreground group-data-[collapsible=icon]:hidden">
            SmartEO v1.1
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
