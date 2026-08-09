import { useRef, useState } from "react";
import { Download, FileImage, FileText } from "lucide-react";
import { formatNaira } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import trophyImg from "@/assets/trophy.png";

export interface Certificate {
  id: string;
  kind: "funded" | "payout";
  certificate_number: string;
  full_name: string;
  account_size: number;
  challenge_name: string;
  mt5_login: string;
  payout_amount: number | null;
  issued_at: string;
}

// Convert a number into English words (for payout amount in words)
function numberToWords(n: number): string {
  if (n === 0) return "Zero";
  const ones = [
    "",
    "One",
    "Two",
    "Three",
    "Four",
    "Five",
    "Six",
    "Seven",
    "Eight",
    "Nine",
    "Ten",
    "Eleven",
    "Twelve",
    "Thirteen",
    "Fourteen",
    "Fifteen",
    "Sixteen",
    "Seventeen",
    "Eighteen",
    "Nineteen",
  ];
  const tens = [
    "",
    "",
    "Twenty",
    "Thirty",
    "Forty",
    "Fifty",
    "Sixty",
    "Seventy",
    "Eighty",
    "Ninety",
  ];
  const chunk = (num: number): string => {
    let s = "";
    if (num >= 100) {
      s += ones[Math.floor(num / 100)] + " Hundred";
      num %= 100;
      if (num) s += " ";
    }
    if (num >= 20) {
      s += tens[Math.floor(num / 10)];
      if (num % 10) s += "-" + ones[num % 10];
    } else if (num > 0) {
      s += ones[num];
    }
    return s;
  };
  const units = ["", "Thousand", "Million", "Billion"];
  let i = 0;
  let words = "";
  while (n > 0) {
    const c = n % 1000;
    if (c) {
      words = chunk(c) + (units[i] ? " " + units[i] : "") + (words ? " " + words : "");
    }
    n = Math.floor(n / 1000);
    i++;
  }
  return words;
}

function FundedNgLogo({ className = "" }: { className?: string }) {
  return (
    <div className={`flex flex-col items-end ${className}`}>
      <svg
        viewBox="0 0 200 42"
        className="h-7 w-auto sm:h-8"
        fill="none"
        aria-hidden="true"
      >
        {/* F with candlesticks */}
        <text
          x="2"
          y="31"
          fontFamily="Arial, sans-serif"
          fontSize="26"
          fontWeight="900"
          fill="#34D399"
        >
          F
        </text>
        {/* Green candle */}
        <rect x="28" y="10" width="4" height="20" rx="1" fill="#34D399" />
        <rect x="27" y="6" width="6" height="1.5" fill="#34D399" />
        <rect x="27" y="32" width="6" height="1.5" fill="#34D399" />
        {/* Red candle */}
        <rect x="36" y="14" width="4" height="16" rx="1" fill="#EF4444" />
        <rect x="35" y="8" width="6" height="1.5" fill="#EF4444" />
        <rect x="35" y="31" width="6" height="1.5" fill="#EF4444" />
        {/* Green candle */}
        <rect x="44" y="8" width="4" height="22" rx="1" fill="#34D399" />
        <rect x="43" y="4" width="6" height="1.5" fill="#34D399" />
        <rect x="43" y="33" width="6" height="1.5" fill="#34D399" />
        {/* FUNDEDNG text */}
        <text
          x="55"
          y="30"
          fontFamily="Arial, sans-serif"
          fontSize="19"
          fontWeight="800"
          fill="#FFFFFF"
          letterSpacing="0.06em"
        >
          FUNDED
        </text>
        <text
          x="132"
          y="30"
          fontFamily="Arial, sans-serif"
          fontSize="19"
          fontWeight="800"
          fill="#34D399"
          letterSpacing="0.06em"
        >
          NG
        </text>
      </svg>
    </div>
  );
}

