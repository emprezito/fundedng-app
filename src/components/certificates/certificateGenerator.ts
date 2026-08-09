/**
 * FundedNG Certificate Generator
 * Generates printable HTML certificates for:
 * - Funded Trader (on approveFunded)
 * - Payout (on updatePayout status=paid)
 *
 * Usage:
 *   generateFundedCertificate({ traderName, date, accountSize })
 *   generatePayoutCertificate({ traderName, amount, date, method, certId })
 *
 * Both functions open a new window with the certificate ready to print/save as PDF.
 */

function numberToWords(n: number): string {
  if (n === 0) return "Zero";
  const ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
    "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen",
    "Seventeen", "Eighteen", "Nineteen"];
  const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
  const thousands = ["", "Thousand", "Million", "Billion"];

  function chunkToWords(num: number): string {
    if (num === 0) return "";
    if (num < 20) return ones[num] + " ";
    if (num < 100) return tens[Math.floor(num / 10)] + (num % 10 ? " " + ones[num % 10] : "") + " ";
    return ones[Math.floor(num / 100)] + " Hundred " + chunkToWords(num % 100);
  }

  let result = "";
  let i = 0;
  while (n > 0) {
    const chunk = n % 1000;
    if (chunk !== 0) {
      result = chunkToWords(chunk) + (thousands[i] ? thousands[i] + " " : "") + result;
    }
    n = Math.floor(n / 1000);
    i++;
  }
  return result.trim() + " Naira Only";
}

function formatNairaAmount(amount: number): string {
  return "₦" + amount.toLocaleString("en-NG");
}

