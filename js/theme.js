// theme.js
// Light / dark theme.
//
// This is a NORMAL script (not a module) and it is loaded in <head>, so the right theme is
// on the page before anything is drawn. A module would load too late and the page would
// flash light for a moment.
//
// Which theme is used:
//   1. the one the user chose with the theme button (remembered in this browser), or
//   2. if they never chose, the one their phone or computer is set to.

(function () {
    var KEY = "lendi-theme";
    var root = document.documentElement;
    var media = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;

    // The saved choice, or null. (Some browsers block storage, so everything is in try/catch.)
    function stored() {
        try {
            var value = localStorage.getItem(KEY);
            return value === "light" || value === "dark" ? value : null;
        } catch (error) {
            return null;
        }
    }

    function save(theme) {
        try {
            localStorage.setItem(KEY, theme);
        } catch (error) {
            /* not saved, the theme still changes for this visit */
        }
    }

    // Puts the theme on the page, colours the phone's browser bar, and updates the button label
    function apply(theme) {
        root.setAttribute("data-theme", theme);

        var meta = document.querySelector('meta[name="theme-color"]');
        if (meta) meta.setAttribute("content", theme === "dark" ? "#1c1f24" : "#ffffff");

        var button = document.getElementById("theme-btn");
        if (button) {
            button.setAttribute(
                "aria-label",
                theme === "dark" ? "Switch to light theme" : "Switch to dark theme"
            );
        }
    }

    // Right now, before the page is drawn
    apply(stored() || (media && media.matches ? "dark" : "light"));

    // When the page has loaded, the button exists: connect it
    document.addEventListener("DOMContentLoaded", function () {
        var current = root.getAttribute("data-theme") || "light";
        apply(current); // also sets the button label

        var button = document.getElementById("theme-btn");
        if (!button) return;

        button.addEventListener("click", function () {
            var next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
            save(next);
            apply(next);
        });
    });

    // If the user never chose, follow the phone or computer when its setting changes
    if (media && media.addEventListener) {
        media.addEventListener("change", function (event) {
            if (!stored()) apply(event.matches ? "dark" : "light");
        });
    }
})();