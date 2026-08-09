import { useState } from "react";

const STEPS = [
  { id: 1, label: "Personal Info" },
  { id: 2, label: "Your Presence" },
  { id: 3, label: "Trading Background" },
  { id: 4, label: "Brand Fit" },
  { id: 5, label: "Commitment" },
];

const NAV = "#02081F";
const GREEN = "#00C853";
const GREEN_DIM = "#00843A";
const GOLD = "#C9A84C";
const CARD = "rgba(255,255,255,0.04)";
const BORDER = "rgba(0,200,83,0.18)";
const INPUT_BG = "rgba(255,255,255,0.06)";
const TEXT = "#E8EDF5";
const MUTED = "#8A95A8";

const platforms = ["X (Twitter)", "Instagram", "TikTok", "YouTube", "Telegram", "WhatsApp Group", "Discord", "Facebook"];
const communityTypes = ["Social Media Following", "Private Trading Group", "Telegram/WhatsApp Community", "YouTube Channel", "Discord Server", "Email Newsletter", "Other"];
const challengePlatforms = ["FundedNG", "FTMO", "MyForexFunds", "The Funded Trader", "Apex", "Other", "None yet"];

interface PartnerFormData {
  fullName: string; email: string; phone: string; country: string;
  primaryPlatform: string; profileLink: string; followerCount: string; communityType: string; communitySize: string; communityLink: string;
  activelyTrades: string; tradingStyle: string; passedChallenge: string; challengePlatform: string; willingToPassPublicly: string;
  whyFundedNG: string; contentType: string; otherPropFirms: string; sampleContentLink: string;
  agreeNoGiveawayOnly: boolean; agreePublicChallenge: boolean; agreeNoDM: boolean; agreeTerms: boolean;
}

const EMPTY_FORM: PartnerFormData = {
  fullName: "", email: "", phone: "", country: "",
  primaryPlatform: "", profileLink: "", followerCount: "", communityType: "", communitySize: "", communityLink: "",
  activelyTrades: "", tradingStyle: "", passedChallenge: "", challengePlatform: "", willingToPassPublicly: "",
  whyFundedNG: "", contentType: "", otherPropFirms: "", sampleContentLink: "",
  agreeNoGiveawayOnly: false, agreePublicChallenge: false, agreeNoDM: false, agreeTerms: false,
};