function getCertStyles(): string {
  return `
    @import url('https://fonts.googleapis.com/css2?family=Great+Vibes&family=Cinzel:wght@400;600;700;900&family=Montserrat:wght@300;400;500;600;700;800;900&display=swap');
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { background: #fff; display: flex; justify-content: center; align-items: flex-start; padding: 0; }

    .certificate {
      width: 794px;
      min-height: 1123px;
      position: relative;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      align-items: center;
      font-family: 'Montserrat', sans-serif;
    }

    /* ── FUNDED ── */
    .funded { background: #0a1f0f; }
    .funded .bg-glow {
      position: absolute; inset: 0;
      background:
        radial-gradient(ellipse 60% 40% at 50% 0%, rgba(0,180,60,0.18) 0%, transparent 70%),
        radial-gradient(ellipse 40% 30% at 0% 50%, rgba(0,140,40,0.10) 0%, transparent 60%),
        radial-gradient(ellipse 40% 30% at 100% 50%, rgba(0,140,40,0.10) 0%, transparent 60%);
      pointer-events: none;
    }
    .funded .border-outer {
      position: absolute; inset: 12px;
      border: 1.5px solid rgba(0,200,70,0.5); border-radius: 2px;
      box-shadow: 0 0 20px rgba(0,200,70,0.15), inset 0 0 20px rgba(0,200,70,0.05);
      pointer-events: none;
    }
    .funded .border-inner { position: absolute; inset: 20px; border: 0.5px solid rgba(0,200,70,0.25); border-radius: 1px; pointer-events: none; }

    /* ── PAYOUT ── */
    .payout { background: #0d0d0d; }
    .payout .bg-waves {
      position: absolute; inset: 0;
      background:
        radial-gradient(ellipse 80% 60% at 50% -10%, rgba(212,168,67,0.12) 0%, transparent 60%),
        radial-gradient(ellipse 60% 80% at -10% 50%, rgba(212,168,67,0.06) 0%, transparent 50%),
        radial-gradient(ellipse 60% 80% at 110% 50%, rgba(212,168,67,0.06) 0%, transparent 50%);
      pointer-events: none;
    }
    .wave-lines { position: absolute; top: 0; right: 0; width: 280px; height: 280px; opacity: 0.15; pointer-events: none; }
    .wave-lines-bl { position: absolute; bottom: 0; left: 0; width: 280px; height: 280px; opacity: 0.15; transform: rotate(180deg); pointer-events: none; }
    .payout .border-outer {
      position: absolute; inset: 12px;
      border: 2px solid rgba(212,168,67,0.6); border-radius: 2px;
      box-shadow: 0 0 30px rgba(212,168,67,0.1), inset 0 0 30px rgba(212,168,67,0.03);
      pointer-events: none;
    }
    .payout .border-inner { position: absolute; inset: 20px; border: 0.5px solid rgba(212,168,67,0.2); border-radius: 1px; pointer-events: none; }

    /* Corners */
    .corner { position: absolute; width: 48px; height: 48px; }
    .corner svg { width: 100%; height: 100%; }
    .corner-tl { top: 14px; left: 14px; }
    .corner-tr { top: 14px; right: 14px; transform: scaleX(-1); }
    .corner-bl { bottom: 14px; left: 14px; transform: scaleY(-1); }
    .corner-br { bottom: 14px; right: 14px; transform: scale(-1); }

    /* Shared text styles */
    .brand-name { font-family: 'Montserrat', sans-serif; font-weight: 900; font-size: 28px; letter-spacing: 3px; color: #ffffff; text-align: center; }
    .brand-name span { color: #1ec97e; }
    .brand-tagline { font-family: 'Montserrat', sans-serif; font-weight: 600; font-size: 9px; letter-spacing: 4px; margin-top: 2px; text-align: center; }
    .green-tag { color: #1ec97e; }
    .gold-tag { color: #d4a843; }

    .divider-line { display: flex; align-items: center; gap: 10px; margin: 18px 0 16px; width: 100%; justify-content: center; }
    .divider-line .line { height: 1px; width: 80px; background: linear-gradient(90deg, transparent, #1ec97e, transparent); }
    .divider-line .chart-icon { color: #1ec97e; font-size: 18px; }

    .cert-main-title { font-family: 'Cinzel', serif; font-weight: 900; font-size: 62px; color: #ffffff; letter-spacing: 4px; line-height: 1; text-align: center; }
    .cert-main-title.green-glow { text-shadow: 0 0 40px rgba(30,201,126,0.3); }
    .cert-main-title.gold-glow { text-shadow: 0 0 40px rgba(212,168,67,0.2); }
    .cert-sub-title { font-family: 'Cinzel', serif; font-weight: 600; font-size: 22px; letter-spacing: 8px; margin-top: 6px; text-align: center; }

    .label-small { font-family: 'Montserrat', sans-serif; font-weight: 500; font-size: 11px; letter-spacing: 4px; color: rgba(255,255,255,0.6); text-transform: uppercase; }

    .trader-name { font-family: 'Great Vibes', cursive; font-size: 68px; color: #d4a843; text-align: center; margin-top: 8px; line-height: 1.1; text-shadow: 0 2px 20px rgba(212,168,67,0.4); }

    .cert-description { font-family: 'Montserrat', sans-serif; font-weight: 400; font-size: 13px; color: rgba(255,255,255,0.75); text-align: center; line-height: 1.8; margin-top: 16px; max-width: 440px; }

    /* Stats */
    .stats-row { display: flex; gap: 50px; margin-top: 32px; align-items: flex-start; }
    .stat-item { display: flex; flex-direction: column; align-items: center; gap: 4px; }
    .stat-icon { width: 32px; height: 32px; border: 1.5px solid rgba(30,201,126,0.5); border-radius: 50%; display: flex; align-items: center; justify-content: center; color: #1ec97e; font-size: 14px; margin-bottom: 4px; }
    .stat-value { font-family: 'Montserrat', sans-serif; font-weight: 800; font-size: 16px; color: #ffffff; letter-spacing: 1px; }
    .stat-label { font-family: 'Montserrat', sans-serif; font-weight: 400; font-size: 9px; color: rgba(255,255,255,0.5); letter-spacing: 1px; text-transform: uppercase; }

    /* Ribbon */
    .ribbon-section { position: relative; width: 100%; margin-top: 36px; height: 80px; display: flex; align-items: center; justify-content: center; }
    .ribbon-left { position: absolute; top: 12px; left: 0; height: 56px; width: 48%; background: linear-gradient(180deg, #1a7a3c 0%, #0f5a28 50%, #1a7a3c 100%); clip-path: polygon(0 0, 100% 0, 95% 50%, 100% 100%, 0 100%); }
    .ribbon-right { position: absolute; top: 12px; right: 0; height: 56px; width: 48%; background: linear-gradient(180deg, #1a7a3c 0%, #0f5a28 50%, #1a7a3c 100%); clip-path: polygon(0 0, 100% 0, 100% 100%, 5% 100%, 0 50%); }
    .medal { position: relative; z-index: 3; width: 80px; height: 80px; border-radius: 50%; background: linear-gradient(135deg, #2a2a2a 0%, #1a1a1a 50%, #2a2a2a 100%); border: 3px solid #d4a843; box-shadow: 0 0 0 2px rgba(212,168,67,0.3), 0 4px 20px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.1); display: flex; align-items: center; justify-content: center; }
    .medal-inner { width: 58px; height: 58px; border-radius: 50%; border: 1px solid rgba(212,168,67,0.4); display: flex; align-items: center; justify-content: center; color: #1ec97e; font-size: 26px; }

    /* Signature */
    .sig-row { display: flex; justify-content: space-between; align-items: flex-end; width: 100%; margin-top: 30px; padding: 0 20px; }
    .sig-block { display: flex; flex-direction: column; align-items: flex-start; }
    .sig-script { font-family: 'Great Vibes', cursive; font-size: 38px; color: rgba(255,255,255,0.85); line-height: 1; }
    .sig-line { width: 130px; height: 1px; background: rgba(255,255,255,0.3); margin-top: 4px; }
    .sig-label { font-family: 'Montserrat', sans-serif; font-weight: 600; font-size: 9px; letter-spacing: 1px; color: rgba(255,255,255,0.5); margin-top: 4px; text-transform: uppercase; }
    .date-block { text-align: right; }
    .date-label { font-family: 'Montserrat', sans-serif; font-weight: 700; font-size: 9px; letter-spacing: 2px; color: #d4a843; text-transform: uppercase; }
    .date-value { font-family: 'Montserrat', sans-serif; font-weight: 600; font-size: 13px; color: #ffffff; margin-top: 4px; }

    /* Payout box */
    .payout-box { width: 100%; max-width: 500px; background: rgba(30,201,126,0.08); border: 1.5px solid rgba(30,201,126,0.4); border-radius: 4px; padding: 20px 32px; text-align: center; margin-top: 28px; }
    .payout-box-label { font-family: 'Montserrat', sans-serif; font-weight: 700; font-size: 9px; letter-spacing: 4px; color: #1ec97e; text-transform: uppercase; }
    .payout-amount { font-family: 'Montserrat', sans-serif; font-weight: 900; font-size: 52px; color: #1ec97e; line-height: 1.1; margin-top: 4px; text-shadow: 0 0 30px rgba(30,201,126,0.4); letter-spacing: -1px; }
    .payout-amount-text { font-family: 'Montserrat', sans-serif; font-weight: 400; font-size: 11px; color: rgba(255,255,255,0.6); margin-top: 6px; font-style: italic; }

    .payout-meta-row { display: flex; margin-top: 24px; width: 100%; max-width: 500px; border: 1px solid rgba(255,255,255,0.1); }
    .payout-meta-item { flex: 1; padding: 14px 20px; text-align: center; }
    .payout-meta-item:first-child { border-right: 1px solid rgba(255,255,255,0.1); }
    .payout-meta-label { font-family: 'Montserrat', sans-serif; font-weight: 700; font-size: 8px; letter-spacing: 3px; color: #d4a843; text-transform: uppercase; }
    .payout-meta-value { font-family: 'Montserrat', sans-serif; font-weight: 600; font-size: 14px; color: #ffffff; margin-top: 6px; }

    /* Seal */
    .seal { position: relative; width: 90px; height: 90px; margin-top: 20px; }
    .seal-outer { width: 90px; height: 90px; border-radius: 50%; background: conic-gradient(#d4a843 0deg, #f0c84a 30deg, #d4a843 60deg, #b8962e 90deg, #d4a843 120deg, #f0c84a 150deg, #d4a843 180deg, #b8962e 210deg, #d4a843 240deg, #f0c84a 270deg, #d4a843 300deg, #b8962e 330deg, #d4a843 360deg); display: flex; align-items: center; justify-content: center; box-shadow: 0 0 20px rgba(212,168,67,0.4); }
    .seal-inner { width: 72px; height: 72px; border-radius: 50%; background: linear-gradient(135deg, #1a1200 0%, #2a1e00 100%); border: 2px solid #d4a843; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; }
    .seal-verified { font-family: 'Montserrat', sans-serif; font-weight: 800; font-size: 7px; letter-spacing: 2px; color: #d4a843; text-transform: uppercase; }
    .seal-check { font-size: 20px; color: #d4a843; line-height: 1; }
    .seal-brand { font-family: 'Montserrat', sans-serif; font-weight: 700; font-size: 6px; letter-spacing: 1.5px; color: #d4a843; text-transform: uppercase; }

    .payout-sig-row { display: flex; justify-content: space-between; align-items: flex-end; width: 100%; margin-top: 24px; padding: 0 20px; }
    .cert-id-block { text-align: right; }
    .cert-id-label { font-family: 'Montserrat', sans-serif; font-weight: 700; font-size: 9px; letter-spacing: 2px; color: #d4a843; text-transform: uppercase; }
    .cert-id-value { font-family: monospace; font-weight: 600; font-size: 12px; color: rgba(255,255,255,0.8); margin-top: 4px; letter-spacing: 1px; }

    .congrats-text { font-family: 'Montserrat', sans-serif; font-weight: 700; font-size: 13px; color: #1ec97e; margin-top: 16px; text-align: center; }
    .congrats-sub { font-family: 'Montserrat', sans-serif; font-weight: 400; font-size: 13px; color: rgba(255,255,255,0.7); text-align: center; margin-top: 4px; }

    /* Laurel */
    .laurel-wrap { position: relative; display: flex; align-items: center; justify-content: center; margin-top: 52px; margin-bottom: 6px; }
    .laurel-icon { font-size: 56px; line-height: 1; color: #d4a843; position: relative; z-index: 2; filter: drop-shadow(0 0 12px rgba(212,168,67,0.5)); }

    /* Content wrappers */
    .funded-content { position: relative; z-index: 2; width: 100%; display: flex; flex-direction: column; align-items: center; padding: 52px 80px 50px; }
    .payout-content { position: relative; z-index: 2; width: 100%; display: flex; flex-direction: column; align-items: center; padding: 0 80px 50px; }

    @media print {
      body { margin: 0; padding: 0; }
      .no-print { display: none !important; }
      .certificate { page-break-after: avoid; }
    }
  `;
}

