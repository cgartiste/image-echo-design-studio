import { useQuery, queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type Module = "dashboard" | "campaigns" | "lists" | "activity" | "users" | "domains" | "offers";
export type Action =
  | "view"
  | "create"
  | "edit"
  | "delete"
  | "export"
  | "execute"
  | "settings"
  | "manage_users";

export const ROLE_LABELS: Record<string, string> = {
  super_admin: "Super Admin",
  admin: "Admin",
  manager: "Manager",
  operator: "Operator",
  analyst: "Analyst",
  viewer: "Viewer",
};

export const meQuery = queryOptions({
  queryKey: ["me"],
  queryFn: async () => {
    const { data: u } = await supabase.auth.getUser();
    const user = u.user;
    if (!user) return null;
    const [{ data: profile }, { data: roles }] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", user.id),
    ]);
    const roleList = (roles ?? []).map((r) => r.role as string);
    const { data: perms } = roleList.length
      ? await supabase.from("role_permissions").select("module,action").in("role", roleList as never)
      : { data: [] as { module: string; action: string }[] };
    const set = new Set((perms ?? []).map((p) => `${p.module}:${p.action}`));
    const isSuper = roleList.includes("super_admin");
    return {
      user,
      profile,
      roles: roleList,
      can: (m: Module, a: Action) => isSuper || set.has(`${m}:${a}`),
    };
  },
  staleTime: 60_000,
});

export function useMe() {
  return useQuery(meQuery);
}

export async function logActivity(module: string, action: string, details?: string) {
  const { data } = await supabase.auth.getUser();
  if (!data.user) return;
  await supabase.from("activity_logs").insert({
    user_id: data.user.id,
    user_email: data.user.email ?? null,
    module,
    action,
    details: details ?? null,
  });
}
