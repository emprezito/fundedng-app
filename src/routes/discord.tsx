import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/discord")({
  ssr: true,
  beforeLoad: () => {
    throw redirect({ href: "https://discord.gg/FXXCGPZ6w3" });
  },
  component: () => null,
});
