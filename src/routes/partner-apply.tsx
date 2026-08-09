import { createFileRoute } from "@tanstack/react-router";
import { PublicHeader } from "@/components/site/PublicHeader";
import PartnerForm from "@/components/site/PartnerForm";

export const Route = createFileRoute("/partner-apply")({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Partner Application — FundedNG" },
      {
        name: "description",
        content:
          "Apply to become a FundedNG partner. Join Nigeria's fastest-growing prop trading community.",
      },
    ],
  }),
  component: PartnerApplyPage,
});

function PartnerApplyPage() {
  return (
    <div className="min-h-screen">
      <PublicHeader />
      <PartnerForm />
    </div>
  );
}
