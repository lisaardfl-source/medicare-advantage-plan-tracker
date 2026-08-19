import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  FileSpreadsheet,
  Map,
  Users,
  BarChart3,
  Search,
  Settings,
  TrendingUp,
} from "lucide-react";

export function Sidebar() {
  const [location] = useLocation();

  const navItems = [
    { href: "/", label: "Dashboard", icon: LayoutDashboard },
    { href: "/plans", label: "Plans", icon: FileSpreadsheet },
    { href: "/counties", label: "Counties", icon: Map },
    { href: "/enrollments", label: "Enrollments", icon: Users },
    { href: "/summary", label: "Summary", icon: BarChart3 },
    { href: "/concentration", label: "Concentration", icon: TrendingUp },
  ];

  return (
    <aside className="w-64 bg-sidebar border-r border-sidebar-border flex flex-col h-[100dvh] text-sidebar-foreground shrink-0 overflow-y-auto sticky top-0">
      <div className="h-14 flex items-center px-6 border-b border-sidebar-border shrink-0">
        <div className="flex items-center gap-2 font-bold text-lg tracking-tight">
          <div className="w-6 h-6 rounded bg-sidebar-primary flex items-center justify-center">
            <BarChart3 className="w-3.5 h-3.5 text-sidebar-primary-foreground" />
          </div>
          MA Tracker
        </div>
      </div>

      <div className="flex-1 py-4 flex flex-col gap-1 px-3">
        <div className="px-3 text-xs font-semibold text-sidebar-foreground/50 uppercase tracking-wider mb-2">
          Analytics
        </div>
        {navItems.map((item) => {
          const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-md transition-colors",
                isActive
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
              )}
            >
              <item.icon className="w-4 h-4" />
              {item.label}
            </Link>
          );
        })}
      </div>

      <div className="p-4 border-t border-sidebar-border mt-auto">
        <div className="flex items-center gap-3 px-2 py-2">
          <div className="w-8 h-8 rounded-full bg-sidebar-accent flex items-center justify-center text-xs font-bold">
            AD
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-medium">Analyst Desk</span>
            <span className="text-xs text-sidebar-foreground/50">CMS Region 4</span>
          </div>
        </div>
      </div>
    </aside>
  );
}

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-[100dvh] bg-background w-full">
      <Sidebar />
      <main className="flex-1 flex flex-col min-w-0">
        <div className="h-14 border-b bg-card flex items-center px-6 justify-between shrink-0 sticky top-0 z-10">
          <div className="flex items-center text-sm font-medium text-muted-foreground">
            {/* Breadcrumb area or global search could go here */}
            <div className="relative group flex items-center">
              <Search className="w-4 h-4 absolute left-3 text-muted-foreground group-focus-within:text-primary transition-colors" />
              <input
                type="search"
                placeholder="Global search (H-Number, Sponsor)..."
                className="w-80 h-9 bg-muted/50 border-transparent rounded-md pl-9 pr-4 text-sm focus:bg-background focus:border-ring focus:ring-1 focus:ring-ring outline-none transition-all placeholder:text-muted-foreground/70 font-mono"
              />
            </div>
          </div>
          <div className="flex items-center gap-4 text-muted-foreground">
            <div className="text-xs font-mono bg-muted px-2 py-1 rounded">
              CY2026 Data
            </div>
            <button className="hover:text-foreground transition-colors">
              <Settings className="w-4 h-4" />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-x-hidden p-6 max-w-[1600px] w-full mx-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