function cornerSVG(color: string): string {
  return `<svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M4 44 L4 4 L44 4" stroke="${color}" stroke-width="1.5" fill="none" opacity="0.8"/>
    <path d="M4 36 L4 4 L36 4" stroke="${color}" stroke-width="0.5" fill="none" opacity="0.4"/>
    <circle cx="4" cy="4" r="2" fill="${color}" opacity="0.8"/>
  </svg>`;
}

function waveSVG(): string {
  return `<svg class="wave-lines" viewBox="0 0 280 280" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M280 0 Q200 80 280 160" stroke="#d4a843" stroke-width="0.8" fill="none"/>
    <path d="M280 20 Q190 100 280 180" stroke="#d4a843" stroke-width="0.6" fill="none"/>
    <path d="M280 40 Q180 120 280 200" stroke="#d4a843" stroke-width="0.5" fill="none"/>
    <path d="M280 60 Q170 140 280 220" stroke="#d4a843" stroke-width="0.4" fill="none"/>
    <path d="M260 0 Q180 80 260 160" stroke="#d4a843" stroke-width="0.6" fill="none"/>
    <path d="M240 0 Q160 80 240 160" stroke="#d4a843" stroke-width="0.4" fill="none"/>
    <path d="M220 0 Q140 80 220 140" stroke="#d4a843" stroke-width="0.3" fill="none"/>
  </svg>
  <svg class="wave-lines-bl" viewBox="0 0 280 280" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M280 0 Q200 80 280 160" stroke="#d4a843" stroke-width="0.8" fill="none"/>
    <path d="M280 20 Q190 100 280 180" stroke="#d4a843" stroke-width="0.6" fill="none"/>
    <path d="M280 40 Q180 120 280 200" stroke="#d4a843" stroke-width="0.5" fill="none"/>
    <path d="M280 60 Q170 140 280 220" stroke="#d4a843" stroke-width="0.4" fill="none"/>
  </svg>`;
}

