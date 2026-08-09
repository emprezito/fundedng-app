import { Link } from "@tanstack/react-router";

export function Brand({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const cls = size === "lg" ? "text-2xl" : size === "sm" ? "text-base" : "text-xl";
  return (
    <Link to="/" className={`font-display font-bold tracking-[0.25em] ${cls}`}>
      <span className="text-primary text-glow">FUNDED</span>
      <span className="text-foreground">NG</span>
    </Link>
  );
}
