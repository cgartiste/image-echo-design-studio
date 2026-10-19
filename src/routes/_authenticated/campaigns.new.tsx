import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page";
import { CampaignForm, emptyCampaign, toRow } from "@/components/campaign-form";
import { logActivity, useMe } from "@/lib/auth";

export const Route = createFileRoute("/_authenticated/campaigns/new")({
  head: () => ({ meta: [{ title: "New campaign — Cortex" }, { name: "description", content: "Create an email campaign." }] }),
  component: NewCampaign,
});

function NewCampaign() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: me } = useMe();
  return (
    <div>
      <PageHeader title="New campaign" subtitle="Saved as a draft. Start or schedule it from the campaign page." />
      <CampaignForm
        defaultValues={emptyCampaign}
        submitLabel="Create draft"
        onSubmit={async (v) => {
          const { data, error } = await supabase.from("campaigns").insert({ ...toRow(v), created_by: me?.user.id ?? null }).select("id").single();
          if (error) { toast.error(error.message); return; }
          await supabase.from("campaign_logs").insert({ campaign_id: data.id, message: "Campaign created" });
          await logActivity("campaigns", "create", v.name);
          qc.invalidateQueries({ queryKey: ["campaigns"] });
          toast.success("Campaign created");
          navigate({ to: "/campaigns/$id", params: { id: data.id } });
        }}
      />
    </div>
  );
}