export function CertificateCard({ cert }: { cert: Certificate }) {
  const isPayout = cert.kind === "payout";
  const cardRef = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState(false);

  const safeName = cert.full_name.replace(/[^a-z0-9]+/gi, "_").toLowerCase();
  const filename = `fundedng-${cert.kind}-${safeName}-${cert.certificate_number}`;

  const dateStr = new Date(cert.issued_at).toLocaleDateString("en-NG", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const renderCanvas = async () => {
    const node = cardRef.current;
    if (!node) throw new Error("Card not ready");
    const { toPng } = await import("html-to-image");
    return toPng(node, {
      pixelRatio: 2,
      backgroundColor: isPayout ? "#000000" : "#020806",
      cacheBust: true,
    });
  };

  const downloadPng = async () => {
    setExporting(true);
    try {
      const dataUrl = await renderCanvas();
      const link = document.createElement("a");
      link.download = `${filename}.png`;
      link.href = dataUrl;
      link.click();
      toast.success("Certificate downloaded");
    } catch (e) {
      console.error(e);
      toast.error("Could not export certificate");
    } finally {
      setExporting(false);
    }
  };

  const downloadPdf = async () => {
    setExporting(true);
    try {
      const dataUrl = await renderCanvas();
      const img = new Image();
      img.src = dataUrl;
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("image load failed"));
      });
      const { jsPDF } = await import("jspdf");
      // Both payout and funded certificates are square for visual consistency.
      const widthMm = 152;
      const heightMm = 152;
      const pdf = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: [widthMm, heightMm],
      });
      pdf.addImage(dataUrl, "PNG", 0, 0, widthMm, heightMm);
      pdf.save(`${filename}.pdf`);
      toast.success("Certificate PDF saved");
    } catch (e) {
      console.error(e);
      toast.error("Could not export PDF");
    } finally {
      setExporting(false);
    }
  };

  // Brand dark-green & black palette. Payout = brighter emerald, Funded = deep brand green.
  const accent = isPayout ? "#34D399" : "#10B981";
  const accentDeep = "#065F46";
  const accentSoft = isPayout
    ? "rgba(52,211,153,0.35)"
    : "rgba(16,185,129,0.30)";

  const payoutAmount = cert.payout_amount ?? 0;
  const amountNumeric = new Intl.NumberFormat("en-NG", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(payoutAmount);

  if (isPayout) {
    const amountWords = numberToWords(Math.round(payoutAmount));
    return (
      <div className="space-y-3">
        <div
          ref={cardRef}
          className="relative mx-auto flex w-full flex-col overflow-hidden rounded-2xl text-white aspect-square max-w-[540px]"
          style={{
            background:
              "radial-gradient(ellipse at 50% -10%, #0b2a20 0%, #050f0c 45%, #000000 100%)",
            boxShadow: `inset 0 0 0 1px rgba(52,211,153,0.10)`,
          }}
        >
          {/* Subtle emerald grid texture */}
          <svg
            className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.12]"
            aria-hidden="true"
          >
            <defs>
              <pattern id={`pgrid-${cert.id}`} width="22" height="22" patternUnits="userSpaceOnUse">
                <path d="M22 0 L 0 0 0 22" fill="none" stroke={accent} strokeWidth="0.4" />
              </pattern>
              <radialGradient id={`pfade-${cert.id}`} cx="50%" cy="0%" r="80%">
                <stop offset="0%" stopColor="white" stopOpacity="1" />
                <stop offset="100%" stopColor="white" stopOpacity="0" />
              </radialGradient>
              <mask id={`pmask-${cert.id}`}>
                <rect width="100%" height="100%" fill={`url(#pfade-${cert.id})`} />
              </mask>
            </defs>
            <rect width="100%" height="100%" fill={`url(#pgrid-${cert.id})`} mask={`url(#pmask-${cert.id})`} />
          </svg>

          {/* Ornate double-line frame */}
          <div
            className="pointer-events-none absolute inset-3 rounded-lg"
            style={{
              border: `1.5px solid ${accent}`,
              boxShadow: `0 0 0 1px rgba(0,0,0,0.6) inset, 0 0 24px ${accentSoft} inset`,
            }}
          />
          <div
            className="pointer-events-none absolute inset-5 rounded-md border"
            style={{ borderColor: accentDeep, borderWidth: 1 }}
          />

          {/* Decorative corner brackets */}
          {[
            "left-3 top-3",
            "right-3 top-3 rotate-90",
            "right-3 bottom-3 rotate-180",
            "left-3 bottom-3 -rotate-90",
          ].map((pos) => (
            <svg
              key={pos}
              className={`pointer-events-none absolute h-12 w-12 ${pos}`}
              viewBox="0 0 48 48"
              fill="none"
              aria-hidden="true"
            >
              <path d="M2 18 V2 H18" stroke={accent} strokeWidth="2" />
              <path d="M6 22 V6 H22" stroke={accentSoft} strokeWidth="1" />
            </svg>
          ))}

          {/* Header */}
          <div className="relative pt-6 text-center sm:pt-7">
            <div className="font-display text-lg font-black tracking-[0.15em] sm:text-xl">
              FUNDED<span style={{ color: accent }}>NG</span>
            </div>
            <div
              className="mt-1 text-[7px] font-semibold uppercase tracking-[0.35em] sm:text-[9px]"
              style={{ color: accent }}
            >
              Nigeria's Prop Trading Firm
            </div>
          </div>

          {/* Title block */}
          <div className="relative mt-2 px-6 text-center sm:px-8">
            <div className="font-display text-2xl font-black uppercase leading-none tracking-tight text-white sm:text-4xl">
              PAYOUT
            </div>
            <div
              className="font-display mt-1 text-xs font-bold uppercase tracking-[0.25em] sm:text-sm"
              style={{ color: accent }}
            >
              Certificate of Withdrawal
            </div>
          </div>

          {/* Recipient */}
          <div className="relative mt-3 px-6 text-center sm:px-8">
            <div className="text-[8px] font-semibold uppercase tracking-[0.3em] text-white/85 sm:text-[10px]">
              Proudly Paid To
            </div>
            <div
              className="mt-1 truncate text-xl sm:text-3xl"
              style={{
                fontFamily: "'Pinyon Script', 'Great Vibes', cursive",
                color: accent,
                lineHeight: 1.1,
              }}
            >
              {cert.full_name}
            </div>
            <div
              className="mx-auto mt-1 h-px w-3/4"
              style={{ background: `linear-gradient(to right, transparent, ${accent}, transparent)` }}
            />
          </div>

          {/* Amount */}
          <div className="relative mt-3 px-6 text-center sm:px-8">
            <div className="text-[7px] font-semibold uppercase tracking-[0.3em] text-white/70 sm:text-[9px]">
              Amount Paid Out
            </div>
            <div className="mt-1 flex items-baseline justify-center font-display text-2xl font-black tracking-tight sm:text-4xl">
              <span style={{ color: accent }}>₦</span>
              <span className="text-white">{amountNumeric}</span>
            </div>
            <div className="mt-0.5 truncate text-[8px] italic text-white/70 sm:text-[10px]">
              {amountWords} Naira Only
            </div>
          </div>

          {/* Stats row */}
          <div className="relative mt-3 grid grid-cols-3 gap-2 px-6 text-center sm:px-8">
            {[
              {
                v:
                  cert.account_size >= 1000
                    ? `₦${Math.round(cert.account_size / 1000)}K`
                    : formatNaira(cert.account_size),
                l: "Account Size",
              },
              { v: cert.mt5_login, l: "MT5 Login" },
              { v: dateStr.split(" ").slice(0, 2).join(" "), l: "Date Paid" },
            ].map((s) => (
              <div key={s.l}>
                <div
                  className="font-display truncate text-xs font-black sm:text-sm"
                  style={{ color: accent }}
                >
                  {s.v}
                </div>
                <div className="mt-0.5 text-[7px] uppercase tracking-wider text-white/70 sm:text-[9px]">
                  {s.l}
                </div>
              </div>
            ))}
          </div>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Footer: signature + cert id */}
          <div className="relative mb-5 px-6 sm:px-8">
            <div className="flex items-end justify-between gap-4">
              <div>
                <div
                  className="text-xl text-white sm:text-2xl"
                  style={{
                    fontFamily: "'Pinyon Script', 'Great Vibes', cursive",
                    lineHeight: 1,
                  }}
                >
                  Byemi
                </div>
                <div className="mt-1 h-px w-24" style={{ background: accent }} />
                <div
                  className="font-display mt-1 text-[7px] font-bold tracking-[0.2em] sm:text-[9px]"
                  style={{ color: accent }}
                >
                  CEO, FUNDEDNG
                </div>
              </div>

              <div className="text-right">
                <div
                  className="font-display text-[7px] font-bold uppercase tracking-[0.25em] sm:text-[9px]"
                  style={{ color: accent }}
                >
                  Certificate No
                </div>
                <div className="mt-1 font-mono text-[9px] text-white sm:text-[11px]">
                  {cert.certificate_number}
                </div>
                <div className="mt-1 truncate font-mono text-[7px] text-white/60 sm:text-[9px]">
                  {cert.challenge_name}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-end">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline" disabled={exporting}>
                <Download className="mr-1 h-4 w-4" />
                {exporting ? "Exporting…" : "Download"}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={downloadPdf}>
                <FileText className="mr-2 h-4 w-4" /> PDF (1080×1080)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={downloadPng}>
                <FileImage className="mr-2 h-4 w-4" /> PNG image
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    );
  }

  // FUNDED certificate (original ornate design)
  return (
    <div className="space-y-3">
      <div
        ref={cardRef}
        className="relative mx-auto flex w-full flex-col overflow-hidden rounded-2xl text-white aspect-square max-w-[540px]"
        style={{
          background:
            "radial-gradient(ellipse at 50% -10%, #0b2a20 0%, #061812 40%, #020806 100%)",
          boxShadow: `inset 0 0 0 1px rgba(16,185,129,0.08)`,
        }}
      >
        {/* Subtle emerald grid texture */}
        <svg
          className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.12]"
          aria-hidden="true"
        >
          <defs>
            <pattern id={`grid-${cert.id}`} width="22" height="22" patternUnits="userSpaceOnUse">
              <path d="M22 0 L 0 0 0 22" fill="none" stroke={accent} strokeWidth="0.4" />
            </pattern>
            <radialGradient id={`fade-${cert.id}`} cx="50%" cy="0%" r="80%">
              <stop offset="0%" stopColor="white" stopOpacity="1" />
              <stop offset="100%" stopColor="white" stopOpacity="0" />
            </radialGradient>
            <mask id={`mask-${cert.id}`}>
              <rect width="100%" height="100%" fill={`url(#fade-${cert.id})`} />
            </mask>
          </defs>
          <rect width="100%" height="100%" fill={`url(#grid-${cert.id})`} mask={`url(#mask-${cert.id})`} />
        </svg>

        {/* Outer ornate double-line frame */}
        <div
          className="pointer-events-none absolute inset-3 rounded-lg"
          style={{
            border: `1.5px solid ${accent}`,
            boxShadow: `0 0 0 1px rgba(0,0,0,0.6) inset, 0 0 24px ${accentSoft} inset`,
          }}
        />
        <div
          className="pointer-events-none absolute inset-5 rounded-md border"
          style={{ borderColor: accentDeep, borderWidth: 1 }}
        />

        {/* Decorative corner brackets */}
        {[
          "left-3 top-3",
          "right-3 top-3 rotate-90",
          "right-3 bottom-3 rotate-180",
          "left-3 bottom-3 -rotate-90",
        ].map((pos) => (
          <svg
            key={pos}
            className={`pointer-events-none absolute h-12 w-12 ${pos}`}
            viewBox="0 0 48 48"
            fill="none"
            aria-hidden="true"
          >
            <path d="M2 18 V2 H18" stroke={accent} strokeWidth="2" />
            <path d="M6 22 V6 H22" stroke={accentSoft} strokeWidth="1" />
          </svg>
        ))}

        {/* Header */}
        <div className="relative pt-6 text-center sm:pt-8">
          <div className="font-display text-lg font-black tracking-[0.15em] sm:text-xl">
            FUNDED<span style={{ color: accent }}>NG</span>
          </div>
          <div
            className="mt-1 text-[7px] font-semibold uppercase tracking-[0.35em] sm:text-[9px]"
            style={{ color: accent }}
          >
            Nigeria's Prop Trading Firm
          </div>
        </div>

        {/* Title block */}
        <div className="relative mt-3 px-6 text-center sm:px-8">
          <div className="font-display text-3xl font-black uppercase leading-none tracking-tight text-white sm:text-5xl">
            FUNDED
          </div>
          <div
            className="font-display mt-1 text-sm font-bold uppercase tracking-[0.25em] sm:text-base"
            style={{ color: accent }}
          >
            Trader Certificate
          </div>
        </div>

        {/* Recipient */}
        <div className="relative mt-4 px-6 text-center sm:px-8">
          <div className="text-[8px] font-semibold uppercase tracking-[0.3em] text-white/85 sm:text-[11px]">
            This Certifies That
          </div>
          <div
            className="mt-1 text-2xl sm:text-4xl"
            style={{
              fontFamily: "'Pinyon Script', 'Great Vibes', cursive",
              color: accent,
              lineHeight: 1.1,
            }}
          >
            {cert.full_name}
          </div>
          <div
            className="mx-auto mt-1 h-px w-3/4"
            style={{ background: `linear-gradient(to right, transparent, ${accent}, transparent)` }}
          />
        </div>

        <p className="relative mt-3 px-6 text-center text-[10px] leading-snug text-white/85 sm:px-8 sm:text-[11px]">
          has successfully passed all evaluation phases
          <br />
          and is now a funded trader of FundedNG.
        </p>

        {/* Stats row */}
        <div className="relative mt-3 grid grid-cols-4 gap-2 px-6 text-center sm:px-8">
          {[
            { v: "24h", l: "Payouts" },
            { v: "80%", l: "Profit Split" },
            { v: "3", l: "Simple Rules" },
            { v: formatNaira(cert.account_size), l: "Account Size" },
          ].map((s) => (
            <div key={s.l}>
              <div
                className="font-display text-sm font-black sm:text-lg"
                style={{ color: accent }}
              >
                {s.v}
              </div>
              <div className="mt-0.5 text-[7px] uppercase tracking-wider text-white/70 sm:text-[9px]">
                {s.l}
              </div>
            </div>
          ))}
        </div>

        {/* Spacer to push footer down */}
        <div className="flex-1" />

        {/* Footer: signature + cert id */}
        <div className="relative mb-5 px-6 sm:px-8">
          <div className="flex items-end justify-between gap-4">
            <div>
              <div
                className="text-xl text-white sm:text-2xl"
                style={{
                  fontFamily: "'Pinyon Script', 'Great Vibes', cursive",
                  lineHeight: 1,
                }}
              >
                Byemi
              </div>
              <div
                className="mt-1 h-px w-24"
                style={{ background: accent }}
              />
              <div
                className="font-display mt-1 text-[7px] font-bold tracking-[0.2em] sm:text-[9px]"
                style={{ color: accent }}
              >
                CEO, FUNDEDNG
              </div>
            </div>

            <div className="text-right">
              <div
                className="font-display text-[7px] font-bold uppercase tracking-[0.25em] sm:text-[9px]"
                style={{ color: accent }}
              >
                Date
              </div>
              <div className="mt-1 font-mono text-[9px] text-white sm:text-[11px]">
                {dateStr}
              </div>
              <div className="mt-1 font-mono text-[7px] text-white/60 sm:text-[9px]">
                {cert.certificate_number}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="outline" disabled={exporting}>
              <Download className="mr-1 h-4 w-4" />
              {exporting ? "Exporting…" : "Download"}
              </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={downloadPdf}>
              <FileText className="mr-2 h-4 w-4" /> PDF (1080×1080)
            </DropdownMenuItem>
            <DropdownMenuItem onClick={downloadPng}>
              <FileImage className="mr-2 h-4 w-4" /> PNG image
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
