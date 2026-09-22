import { createRoot } from "react-dom/client";
import { CertificateCard, type Certificate } from "./CertificateCard";

/**
 * Render a certificate off-screen and capture it as a base64 PNG data URL,
 * without launching a browser download. Used to auto-post certificates to the
 * Discord certificates channel after a funding/payout/phase event. The node is
 * rendered, captured, then removed from the DOM.
 */
export async function generateCertificatePng(cert: Certificate): Promise<string> {
  const isPayout = cert.kind === "payout";

  const container = document.createElement("div");
  container.setAttribute("aria-hidden", "true");
  container.style.position = "fixed";
  container.style.left = "-99999px";
  container.style.top = "0";
  container.style.width = "540px";
  document.body.appendChild(container);

  let node: HTMLDivElement | null = null;
  const root = createRoot(container);
  root.render(
    <CertificateCard
      ref={(el) => {
        node = el;
      }}
      cert={cert}
    />,
  );

  try {
    // Let the certificate mount and web fonts finish before capturing.
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
    if ("fonts" in document) {
      try {
        await document.fonts.ready;
      } catch {
        // Font readiness failures shouldn't block the capture.
      }
    }
    if (!node) throw new Error("Certificate node not ready");

    const { toPng } = await import("html-to-image");
    return await toPng(node, {
      pixelRatio: 2,
      backgroundColor: isPayout ? "#000000" : "#020806",
      cacheBust: true,
    });
  } finally {
    root.unmount();
    container.remove();
  }
}