export default function PartnerForm() {
  const [step, setStep] = useState(1);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [form, setForm] = useState<PartnerFormData>(EMPTY_FORM);

  const set = (key: keyof PartnerFormData, val: string | boolean) => {
    setForm(f => ({ ...f, [key]: val }));
    setErrors(e => ({ ...e, [key]: undefined }));
  };

  const validate = (): Record<string, string> => {
    const e: Record<string, string> = {};
    if (step === 1) {
      if (!form.fullName.trim()) e.fullName = "Required";
      if (!form.email.trim() || !form.email.includes("@")) e.email = "Valid email required";
      if (!form.phone.trim()) e.phone = "Required";
      if (!form.country.trim()) e.country = "Required";
    }
    if (step === 2) {
      if (!form.primaryPlatform) e.primaryPlatform = "Required";
      if (!form.profileLink.trim()) e.profileLink = "Required";
      if (!form.followerCount) e.followerCount = "Required";
      if (!form.communityType) e.communityType = "Required";
    }
    if (step === 3) {
      if (!form.activelyTrades) e.activelyTrades = "Required";
      if (!form.tradingStyle.trim()) e.tradingStyle = "Required";
      if (!form.passedChallenge) e.passedChallenge = "Required";
      if (!form.willingToPassPublicly) e.willingToPassPublicly = "Required";
    }
    if (step === 4) {
      if (!form.whyFundedNG.trim() || form.whyFundedNG.trim().length < 50) e.whyFundedNG = "Please write at least 50 characters";
      if (!form.contentType.trim()) e.contentType = "Required";
      if (!form.otherPropFirms) e.otherPropFirms = "Required";
    }
    if (step === 5) {
      if (!form.agreeNoGiveawayOnly) e.agreeNoGiveawayOnly = "Required";
      if (!form.agreePublicChallenge) e.agreePublicChallenge = "Required";
      if (!form.agreeNoDM) e.agreeNoDM = "Required";
      if (!form.agreeTerms) e.agreeTerms = "Required";
    }
    return e;
  };

  const submitApplication = async () => {
    setSubmitting(true);
    try {
      const res = await fetch("/api/partner-application", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Submission failed");
      }
      setSubmitted(true);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const next = () => {
    const e = validate();
    if (Object.keys(e).length > 0) { setErrors(e); return; }
    if (step < 5) setStep(s => s + 1);
    else submitApplication();
  };

  const back = () => setStep(s => s - 1);

  const inputStyle = (err?: string): React.CSSProperties => ({
    width: "100%", padding: "12px 14px", borderRadius: 10,
    background: INPUT_BG, border: `1.5px solid ${err ? "#FF5252" : BORDER}`,
    color: TEXT, fontSize: 15, outline: "none", boxSizing: "border-box",
    fontFamily: "inherit", transition: "border 0.2s",
  });
  const labelStyle: React.CSSProperties = { color: TEXT, fontWeight: 600, fontSize: 14, marginBottom: 6, display: "block" };
  const errStyle: React.CSSProperties = { color: "#FF5252", fontSize: 12, marginTop: 4 };
  const fieldWrap: React.CSSProperties = { marginBottom: 20 };
  const hintStyle: React.CSSProperties = { color: MUTED, fontSize: 12, marginTop: 5 };

  const Field = ({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: React.ReactNode }) => (
    <div style={fieldWrap}>
      <label style={labelStyle}>{label}</label>
      {hint && <div style={{ ...hintStyle, marginBottom: 6 }}>{hint}</div>}
      {children}
      {error && <div style={errStyle}>⚠ {error}</div>}
    </div>
  );

  const Input = ({ field, placeholder, type = "text" }: { field: keyof PartnerFormData; placeholder: string; type?: string }) => (
    <input
      type={type}
      placeholder={placeholder}
      value={form[field] as string}
      onChange={e => set(field, e.target.value)}
      style={inputStyle(errors[field])}
    />
  );

  const Select = ({ field, options, placeholder }: { field: keyof PartnerFormData; options: string[]; placeholder: string }) => (
    <select
      value={form[field] as string}
      onChange={e => set(field, e.target.value)}
      style={{ ...inputStyle(errors[field]), appearance: "none", cursor: "pointer" }}
    >
      <option value="">{placeholder}</option>
      {options.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  );

  const Textarea = ({ field, placeholder, rows = 4 }: { field: keyof PartnerFormData; placeholder: string; rows?: number }) => (
    <textarea
      placeholder={placeholder}
      value={form[field] as string}
      onChange={e => set(field, e.target.value)}
      rows={rows}
      style={{ ...inputStyle(errors[field]), resize: "vertical", lineHeight: 1.6 }}
    />
  );

  const Radio = ({ field, value, label }: { field: keyof PartnerFormData; value: string; label: string }) => (
    <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", marginBottom: 10, color: TEXT, fontSize: 14 }}>
      <div onClick={() => set(field, value)} style={{
        width: 18, height: 18, borderRadius: "50%",
        border: `2px solid ${form[field] === value ? GREEN : BORDER}`,
        background: form[field] === value ? GREEN : "transparent",
        flexShrink: 0, transition: "all 0.2s", display: "flex", alignItems: "center", justifyContent: "center"
      }}>
        {form[field] === value && <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#000" }} />}
      </div>
      {label}
    </label>
  );

  const Checkbox = ({ field, label }: { field: keyof PartnerFormData; label: string }) => (
    <label style={{ display: "flex", alignItems: "flex-start", gap: 12, cursor: "pointer", marginBottom: 14, color: TEXT, fontSize: 14, lineHeight: 1.5 }}>
      <div onClick={() => set(field, !form[field])} style={{
        width: 20, height: 20, minWidth: 20, borderRadius: 5, marginTop: 1,
        border: `2px solid ${form[field] ? GREEN : BORDER}`,
        background: form[field] ? GREEN : "transparent",
        display: "flex", alignItems: "center", justifyContent: "center",
        transition: "all 0.2s",
      }}>
        {form[field] && <span style={{ color: "#000", fontSize: 12, fontWeight: 900 }}>✓</span>}
      </div>
      <span>{label}</span>
    </label>
  );

  const sectionTitle = (text: string) => (
    <div style={{ marginBottom: 28 }}>
      <div style={{ color: GREEN, fontSize: 12, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", marginBottom: 4 }}>
        Step {step} of 5
      </div>
      <h2 style={{ color: TEXT, fontSize: 22, fontWeight: 800, margin: 0 }}>{text}</h2>
    </div>
  );

  const divider = <div style={{ height: 1, background: BORDER, margin: "24px 0" }} />;

  if (submitted) return (
    <div style={{ minHeight: "100vh", background: NAV, display: "flex", alignItems: "center", justifyContent: "center", padding: 24, fontFamily: "'Inter', 'Segoe UI', sans-serif" }}>
      <div style={{ maxWidth: 480, width: "100%", textAlign: "center" }}>
        <div style={{ fontSize: 64, marginBottom: 16 }}>🎯</div>
        <h2 style={{ color: GREEN, fontSize: 28, fontWeight: 800, marginBottom: 12 }}>Application Received</h2>
        <p style={{ color: TEXT, fontSize: 16, lineHeight: 1.7, marginBottom: 8 }}>
          Thanks, <strong>{form.fullName.split(" ")[0]}</strong>. We&apos;ve received your partner application.
        </p>
        <p style={{ color: MUTED, fontSize: 14, lineHeight: 1.7, marginBottom: 32 }}>
          Our team reviews applications within <strong style={{ color: TEXT }}>3–5 business days</strong>. We&apos;ll reach out via your email — <strong style={{ color: GREEN }}>{form.email}</strong>
        </p>
        <div style={{ background: "rgba(201,168,76,0.08)", border: `1px solid ${GOLD}30`, borderRadius: 12, padding: "16px 20px", marginBottom: 24 }}>
          <div style={{ color: GOLD, fontWeight: 700, fontSize: 13, marginBottom: 6 }}>🔒 Reminder</div>
          <div style={{ color: MUTED, fontSize: 13, lineHeight: 1.6 }}>
            FundedNG will never DM you first. All communication happens through official Support Tickets on the platform only.
          </div>
        </div>
        <button onClick={() => { setSubmitted(false); setStep(1); setForm(EMPTY_FORM); }}
          style={{ background: "transparent", border: `1px solid ${BORDER}`, color: MUTED, borderRadius: 10, padding: "10px 24px", cursor: "pointer", fontSize: 14 }}>
          Submit Another Application
        </button>
      </div>
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", background: NAV, fontFamily: "'Inter', 'Segoe UI', sans-serif", padding: "32px 16px" }}>
      <div style={{ maxWidth: 600, margin: "0 auto" }}>

        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: 36 }}>
          <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: 1, marginBottom: 4 }}>
            <span style={{ color: TEXT }}>FUNDED</span>
            <span style={{ color: GREEN }}>NG</span>
          </div>
          <div style={{ color: MUTED, fontSize: 12, letterSpacing: 2, textTransform: "uppercase" }}>Partner Program Application</div>
        </div>

        {/* Progress Bar */}
        <div style={{ marginBottom: 32 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
            {STEPS.map(s => (
              <div key={s.id} style={{ display: "flex", flexDirection: "column", alignItems: "center", flex: 1 }}>
                <div style={{
                  width: 32, height: 32, borderRadius: "50%",
                  background: s.id < step ? GREEN : s.id === step ? GREEN : "transparent",
                  border: `2px solid ${s.id <= step ? GREEN : BORDER}`,
                  color: s.id <= step ? "#000" : MUTED,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 13, fontWeight: 700, transition: "all 0.3s",
                  marginBottom: 6,
                }}>
                  {s.id < step ? "✓" : s.id}
                </div>
                <div style={{ color: s.id === step ? GREEN : MUTED, fontSize: 10, fontWeight: s.id === step ? 700 : 400, textAlign: "center", letterSpacing: 0.5 }}>
                  {s.label}
                </div>
              </div>
            ))}
          </div>
          <div style={{ height: 3, background: "rgba(255,255,255,0.06)", borderRadius: 2 }}>
            <div style={{ height: "100%", width: `${((step - 1) / 4) * 100}%`, background: GREEN, borderRadius: 2, transition: "width 0.4s ease" }} />
          </div>
        </div>

        {/* Card */}
        <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 16, padding: "32px 28px" }}>

          {/* STEP 1 */}
          {step === 1 && <>
            {sectionTitle("Personal Information")}
            <Field label="Full Name *" error={errors.fullName}>
              <Input field="fullName" placeholder="Your full name" />
            </Field>
            <Field label="Email Address *" error={errors.email} hint="This is where we'll send your application decision">
              <Input field="email" placeholder="you@email.com" type="email" />
            </Field>
            <Field label="Phone Number *" error={errors.phone}>
              <Input field="phone" placeholder="+234 800 000 0000" />
            </Field>
            <Field label="Country *" error={errors.country}>
              <Input field="country" placeholder="Nigeria" />
            </Field>
          </>}

          {/* STEP 2 */}
          {step === 2 && <>
            {sectionTitle("Your Online Presence")}
            <Field label="Primary Platform *" error={errors.primaryPlatform} hint="Where is your most active and engaged audience?">
              <Select field="primaryPlatform" options={platforms} placeholder="Select your main platform" />
            </Field>
            <Field label="Profile / Page Link *" error={errors.profileLink}>
              <Input field="profileLink" placeholder="https://x.com/yourhandle" />
            </Field>
            <Field label="Follower / Subscriber Count *" error={errors.followerCount}>
              <Select field="followerCount" options={["Under 500", "500 – 2,000", "2,000 – 5,000", "5,000 – 10,000", "10,000 – 20,000", "20,000 – 50,000", "50,000+"]} placeholder="Select range" />
            </Field>
            {divider}
            <Field label="Community Type *" error={errors.communityType} hint="Do you also run a private community beyond your public profile?">
              <Select field="communityType" options={communityTypes} placeholder="Select community type" />
            </Field>
            <Field label="Community Size" error={errors.communitySize}>
              <Select field="communitySize" options={["Under 100", "100 – 500", "500 – 1,000", "1,000 – 5,000", "5,000+"]} placeholder="Select range (optional)" />
            </Field>
            <Field label="Community Link (optional)">
              <Input field="communityLink" placeholder="Telegram / Discord / WhatsApp link" />
            </Field>
          </>}

          {/* STEP 3 */}
          {step === 3 && <>
            {sectionTitle("Your Trading Background")}
            <Field label="Do you actively trade? *" error={errors.activelyTrades}
              hint="Not managing someone else's account — do YOU personally trade in the markets?">
              <Radio field="activelyTrades" value="yes" label="Yes, I trade regularly and document it" />
              <Radio field="activelyTrades" value="occasionally" label="Occasionally, but I'm growing my consistency" />
              <Radio field="activelyTrades" value="no" label="No, I primarily create content about trading" />
            </Field>
            {divider}
            <Field label="What is your trading style? *" error={errors.tradingStyle} hint="e.g. Smart Money Concepts, Price Action, Scalping, Swing Trading...">
              <Input field="tradingStyle" placeholder="Describe your approach briefly" />
            </Field>
            {divider}
            <Field label="Have you ever passed a funded challenge? *" error={errors.passedChallenge}>
              <Radio field="passedChallenge" value="yes_fundedng" label="Yes — with FundedNG" />
              <Radio field="passedChallenge" value="yes_other" label="Yes — with another prop firm" />
              <Radio field="passedChallenge" value="attempted" label="I've attempted but not passed yet" />
              <Radio field="passedChallenge" value="no" label="No, not yet" />
            </Field>
            {(form.passedChallenge === "yes_other" || form.passedChallenge === "yes_fundedng") && (
              <Field label="Which platform?" error={errors.challengePlatform}>
                <Select field="challengePlatform" options={challengePlatforms} placeholder="Select platform" />
              </Field>
            )}
            {divider}
            <Field label="Are you willing to attempt and PASS a FundedNG challenge publicly? *"
              error={errors.willingToPassPublicly}
              hint="This is a requirement for all partners — documenting your journey builds trust with your community">
              <Radio field="willingToPassPublicly" value="yes" label="Yes, I'm fully willing to do this" />
              <Radio field="willingToPassPublicly" value="maybe" label="I'd like to discuss this further" />
              <Radio field="willingToPassPublicly" value="no" label="No, I prefer not to" />
            </Field>
          </>}

          {/* STEP 4 */}
          {step === 4 && <>
            {sectionTitle("Brand Fit")}
            <Field label="Why do you want to partner with FundedNG specifically? *"
              error={errors.whyFundedNG}
              hint="Be honest. Generic answers will not progress.">
              <Textarea field="whyFundedNG" placeholder="Tell us what drew you to FundedNG, what you understand about our platform, and how you see this partnership working..." rows={5} />
              <div style={{ ...hintStyle, textAlign: "right", marginTop: 4 }}>
                <span style={{ color: form.whyFundedNG.length < 50 ? "#FF5252" : GREEN }}>{form.whyFundedNG.length}</span> / 50 min characters
              </div>
            </Field>
            {divider}
            <Field label="What kind of content do you create? *" error={errors.contentType}
              hint="Be specific — chart breakdowns, trade vlogs, prop firm journeys, educational threads, etc.">
              <Input field="contentType" placeholder="e.g. Daily chart analysis, funded trader journeys, SMC education..." />
            </Field>
            {divider}
            <Field label="Are you currently promoting other prop firms? *" error={errors.otherPropFirms}>
              <Radio field="otherPropFirms" value="no" label="No, FundedNG would be my primary or only partner" />
              <Radio field="otherPropFirms" value="yes_few" label="Yes — 1 or 2 others, but I'm selective" />
              <Radio field="otherPropFirms" value="yes_many" label="Yes — I promote multiple prop firms regularly" />
            </Field>
            {divider}
            <Field label="Sample Content Link (optional)" hint="A post, video, or thread that best represents what you create">
              <Input field="sampleContentLink" placeholder="https://..." />
            </Field>
          </>}

          {/* STEP 5 */}
          {step === 5 && <>
            {sectionTitle("Commitments & Agreement")}
            <p style={{ color: MUTED, fontSize: 14, lineHeight: 1.7, marginBottom: 24 }}>
              Before we review your application, we need you to acknowledge the following. These are not just terms — they define what FundedNG partnership means.
            </p>
            <div style={{ background: "rgba(0,200,83,0.04)", border: `1px solid ${GREEN}20`, borderRadius: 12, padding: "20px 20px 8px" }}>
              <Checkbox field="agreeNoGiveawayOnly"
                label="I understand that FundedNG does not partner with accounts whose primary purpose is distributing free accounts and giveaways. My partnership will be grounded in genuine content and trading activity." />
              <Checkbox field="agreePublicChallenge"
                label="I agree to attempt and publicly document a FundedNG challenge as part of my partnership. I understand this is a non-negotiable requirement for all partners." />
              <Checkbox field="agreeNoDM"
                label="I acknowledge that FundedNG will never DM me first. All official communication — including this application decision — will come through official Support Tickets on the platform only." />
              <Checkbox field="agreeTerms"
                label="I have read the FundedNG Partner Program terms and agree to uphold the brand's standards, post a minimum of 2 pieces of FundedNG content per month, and not make false claims about the platform." />
            </div>
            {(errors.agreeNoGiveawayOnly || errors.agreePublicChallenge || errors.agreeNoDM || errors.agreeTerms) && (
              <div style={{ ...errStyle, marginTop: 12 }}>⚠ Please confirm all commitments above to proceed</div>
            )}
            {divider}
            <div style={{ background: "rgba(201,168,76,0.06)", border: `1px solid ${GOLD}30`, borderRadius: 10, padding: "14px 16px" }}>
              <div style={{ color: GOLD, fontWeight: 700, fontSize: 13, marginBottom: 6 }}>📋 What happens next?</div>
              <div style={{ color: MUTED, fontSize: 13, lineHeight: 1.7 }}>
                We review your profile and application within <strong style={{ color: TEXT }}>3–5 business days</strong>. If approved, you&apos;ll receive onboarding details via email. If we need more info, we&apos;ll reach out through our Support Ticket system — never by DM.
              </div>
            </div>
          </>}

          {/* Navigation */}
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 32, gap: 12 }}>
            {step > 1 ? (
              <button onClick={back} disabled={submitting} style={{
                flex: 1, padding: "14px", borderRadius: 10, border: `1.5px solid ${BORDER}`,
                background: "transparent", color: TEXT, fontSize: 15, fontWeight: 600,
                cursor: submitting ? "not-allowed" : "pointer", fontFamily: "inherit",
                opacity: submitting ? 0.5 : 1,
              }}>
                ← Back
              </button>
            ) : <div style={{ flex: 1 }} />}

            <button onClick={next} disabled={submitting} style={{
              flex: 2, padding: "14px", borderRadius: 10, border: "none",
              background: `linear-gradient(135deg, ${GREEN}, ${GREEN_DIM})`,
              color: "#000", fontSize: 15, fontWeight: 800, cursor: submitting ? "not-allowed" : "pointer",
              fontFamily: "inherit", letterSpacing: 0.5,
              boxShadow: `0 4px 20px ${GREEN}30`,
              opacity: submitting ? 0.7 : 1,
            }}>
              {submitting ? "Submitting..." : step === 5 ? "Submit Application →" : "Continue →"}
            </button>
          </div>
        </div>

        {/* Footer note */}
        <div style={{ textAlign: "center", marginTop: 24, color: MUTED, fontSize: 12 }}>
          🔒 FundedNG will never DM you first · All support via official Support Tickets only
        </div>
      </div>
    </div>
  );
}
