import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

async function assertPartner(token: string) {
  const { data: authData, error: authErr } = await supabaseAdmin.auth.getUser(token);
  if (authErr || !authData?.user) return { ok: false as const, error: "Please sign in again" };
  const { data: roles } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", authData.user.id);
  if (!roles?.some((r) => r.role === "partner")) return { ok: false as const, error: "Forbidden: partner role required" };
  return { ok: true as const, userId: authData.user.id };
}

const GetBuyerInfoInput = z.object({
  accessToken: z.string().min(1),
  userIds: z.array(z.string().uuid()),
});

export const getBuyerInfo = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => GetBuyerInfoInput.parse(input))
  .handler(async ({ data }) => {
    try {
      const auth = await assertPartner(data.accessToken);
      if (!auth.ok) return auth;

      const emails: Record<string, string> = {};
      const names: Record<string, string> = {};

      await Promise.all(
        data.userIds.map(async (uid) => {
          const { data: userData } = await supabaseAdmin.auth.admin.getUserById(uid);
          if (userData?.user?.email) emails[uid] = userData.user.email;
        }),
      );

      const { data: profiles } = await supabaseAdmin
        .from("profiles")
        .select("id, full_name")
        .in("id", data.userIds);

      if (profiles) {
        for (const p of profiles) {
          names[p.id] = p.full_name;
        }
      }

      return { ok: true as const, emails, names };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to fetch buyer info";
      return { ok: false as const, error: msg };
    }
  });
