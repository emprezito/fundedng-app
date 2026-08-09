import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";

interface SocialProofItem {
  id: string;
  label: string;
  image_url: string;
  category: "payout" | "certificate" | "dashboard" | "funded";
  display_order: number;
}

const categoryConfig: Record<string, { label: string; className: string }> = {
  payout: { label: "PAYOUT", className: "bg-green-500/20 text-green-500 border-green-500/40" },
  certificate: { label: "CERTIFIED", className: "bg-blue-500/20 text-blue-500 border-blue-500/40" },
  dashboard: { label: "LIVE DASHBOARD", className: "bg-purple-500/20 text-purple-500 border-purple-500/40" },
  funded: { label: "FUNDED", className: "bg-amber-500/20 text-amber-500 border-amber-500/40" },
};

function SocialProofGallery() {
  const [items, setItems] = useState<SocialProofItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [hovered, setHovered] = useState(false);

  useEffect(() => {
    supabase
      .from("social_proof_items")
      .select("id, label, image_url, category, display_order")
      .eq("is_visible", true)
      .order("display_order", { ascending: true })
      .then(({ data }) => {
        setItems((data as SocialProofItem[]) ?? []);
        setLoading(false);
      });
  }, []);

  if (!loading && items.length === 0) return null;

  const doubled = [...items, ...items];

  const renderCard = (item: SocialProofItem) => (
    <div className="relative flex-shrink-0 w-[280px] md:w-[360px] h-[180px] md:h-[220px] rounded-2xl overflow-hidden border border-border group hover:scale-[1.02] hover:shadow-lg transition-all duration-300 cursor-default">
      <img
        src={item.image_url}
        alt={item.label}
        className="h-full w-full object-cover"
        loading="lazy"
      />
      <span
        className={`absolute top-2 right-2 rounded-md border px-2 py-0.5 text-[10px] font-display font-semibold ${categoryConfig[item.category]?.className ?? ""}`}
      >
        {categoryConfig[item.category]?.label ?? item.category.toUpperCase()}
      </span>
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-3 pt-6">
        <span className="text-xs font-medium text-white">{item.label}</span>
      </div>
    </div>
  );

  const renderSkeleton = (key: string) => (
    <div key={key} className="flex-shrink-0 w-[280px] md:w-[360px] h-[180px] md:h-[220px] rounded-2xl overflow-hidden border border-border">
      <Skeleton className="h-full w-full rounded-none" />
    </div>
  );

  const hasMinItems = items.length >= 4;

  return (
    <section className="py-16 overflow-hidden bg-background">
      <div className="text-center mb-10 px-4">
        <span className="font-display inline-block text-xs tracking-[0.4em] text-primary opacity-80 mb-4">
          REAL RESULTS
        </span>
        <h2 className="font-display text-4xl font-bold">Nigerian Traders. Real Payouts.</h2>
        <p className="mt-2 text-muted-foreground">
          Join traders already passing challenges and earning from FundedNG
        </p>
      </div>

      <div className="relative">
        {loading ? (
          <div className="space-y-4">
            <div className="flex gap-4 px-4 overflow-hidden">
              {Array.from({ length: 4 }).map((_, i) => renderSkeleton(`s1-${i}`))}
            </div>
            <div className="flex gap-4 px-4 overflow-hidden">
              {Array.from({ length: 4 }).map((_, i) => renderSkeleton(`s2-${i}`))}
            </div>
          </div>
        ) : hasMinItems ? (
          <div
            className={`space-y-4 ${hovered ? "paused" : ""}`}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
          >
            <div
              className="flex overflow-hidden"
              style={{
                mask: "linear-gradient(to right, transparent, black 10%, black 90%, transparent)",
                WebkitMask: "linear-gradient(to right, transparent, black 10%, black 90%, transparent)",
              }}
            >
              <div className="flex gap-4 animate-scroll-left" style={{ animationDuration: "30s" }}>
                {doubled.map((item, i) => (
                  <div key={`r1-${item.id}-${i}`}>{renderCard(item)}</div>
                ))}
              </div>
            </div>
            <div
              className="flex overflow-hidden"
              style={{
                mask: "linear-gradient(to right, transparent, black 10%, black 90%, transparent)",
                WebkitMask: "linear-gradient(to right, transparent, black 10%, black 90%, transparent)",
              }}
            >
              <div className="flex gap-4 animate-scroll-right" style={{ animationDuration: "30s" }}>
                {doubled.map((item, i) => (
                  <div key={`r2-${item.id}-${i}`}>{renderCard(item)}</div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex justify-center gap-4 px-4">
            {items.map((item) => (
              <div key={item.id}>{renderCard(item)}</div>
            ))}
          </div>
        )}
      </div>

      <style>{`
        @keyframes scroll-left {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        @keyframes scroll-right {
          0% { transform: translateX(-50%); }
          100% { transform: translateX(0); }
        }
        .animate-scroll-left {
          animation: scroll-left 30s linear infinite;
        }
        .animate-scroll-right {
          animation: scroll-right 30s linear infinite;
        }
        .paused .animate-scroll-left,
        .paused .animate-scroll-right {
          animation-play-state: paused;
        }
      `}</style>
    </section>
  );
}

export default SocialProofGallery;
