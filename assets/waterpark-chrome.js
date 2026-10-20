/*
 * Publishes the height of Material's sticky chrome as --wp-chrome on <body>.
 *
 * Both embedded browsers size themselves to "the viewport, minus whatever is
 * pinned above me". The obvious spelling of that is
 *
 *     calc(100vh - var(--md-header-height))
 *
 * and it is wrong here, because `navigation.tabs.sticky` pins a second bar
 * under the header and --md-header-height does not know about it. The app
 * then overhangs the viewport by the height of the tab bar, the document
 * becomes scrollable by that much, and a wheel event that bottoms out inside
 * the widget chains to the document and drags the whole layout. That is the
 * awkward scrolling, and it is not browser-specific: Material sets
 * `overscroll-behavior` nowhere, so nothing anywhere stops the chain.
 *
 * Measuring both bars is the reliable version. It also survives someone
 * turning the tabs off, changing the header, or zooming.
 */
(function () {
  "use strict";

  function measure() {
    var header = document.querySelector(".md-header");
    var tabs = document.querySelector(".md-tabs");

    // offsetHeight rather than a constant: the tab bar collapses on scroll in
    // some Material versions, and zoom changes both.
    var height =
      (header ? header.offsetHeight : 0) + (tabs ? tabs.offsetHeight : 0);

    document.body.style.setProperty("--wp-chrome", height + "px");
  }

  function start() {
    measure();
    window.addEventListener("resize", measure, { passive: true });
    window.addEventListener("orientationchange", measure, { passive: true });

    // Fonts land after first paint and can change the header's height.
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(measure).catch(function () {
        /* noop */
      });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