// ── FUNDED TRADER CERTIFICATE ─────────────────────────────────────────────────
export function generateFundedCertificate(opts: {
  traderName: string;
  date: string;
  accountSize: number;
}) {
  const { traderName, date, accountSize } = opts;
  const maxFunding = formatNairaAmount(accountSize * 2);

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Funded Trader Certificate — ${traderName}</title>
<style>${getCertStyles()}</style>
</head>
<body>
<div class="certificate funded">
  <div class="bg-glow"></div>
  <div class="border-outer"></div>
  <div class="border-inner"></div>
  <div class="corner corner-tl">${cornerSVG("#1ec97e")}</div>
  <div class="corner corner-tr">${cornerSVG("#1ec97e")}</div>
  <div class="corner corner-bl">${cornerSVG("#1ec97e")}</div>
  <div class="corner corner-br">${cornerSVG("#1ec97e")}</div>

  <div class="funded-content">
    <div class="brand-name">FUNDED<span>NG</span></div>
    <div class="brand-tagline green-tag">NIGERIA'S PROP TRADING FIRM</div>

    <div class="divider-line">
      <div class="line"></div>
      <div class="chart-icon">📊</div>
      <div class="line"></div>
    </div>

    <div class="cert-main-title green-glow">FUNDED</div>
    <div class="cert-sub-title green-tag">TRADER CERTIFICATE</div>

    <div class="label-small" style="margin-top:28px;">This Certifies That</div>
    <div class="trader-name">${traderName}</div>

    <div class="cert-description">
      has successfully passed all evaluation phases<br>
      and is now a funded trader of FundedNG.<br>
      You have proven your skill, discipline, and<br>
      consistency. We are proud to have you<br>
      on our team.
    </div>

    <div class="stats-row">
      <div class="stat-item">
        <div class="stat-icon">🕐</div>
        <div class="stat-value">24h</div>
        <div class="stat-label">Payouts</div>
      </div>
      <div class="stat-item">
        <div class="stat-icon">📊</div>
        <div class="stat-value">80%</div>
        <div class="stat-label">Profit Split</div>
      </div>
      <div class="stat-item">
        <div class="stat-icon">📋</div>
        <div class="stat-value">3</div>
        <div class="stat-label">Simple Rules</div>
      </div>
      <div class="stat-item">
        <div class="stat-icon">💰</div>
        <div class="stat-value">${maxFunding}</div>
        <div class="stat-label">Max Funding</div>
      </div>
    </div>

    <div class="ribbon-section">
      <div class="ribbon-left"></div>
      <div class="ribbon-right"></div>
      <div class="medal"><div class="medal-inner">📊</div></div>
    </div>

    <div class="sig-row">
      <div class="sig-block">
        <div class="sig-script">Pauloma</div>
        <div class="sig-line"></div>
        <div class="sig-label">CEO, FundedNG</div>
      </div>
      <div class="date-block">
        <div class="date-label">Date</div>
        <div class="date-value">${date}</div>
      </div>
    </div>
  </div>
</div>

<script>
  window.onload = () => window.print();
</script>
</body>
</html>`;

  const win = window.open("", "_blank");
  if (win) {
    win.document.write(html);
    win.document.close();
  }
}

// ── PAYOUT CERTIFICATE ────────────────────────────────────────────────────────
export function generatePayoutCertificate(opts: {
  traderName: string;
  amount: number;
  date: string;
  method: string;
  payoutId: string;
}) {
  const { traderName, amount, date, method, payoutId } = opts;
  const amountFormatted = formatNairaAmount(amount);
  const amountWords = numberToWords(amount);
  const certId = `PAYOUT-${new Date(date).getFullYear()}-${payoutId.slice(-6).toUpperCase()}`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Payout Certificate — ${traderName}</title>
<style>${getCertStyles()}</style>
</head>
<body>
<div class="certificate payout">
  <div class="bg-waves"></div>
  ${waveSVG()}
  <div class="border-outer"></div>
  <div class="border-inner"></div>
  <div class="corner corner-tl">${cornerSVG("#d4a843")}</div>
  <div class="corner corner-tr">${cornerSVG("#d4a843")}</div>
  <div class="corner corner-bl">${cornerSVG("#d4a843")}</div>
  <div class="corner corner-br">${cornerSVG("#d4a843")}</div>

  <div class="payout-content">
    <div class="brand-name" style="margin-top:52px;">FUNDED<span>NG</span></div>
    <div class="brand-tagline gold-tag">NIGERIA'S PROP TRADING FIRM</div>

    <div class="laurel-wrap">
      <div class="laurel-icon">🏆</div>
    </div>

    <div class="cert-main-title gold-glow">PAYOUT</div>
    <div class="cert-sub-title gold-tag">CERTIFICATE</div>

    <div class="label-small" style="margin-top:28px;">Proudly Presented To</div>
    <div class="trader-name">${traderName}</div>

    <div class="congrats-text">Congratulations!</div>
    <div class="congrats-sub">You have received a payout from FundedNG<br>for your outstanding performance.</div>

    <div class="payout-box">
      <div class="payout-box-label">Payout Amount</div>
      <div class="payout-amount">${amountFormatted}</div>
      <div class="payout-amount-text">${amountWords}</div>
    </div>

    <div class="payout-meta-row">
      <div class="payout-meta-item">
        <div class="payout-meta-label">Payout Date</div>
        <div class="payout-meta-value">${date}</div>
      </div>
      <div class="payout-meta-item">
        <div class="payout-meta-label">Payment Method</div>
        <div class="payout-meta-value">${method}</div>
      </div>
    </div>

    <div class="seal">
      <div class="seal-outer">
        <div class="seal-inner">
          <div class="seal-verified">Verified</div>
          <div class="seal-check">✓</div>
          <div class="seal-brand">FundedNG</div>
        </div>
      </div>
    </div>

    <div class="payout-sig-row">
      <div class="sig-block">
        <div class="sig-script">Pauloma</div>
        <div class="sig-line"></div>
        <div class="sig-label">CEO, FundedNG</div>
      </div>
      <div class="cert-id-block">
        <div class="cert-id-label">Certificate ID</div>
        <div class="cert-id-value">${certId}</div>
      </div>
    </div>
  </div>
</div>

<script>
  window.onload = () => window.print();
</script>
</body>
</html>`;

  const win = window.open("", "_blank");
  if (win) {
    win.document.write(html);
    win.document.close();
  }
}
