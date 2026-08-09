import { createFileRoute } from "@tanstack/react-router";
import { getCachedUSDRate, getUSDRate } from "@/lib/exchange-rate.server";

export const Route = createFileRoute("/api/exchange-rate")({
  server: {
    handlers: {
      GET: async () => {
        try {
          const rate = await getUSDRate();
          const { updatedAt } = await getCachedUSDRate();
          return Response.json({ rate, updatedAt });
        } catch {
          const { rate, updatedAt } = await getCachedUSDRate();
          return Response.json({ rate, updatedAt });
        }
      },
    },
  },
});
