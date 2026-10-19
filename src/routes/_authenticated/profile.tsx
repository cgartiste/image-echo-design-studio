import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, Panel } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ROLE_LABELS, logActivity, useMe } from "@/lib/auth";

export const Route = createFileRoute("/_authenticated/profile")({
  head: () => ({ meta: [{ title: "Profile — Cortex" }, { name: "description", content: "Your account settings." }] }),
  component: Profile,
});

const TIMEZONES = ["UTC", "Europe/Paris", "Europe/London", "America/New_York", "America/Los_Angeles", "Asia/Dubai", "Asia/Tokyo"];

function Profile() {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [tz, setTz] = useState("UTC");
  const [email, setEmail] = useState("");
  const [cur, setCur] = useState("");
  const [pw, setPw] = useState("");

  useEffect(() => {
    if (!me) return;
    setName(me.profile?.full_name ?? "");
    setTz(me.profile?.timezone ?? "UTC");
    setEmail(me.user.email ?? "");
  }, [me]);

  async function saveProfile() {
    const { error } = await supabase.from("profiles").update({ full_name: name.trim().slice(0, 100), timezone: tz, updated_at: new Date().toISOString() }).eq("id", me!.user.id);
    if (error) return toast.error(error.message);
    if (email !== me!.user.email) {
      const { error: e2 } = await supabase.auth.updateUser({ email });
      if (e2) return toast.error(e2.message);
      toast.info("Confirm the change from your new inbox.");
    }
    await logActivity("users", "update_profile", "Profile updated");
    qc.invalidateQueries({ queryKey: ["me"] });
    toast.success("Profile saved");
  }
  async function changePw() {
    if (pw.length < 8) return toast.error("Password must be at least 8 characters");
    const { error } = await supabase.auth.updateUser({ password: pw, current_password: cur } as never);
    if (error) return toast.error(error.message);
    await logActivity("users", "change_password", "Password changed");
    setPw(""); setCur("");
    toast.success("Password updated");
  }

  return (
    <div className="max-w-2xl">
      <PageHeader title="Profile" subtitle={me ? me.roles.map((r) => ROLE_LABELS[r]).join(", ") : ""} />
      <Panel title="Account" className="mb-4">
        <div className="grid gap-4 p-4 sm:grid-cols-2">
          <div className="space-y-1"><Label>Full name</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div className="space-y-1"><Label>Email</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
          <div className="space-y-1">
            <Label>Timezone</Label>
            <select value={tz} onChange={(e) => setTz(e.target.value)} className="h-9 w-full rounded-md border bg-background px-3 text-sm">
              {TIMEZONES.map((t) => <option key={t}>{t}</option>)}
            </select>
          </div>
        </div>
        <div className="flex justify-end border-t p-3"><Button onClick={saveProfile}>Save</Button></div>
      </Panel>
      <Panel title="Password">
        <div className="grid gap-4 p-4 sm:grid-cols-2">
          <div className="space-y-1"><Label>Current password</Label><Input type="password" value={cur} onChange={(e) => setCur(e.target.value)} /></div>
          <div className="space-y-1"><Label>New password</Label><Input type="password" value={pw} onChange={(e) => setPw(e.target.value)} /></div>
        </div>
        <div className="flex justify-end border-t p-3"><Button variant="secondary" onClick={changePw}>Change password</Button></div>
      </Panel>
    </div>
  );
}
