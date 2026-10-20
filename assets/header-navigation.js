function configureHeaderNavigation() {
  document.querySelectorAll(".md-header__dropdown").forEach((dropdown) => {
    if (dropdown.dataset.wpNavigationReady === "true") {
      return;
    }

    const button = dropdown.querySelector(":scope > button");
    const firstLink = dropdown.querySelector(
      ":scope > .md-header__dropdown-content a[href]"
    );

    if (
      !(button instanceof HTMLButtonElement) ||
      !(firstLink instanceof HTMLAnchorElement)
    ) {
      return;
    }

    const title = button.textContent.trim();
    const heading = document.createElement("div");
    heading.className = "wp-header-menu-heading";

    const link = document.createElement("a");
    link.className = button.className;
    link.style.cssText = button.style.cssText;
    link.href = firstLink.href;

    // Preserve the existing title and any icon.
    while (button.firstChild) {
      link.appendChild(button.firstChild);
    }

    // Keep the plugin's existing click handler on the arrow button.
    button.type = "button";
    button.textContent = "▾";
    button.setAttribute("aria-label", `Open ${title} menu`);

    button.before(heading);
    heading.append(link, button);

    dropdown.dataset.wpNavigationReady = "true";
  });
}

// The plugin opens a menu on mouseenter and toggles it on click. A tap
// fires both, in that order, so on touch screens the menu opened and closed
// again in the same gesture. Remember what kind of pointer went down last
// and let taps go through the click toggle alone. Wide touch screens (a
// tablet in landscape) still show the header menus, so this is needed on
// top of the CSS hand-over to the drawer.
let wpLastPointerType = "mouse";
document.addEventListener(
  "pointerdown",
  (event) => {
    wpLastPointerType = event.pointerType;
  },
  { capture: true, passive: true }
);

function wpIgnoreTouch(name) {
  const original = window[name];
  if (typeof original !== "function" || original.wpTouchAware) {
    return;
  }
  const wrapped = function (...args) {
    if (wpLastPointerType === "touch") {
      return undefined;
    }
    return original.apply(this, args);
  };
  wrapped.wpTouchAware = true;
  window[name] = wrapped;
}

// The plugin's inline handlers look these up by name when they fire.
wpIgnoreTouch("showHeaderDropdown");
wpIgnoreTouch("hideHeaderDropdown");

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", configureHeaderNavigation);
} else {
  configureHeaderNavigation();
}

// Also supports Material's instant navigation if enabled later.
if (typeof document$ !== "undefined") {
  document$.subscribe(configureHeaderNavigation);
}
