import {
  Document, Packer, Paragraph, TextRun, AlignmentType, HeadingLevel,
  Footer, Header, ImageRun, PageNumber,
  convertInchesToTwip, BorderStyle,
} from "docx";
import { readFileSync, writeFileSync } from "fs";

const GREEN = "10b981";
const DARK = "0a0a0a";
const GRAY = "6b7280";

const logoData = readFileSync("public/logo.png");

function heading(text, level = 1) {
  const sizes = { 1: 28, 2: 24, 3: 22 };
  return new Paragraph({
    heading: level === 1 ? HeadingLevel.HEADING_1 : level === 2 ? HeadingLevel.HEADING_2 : HeadingLevel.HEADING_3,
    spacing: { before: 360, after: 120 },
    children: [
      new TextRun({ text, bold: true, color: level === 1 ? GREEN : DARK, size: sizes[level], font: "Calibri" }),
    ],
  });
}

function para(text, opts = {}) {
  return new Paragraph({
    spacing: { after: opts.spacing || 120 },
    indent: opts.indent ? { left: convertInchesToTwip(opts.indent) } : undefined,
    alignment: opts.center ? AlignmentType.CENTER : undefined,
    children: [
      new TextRun({ text, bold: opts.bold, color: opts.color || DARK, size: opts.size || 22, font: "Calibri" }),
    ],
  });
}

function clause(num, text) {
  return new Paragraph({
    spacing: { after: 120 },
    children: [
      new TextRun({ text: num + ". ", bold: true, color: DARK, size: 22, font: "Calibri" }),
      new TextRun({ text, color: DARK, size: 22, font: "Calibri" }),
    ],
  });
}

function subClause(num, text) {
  return new Paragraph({
    spacing: { after: 100 },
    indent: { left: convertInchesToTwip(0.3) },
    children: [
      new TextRun({ text: num + " ", bold: true, color: GRAY, size: 21, font: "Calibri" }),
      new TextRun({ text, color: DARK, size: 21, font: "Calibri" }),
    ],
  });
}

function spacer() {
  return new Paragraph({ spacing: { after: 60 }, children: [] });
}

