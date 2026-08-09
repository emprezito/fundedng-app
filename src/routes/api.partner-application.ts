import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const Route = createFileRoute("/api/partner-application")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = (await request.json()) as {
            fullName?: string;
            email?: string;
            phone?: string;
            country?: string;
            primaryPlatform?: string;
            profileLink?: string;
            followerCount?: string;
            communityType?: string;
            communitySize?: string;
            communityLink?: string;
            activelyTrades?: string;
            tradingStyle?: string;
            passedChallenge?: string;
            challengePlatform?: string;
            willingToPassPublicly?: string;
            whyFundedNG?: string;
            contentType?: string;
            otherPropFirms?: string;
            sampleContentLink?: string;
            agreeNoGiveawayOnly?: boolean;
            agreePublicChallenge?: boolean;
            agreeNoDM?: boolean;
            agreeTerms?: boolean;
          };

          // Basic validation
          const required = [
            "fullName", "email", "phone", "country",
            "primaryPlatform", "profileLink", "followerCount", "communityType",
            "activelyTrades", "tradingStyle", "passedChallenge", "willingToPassPublicly",
            "whyFundedNG", "contentType", "otherPropFirms",
          ] as const;

          for (const key of required) {
            if (!body[key] || (typeof body[key] === "string" && !(body[key] as string).trim())) {
              return Response.json({ error: `${key} is required` }, { status: 400 });
            }
          }

          if (!body.email?.includes("@")) {
            return Response.json({ error: "Valid email required" }, { status: 400 });
          }

          if ((body.whyFundedNG?.trim().length ?? 0) < 50) {
            return Response.json({ error: "Why FundedNG must be at least 50 characters" }, { status: 400 });
          }

          if (!body.agreeNoGiveawayOnly || !body.agreePublicChallenge || !body.agreeNoDM || !body.agreeTerms) {
            return Response.json({ error: "All commitments must be acknowledged" }, { status: 400 });
          }

          // Save to Supabase
          const { data, error } = await supabaseAdmin
            .from("partner_applications")
            .insert({
              full_name: body.fullName!,
              email: body.email!,
              phone: body.phone!,
              country: body.country!,
              primary_platform: body.primaryPlatform!,
              profile_link: body.profileLink!,
              follower_count: body.followerCount!,
              community_type: body.communityType!,
              community_size: body.communitySize || null,
              community_link: body.communityLink || null,
              actively_trades: body.activelyTrades!,
              trading_style: body.tradingStyle!,
              passed_challenge: body.passedChallenge!,
              challenge_platform: body.challengePlatform || null,
              willing_to_pass_publicly: body.willingToPassPublicly!,
              why_funded_ng: body.whyFundedNG!,
              content_type: body.contentType!,
              other_prop_firms: body.otherPropFirms!,
              sample_content_link: body.sampleContentLink || null,
              agree_no_giveaway_only: body.agreeNoGiveawayOnly!,
              agree_public_challenge: body.agreePublicChallenge!,
              agree_no_dm: body.agreeNoDM!,
              agree_terms: body.agreeTerms!,
            })
            .select("id")
            .single();

          if (error) {
            console.error("[partner-application] insert error", error);
            return Response.json({ error: "Failed to save application" }, { status: 500 });
          }

          // Send Telegram notification
          const telegramMessage = [
            `🎯 <b>New Partner Application</b>`,
            ``,
            `👤 <b>${body.fullName}</b>`,
            `📧 ${body.email}`,
            `📱 ${body.phone}`,
            `🌍 ${body.country}`,
            ``,
            `📱 <b>Online Presence</b>`,
            `Platform: ${body.primaryPlatform}`,
            `Followers: ${body.followerCount}`,
            `Link: ${body.profileLink}`,
            `Community: ${body.communityType}${body.communitySize ? ` (${body.communitySize})` : ""}`,
            body.communityLink ? `Community Link: ${body.communityLink}` : "",
            ``,
            `📈 <b>Trading Background</b>`,
            `Active Trader: ${body.activelyTrades}`,
            `Style: ${body.tradingStyle}`,
            `Passed Challenge: ${body.passedChallenge}`,
            body.challengePlatform ? `Platform: ${body.challengePlatform}` : "",
            `Willing to Pass Publicly: ${body.willingToPassPublicly}`,
            ``,
            `💡 <b>Brand Fit</b>`,
            `Why FundedNG: ${body.whyFundedNG}`,
            `Content Type: ${body.contentType}`,
            `Other Prop Firms: ${body.otherPropFirms}`,
            body.sampleContentLink ? `Sample: ${body.sampleContentLink}` : "",
            ``,
            `✅ All commitments acknowledged`,
            ``,
            `🔗 <a href="https://app.fundedng.com/admin">Review in Admin Panel</a>`,
          ].filter(Boolean).join("\n");

          // Call the existing send_telegram RPC
          await supabaseAdmin.rpc("send_telegram" as never, {
            p_message: telegramMessage,
          } as never).catch((e) => {
            console.error("[partner-application] telegram notification failed", e);
          });

          return Response.json({ ok: true, id: data.id });
        } catch (e) {
          const msg = e instanceof Error ? e.message : "Unexpected error";
          console.error("[partner-application] unexpected", msg);
          return Response.json({ error: msg }, { status: 500 });
        }
      },
    },
  },
});
