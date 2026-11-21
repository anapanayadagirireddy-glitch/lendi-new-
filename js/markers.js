// markers.js
// The look of the place markers on the map. Each place becomes a round badge with a colour
// and an icon for its kind (block, hostel, food...). Used by map.js.
//
// A marker is made of:
//   - a coloured circle with an icon inside
//   - a small white dot on the circle if the place has room details (tapping it opens a card)
//   - a name label under the circle (markers.css shows it only when the map is zoomed in)
//
// The icons are inline SVG, so there is no icon font or extra file to load.

const SVG_START = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">';
const SVG_END = "</svg>";

// false = markers show only the round icon (names appear when you tap or hover a marker).
// true  = also draw the name label under each marker.
const SHOW_LABELS = false;

// One entry per "category" value used in data/places.json.
// color = circle colour, icon = the drawing inside (24 x 24, white lines, no fill).
export const CATEGORIES = {
    block: {
        color: "#0F6E56",
        icon: '<path d="M5 21V5l7-2 7 2v16"/><path d="M3 21h18"/><path d="M9 9h1M14 9h1M9 13h1M14 13h1"/><path d="M10 21v-4h4v4"/>',
    },
    hostel: {
        color: "#534AB7",
        icon: '<path d="M3 7v11"/><path d="M3 14h18"/><path d="M21 18v-8a2 2 0 0 0-2-2h-8v6"/><circle cx="7" cy="10" r="1"/>',
    },
    food: {
        color: "#854F0B",
        icon: '<path d="M19 3v12h-5c-.023-3.681.184-7.406 5-12zm0 12v6h-1v-3m-10-14v17m-3-17v3a3 3 0 1 0 6 0v-3"/>',
    },
    gate: {
        color: "#5F5E5A",
        icon: '<path d="M13 12v.01"/><path d="M3 21h18"/><path d="M5 21v-16a2 2 0 0 1 2-2h6m4 10.5v7.5"/><path d="M21 7h-7m3-3l-3 3l3 3"/>',
    },
    parking: {
        color: "#5F5E5A",
        icon: '<path d="M8 20V4h5a4.5 4.5 0 0 1 0 9H8"/>',
    },
    outdoor: {
        color: "#3B6D11",
        icon: '<path d="M12 21v-6"/><path d="M12 3l5 7h-3l4 6H6l4-6H7z"/>',
    },
    toilet: {
        color: "#185FA5",
        icon: '<circle cx="8" cy="4.5" r="1.5"/><path d="M5.5 9h5v5H9.3v7H6.7v-7H5.5z"/><circle cx="16.5" cy="4.5" r="1.5"/><path d="M16.5 9l3 7h-6z"/><path d="M15.5 16v5M17.5 16v5"/>',
    },
    other: {
        color: "#5F5E5A",
        icon: '<circle cx="12" cy="12" r="3"/>',
    },
};

// Names come from our own JSON, but we still make them safe before putting them in HTML.
function escapeHtml(text) {
    return String(text).replace(/[&<>"']/g, (c) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
    }[c]));
}

// Builds the Leaflet icon for one place.
//   name       : the place name (shown as the label)
//   category   : one of the keys of CATEGORIES (unknown or missing = "other")
//   hasDetails : true if tapping the place opens a block card (adds the white dot)
export function createPlaceIcon(name, { category, hasDetails = false } = {}) {
    const kind = CATEGORIES[category] || CATEGORIES.other;
    const html =
        `<div class="mk-circle" style="background:${kind.color}">` +
        `${SVG_START}${kind.icon}${SVG_END}` +
        (hasDetails ? '<span class="mk-badge"></span>' : "") +
        `</div>` +
        (SHOW_LABELS ? `<span class="mk-label">${escapeHtml(name)}</span>` : "");

    return L.divIcon({
        className: "mk", // our own class, so Leaflet's default white square is not used
        html,
        iconSize: [30, 30],
        iconAnchor: [15, 15], // the middle of the circle sits exactly on the place
        popupAnchor: [0, -18],
    });
}