const doc = new Document({
  styles: {
    default: {
      document: {
        run: { font: "Calibri", size: 22, color: DARK },
      },
    },
  },
  sections: [
    {
      properties: {
        page: {
          margin: {
            top: convertInchesToTwip(1),
            bottom: convertInchesToTwip(1),
            left: convertInchesToTwip(1.2),
            right: convertInchesToTwip(1.2),
          },
        },
      },
      headers: {
        default: new Header({
          children: [
            new Paragraph({
              alignment: AlignmentType.RIGHT,
              children: [
                new ImageRun({ data: logoData, transformation: { width: 80, height: 30 }, type: "png" }),
              ],
            }),
          ],
        }),
      },
      footers: {
        default: new Footer({
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [
                new TextRun({ text: "FundedNG — ", color: GRAY, size: 18, font: "Calibri" }),
                new TextRun({ text: "fundedng.fun", color: GREEN, size: 18, font: "Calibri" }),
                new TextRun({ text: " — Confidential", color: GRAY, size: 18, font: "Calibri" }),
                new TextRun({ text: "    |    Page ", color: GRAY, size: 18, font: "Calibri" }),
                new TextRun({ children: [PageNumber.CURRENT], color: GRAY, size: 18, font: "Calibri" }),
              ],
            }),
          ],
        }),
      },
      children: [
        // Title
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 60 },
          children: [
            new ImageRun({ data: logoData, transformation: { width: 160, height: 60 }, type: "png" }),
          ],
        }),
        para("FUNDEDNG", { bold: true, color: GREEN, size: 36, center: true, spacing: 40 }),
        para("Brand Ambassador Partnership Agreement", { bold: true, size: 32, center: true, spacing: 300 }),
        para("\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501", { color: GREEN, size: 22, center: true, spacing: 600 }),

        // 1. Parties
        heading("1. PARTIES", 1),
        para("This Partnership Agreement (\"Agreement\") is entered into as of ________________ (\"Effective Date\") between:"),
        spacer(),
        para("FundedNG (\"the Firm\")", { bold: true, indent: 0.3 }),
        para("A prop trading firm registered in Nigeria", { indent: 0.3, size: 21 }),
        para("Principal Place of Business: ________________________________", { indent: 0.3, size: 21 }),
        para("Email: ________________________________", { indent: 0.3, size: 21 }),
        spacer(),
        para("AND", { bold: true, center: true }),
        spacer(),
        para("The Ambassador (\"the Ambassador\")", { bold: true, indent: 0.3 }),
        para("Full Name: ________________________________", { indent: 0.3, size: 21 }),
        para("Email: ________________________________", { indent: 0.3, size: 21 }),
        para("Phone: ________________________________", { indent: 0.3, size: 21 }),
        para("Social Media Handle(s): ________________________________", { indent: 0.3, size: 21 }),
        para("Follower Count: ________________________________", { indent: 0.3, size: 21 }),

        // 2. Purpose
        heading("2. PURPOSE", 1),
        clause("2.1", "This Agreement sets out the terms and conditions under which the Ambassador will promote FundedNG's trading challenge products and services in exchange for commissions, free challenge accounts, and other benefits as outlined herein."),

        // 3. Term
        heading("3. TERM", 1),
        clause("3.1", "This Agreement shall commence on the Effective Date and shall remain in effect for an initial period of three (3) months (\"Initial Term\")."),
        clause("3.2", "After the Initial Term, this Agreement shall automatically renew for successive one (1) month periods unless either party provides written notice of termination at least fourteen (14) days prior to the end of the then-current period."),

        // 4. Ambassador Obligations
        heading("4. AMBASSADOR OBLIGATIONS", 1),
        para("The Ambassador agrees to:"),
        subClause("4.1", "Create and publish a minimum of two (2) posts per month on their social media platforms mentioning or featuring FundedNG."),
        subClause("4.2", "Share their unique referral link/code with their audience to drive signups and challenge purchases."),
        subClause("4.3", "Host a 3x \u20A6200,000 account giveaway for their followers within the first 30 days of this Agreement, using giveaway content and instructions provided by FundedNG."),
        subClause("4.4", "Tag @FundedNG in all FundedNG-related content."),
        subClause("4.5", "Maintain a professional and positive representation of the FundedNG brand."),
        subClause("4.6", "Exclusivity: During the term of this Agreement, the Ambassador shall not promote, endorse, or represent any competing prop trading firm or similar service."),

        // 5. Firm Obligations
        heading("5. FIRM OBLIGATIONS", 1),
        para("FundedNG agrees to:"),
        subClause("5.1", "Provide the Ambassador with a free \u20A6400,000 2-Step Funded Challenge account within 48 hours of signing this Agreement."),
        subClause("5.2", "Provide the Ambassador with a free \u20A61,000,000 2-Step Funded Challenge account upon the Ambassador's fifth (5th) successful referral (as defined in Section 6.1)."),
        subClause("5.3", "Pay the Ambassador a 15% cash commission on every FundedNG challenge purchased through the Ambassador's unique referral link or discount code."),
        subClause("5.4", "Provide the Ambassador with an exclusive 15% discount code for their audience."),
        subClause("5.5", "Fund the 3x \u20A6200,000 account giveaway as outlined in Section 4.3."),
        subClause("5.6", "Provide the Ambassador with branded graphics and content templates to support their promotional efforts."),

        // 6. Commission Terms
        heading("6. COMMISSION TERMS", 1),
        clause("6.1", "\"Successful Referral\" is defined as a new user who signs up through the Ambassador's referral link or uses the Ambassador's discount code and completes a paid challenge purchase."),
        clause("6.2", "Commission is calculated at 15% of the challenge price (excluding taxes and fees)."),
        clause("6.3", "Commission payments are made weekly via bank transfer or USDT, within seven (7) days of the end of each calendar week."),
        clause("6.4", "A minimum payout threshold of \u20A65,000 applies. Amounts below this threshold will roll over to the next payment cycle."),
        clause("6.5", "The Ambassador is not entitled to commission on their own personal purchases."),
        clause("6.6", "FundedNG reserves the right to withhold commission payments in cases of suspected fraud, self-referral, or violation of this Agreement."),

        // 7. Challenge Accounts
        heading("7. CHALLENGE ACCOUNTS", 1),
        clause("7.1", "Challenge accounts provided under this Agreement are non-transferable and for the Ambassador's personal use only."),
        clause("7.2", "Challenge accounts are subject to FundedNG's standard trading rules and terms of service."),
        clause("7.3", "If the Ambassador breaches the trading rules on a provided challenge account, the account will be closed and no replacement will be provided."),
        clause("7.4", "Challenge accounts do not carry monetary value and cannot be exchanged for cash."),

        // 8. Giveaway
        heading("8. GIVEAWAY", 1),
        clause("8.1", "FundedNG will fund 3x \u20A6200,000 challenge accounts for the Ambassador to give away to their followers."),
        clause("8.2", "The Ambassador is responsible for running the giveaway on their platform using FundedNG-provided guidelines."),
        clause("8.3", "Giveaway winners must meet FundedNG's standard eligibility requirements (age, residency, etc.)."),
        clause("8.4", "The giveaway must be completed within thirty (30) days of the Effective Date."),

        // 9. Performance Incentive
        heading("9. PERFORMANCE INCENTIVE", 1),
        clause("9.1", "The Ambassador may be eligible for additional performance-based incentives based on referral volume and content quality, as mutually agreed upon by both parties during the term of this Agreement."),
        clause("9.2", "Specific performance incentive terms will be documented in writing and signed by both parties before taking effect."),

        // 10. Intellectual Property
        heading("10. INTELLECTUAL PROPERTY", 1),
        clause("10.1", "The Ambassador is granted a limited, non-exclusive license to use FundedNG's name, logo, and branding materials solely for the purpose of fulfilling their obligations under this Agreement."),
        clause("10.2", "All FundedNG branding materials remain the intellectual property of FundedNG and must be returned or cease to be used upon termination of this Agreement."),

        // 11. Termination
        heading("11. TERMINATION", 1),
        clause("11.1", "Either party may terminate this Agreement with fourteen (14) days written notice."),
        clause("11.2", "FundedNG may terminate this Agreement immediately if the Ambassador:"),
        subClause("(a)", "Violates the exclusivity clause (Section 4.6)"),
        subClause("(b)", "Engages in fraudulent activity"),
        subClause("(c)", "Damages the FundedNG brand reputation"),
        subClause("(d)", "Fails to meet minimum content obligations for two (2) consecutive months"),
        clause("11.3", "Upon termination, all unpaid commissions earned prior to termination will be paid within thirty (30) days."),
        clause("11.4", "Challenge accounts provided to the Ambassador may be revoked at FundedNG's discretion upon termination."),

        // 12. Confidentiality
        heading("12. CONFIDENTIALITY", 1),
        clause("12.1", "Both parties agree to keep confidential any proprietary information shared during the course of this Agreement, including but not limited to commission structures, business strategies, and user data."),

        // 13. Limitation of Liability
        heading("13. LIMITATION OF LIABILITY", 1),
        clause("13.1", "FundedNG shall not be liable for any indirect, incidental, or consequential damages arising from this Agreement."),
        clause("13.2", "The Ambassador's total liability under this Agreement shall not exceed the total commissions paid to the Ambassador in the preceding three (3) months."),

        // 14. Governing Law
        heading("14. GOVERNING LAW", 1),
        clause("14.1", "This Agreement shall be governed by and construed in accordance with the laws of the Federal Republic of Nigeria."),
        clause("14.2", "Any disputes arising from this Agreement shall be resolved in the courts of __________, Nigeria."),

        // 15. Entire Agreement
        heading("15. ENTIRE AGREEMENT", 1),
        clause("15.1", "This Agreement constitutes the entire agreement between the parties and supersedes all prior negotiations, representations, or agreements relating to the subject matter."),
        clause("15.2", "Amendments to this Agreement must be in writing and signed by both parties."),

        // Signatures
        heading("SIGNATURES", 1),
        para("IN WITNESS WHEREOF, the parties have executed this Agreement as of the Effective Date.", { center: true, spacing: 400 }),

        para("For FundedNG:", { bold: true }),
        spacer(),
        para("Signature: ________________________________"),
        para("Name: ________________________________"),
        para("Title: ________________________________"),
        para("Date: ________________________________"),

        spacer(),
        spacer(),

        para("Ambassador:", { bold: true }),
        spacer(),
        para("Signature: ________________________________"),
        para("Name: ________________________________"),
        para("Date: ________________________________"),
      ],
    },
  ],
});

async function main() {
  const buffer = await Packer.toBuffer(doc);
  writeFileSync("FundedNG_Partnership_Agreement.docx", buffer);
  console.log("Created: FundedNG_Partnership_Agreement.docx");
  console.log("Size: " + (buffer.length / 1024).toFixed(1) + " KB");
}

main().catch(console.error);
