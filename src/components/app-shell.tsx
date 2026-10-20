import { Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity, Bell, FlaskConical, Globe, Handshake, LayoutDashboard, ListChecks, LogOut, Mail,
  Crown, Moon, Server, ShieldBan, Sun, Tags, Terminal, User, UserCog, Users,
} from "lucide-react";
import { useEffect, useState } from "react";
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarHeader,
  SidebarInset, SidebarMenu, SidebarMenuBadge, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarTrigger,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { supabase } from "@/integrations/supabase/client";
import { ROLE_LABELS, useMe } from "@/lib/auth";
import { t, type TKey } from "@/lib/i18n";
import { fmtDate } from "@/lib/format";

const live: { to: string; key: TKey; icon: typeof Mail }[] = [
  { to: "/dashboard", key: "nav.dashboard", icon: LayoutDashboard },
  { to: "/campaigns", key: "nav.campaigns", icon: Mail },
  { to: "/lists", key: "nav.lists", icon: Users },
  { to: "/domains", key: "nav.domains", icon: Globe },
  { to: "/sponsors", key: "nav.offers", icon: Handshake },
  { to: "/servers", key: "nav.servers", icon: Server },
  { to: "/vip", key: "nav.vip", icon: Crown },
  { to: "/suppression", key: "nav.suppression", icon: ShieldBan },
  { to: "/team", key: "nav.team", icon: UserCog },
  { to: "/activity", key: "nav.activity", icon: Activity },
];
const soon: { slug: string; key: TKey; icon: typeof Mail }[] = [
  { slug: "segments", key: "nav.segments", icon: ListChecks },
  { slug: "ab-tests", key: "nav.abtests", icon: FlaskConical },
  { slug: "taxonomy", key: "nav.taxonomy", icon: Tags },
];

export function AppShell() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: me } = useMe();
  const [dark, setDark] = useState(false);
  useEffect(() => setDark(document.documentElement.classList.contains("dark")), []);

  function toggleTheme() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("cortex-theme", next ? "dark" : "light");
  }

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <SidebarProvider>
      <Sidebar collapsible="icon">
        <SidebarHeader>
          <div className="flex items-center gap-2 px-1 py-1.5">
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-brand font-display text-sm font-bold text-sidebar-primary-foreground">C</span>
            <span className="font-display text-base font-semibold text-sidebar-accent-foreground group-data-[collapsible=icon]:hidden">Cortex</span>
          </div>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>Operate</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {live.map((i) => (
                  <SidebarMenuItem key={i.to}>
                    <SidebarMenuButton asChild isActive={path.startsWith(i.to)} tooltip={t(i.key)}>
                      <Link to={i.to}>
                        <i.icon />
                        <span>{t(i.key)}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
          <SidebarGroup>
            <SidebarGroupLabel>Deliverability & growth</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {soon.map((i) => (
                  <SidebarMenuItem key={i.slug}>
                    <SidebarMenuButton asChild isActive={path === `/soon/${i.slug}`} tooltip={t(i.key)}>
                      <Link to="/soon/$module" params={{ module: i.slug }}>
                        <i.icon />
                        <span>{t(i.key)}</span>
                      </Link>
                    </SidebarMenuButton>
                    <SidebarMenuBadge className="text-[10px] uppercase text-sidebar-foreground/50">{t("common.soon")}</SidebarMenuBadge>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton asChild isActive={path === "/profile"} tooltip="Profile">
                <Link to="/profile">
                  <User />
                  <span className="truncate">{me?.profile?.full_name ?? me?.user.email}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton onClick={signOut} tooltip="Sign out">
                <LogOut />
                <span>Sign out</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset>
        <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b bg-background/85 px-4 backdrop-blur">
          <SidebarTrigger />
          <div className="ml-auto flex items-center gap-1">
            {me && (
              <span className="mr-2 hidden rounded-full border px-2 py-0.5 font-mono text-[11px] text-muted-foreground sm:inline">
                {me.roles.map((r) => ROLE_LABELS[r]).join(", ")}
              </span>
            )}
            <Notifications userId={me?.user.id} />
            <Button variant="ghost" size="icon" onClick={toggleTheme} aria-label="Toggle theme">
              {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
          </div>
        </header>
        <main className="flex-1 p-4 md:p-6">
          <Outlet />
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}

function Notifications({ userId }: { userId: string | undefined }) {
  const qc = useQueryClient();
  const { data = [] } = useQuery({
    queryKey: ["notifications", userId],
    enabled: !!userId,
    queryFn: async () =>
      (await supabase.from("notifications").select("*").order("created_at", { ascending: false }).limit(20)).data ?? [],
  });
  const unread = data.filter((n) => !n.read).length;
  async function markAll() {
    await supabase.from("notifications").update({ read: true }).eq("read", false);
    qc.invalidateQueries({ queryKey: ["notifications"] });
  }
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label="Notifications">
          <Bell className="h-4 w-4" />
          {unread > 0 && (
            <span className="absolute right-1 top-1 grid h-4 min-w-4 place-items-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
              {unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <span className="text-sm font-medium">Notifications</span>
          {unread > 0 && <button className="text-xs text-primary" onClick={markAll}>Mark all read</button>}
        </div>
        <div className="max-h-80 overflow-auto">
          {data.length === 0 && <p className="p-4 text-sm text-muted-foreground">You're all caught up.</p>}
          {data.map((n) => (
            <div key={n.id} className="border-b px-3 py-2 last:border-0">
              <p className={n.read ? "text-sm text-muted-foreground" : "text-sm font-medium"}>{n.title}</p>
              {n.body && <p className="text-xs text-muted-foreground">{n.body}</p>}
              <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">{fmtDate(n.created_at)}</p>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

