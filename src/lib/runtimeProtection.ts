const overlayId = "runtime-protection-overlay";

const createOverlay = () => {
  const existing = document.getElementById(overlayId);
  if (existing) {
    return existing;
  }

  const overlay = document.createElement("div");
  overlay.id = overlayId;
  overlay.style.position = "fixed";
  overlay.style.inset = "0";
  overlay.style.zIndex = "999999";
  overlay.style.display = "none";
  overlay.style.alignItems = "center";
  overlay.style.justifyContent = "center";
  overlay.style.background = "rgba(8, 15, 27, 0.96)";
  overlay.style.backdropFilter = "blur(8px)";
  overlay.style.color = "#ffffff";
  overlay.style.fontFamily = "'Plus Jakarta Sans', sans-serif";
  overlay.style.textAlign = "center";
  overlay.style.padding = "24px";
  overlay.innerHTML = `
    <div>
      <div style="font-size:32px;font-weight:800;margin-bottom:12px;">Protected Content</div>
      <div style="font-size:16px;opacity:.82;max-width:520px;line-height:1.6;">
        This page is protected in production mode. Developer tools and source inspection are restricted.
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  return overlay;
};

const showOverlay = () => {
  createOverlay().style.display = "flex";
  document.documentElement.style.overflow = "hidden";
};

const hideOverlay = () => {
  const overlay = document.getElementById(overlayId);
  if (overlay) {
    overlay.style.display = "none";
  }
  document.documentElement.style.overflow = "";
};

export const setupRuntimeProtection = () => {
  if (!import.meta.env.PROD) {
    return;
  }

  window.addEventListener("contextmenu", (event) => {
    event.preventDefault();
  });

  window.addEventListener("keydown", (event) => {
    const key = event.key.toLowerCase();
    const blocked =
      key === "f12" ||
      (event.ctrlKey && event.shiftKey && ["i", "j", "c"].includes(key)) ||
      (event.ctrlKey && ["u", "s"].includes(key));

    if (blocked) {
      event.preventDefault();
      event.stopPropagation();
    }
  });

  const detectDevtools = () => {
    const widthGap = window.outerWidth - window.innerWidth > 160;
    const heightGap = window.outerHeight - window.innerHeight > 160;
    if (widthGap || heightGap) {
      showOverlay();
      return;
    }

    const started = performance.now();
    // eslint-disable-next-line no-debugger
    debugger;
    const elapsed = performance.now() - started;
    if (elapsed > 120) {
      showOverlay();
      return;
    }

    hideOverlay();
  };

  window.setInterval(detectDevtools, 1000);
  detectDevtools();
};
