// panel.js
// The parts of the side panel that are more than a form: the "Explore campus" list and the
// step-by-step directions. Both only draw into elements that index.html already has.
//
//   initExplore({ places, onPick })   draws the category chips and the list of places
//        returns { setDistances(map | null) }
//        map = place index -> walking meters from the chosen start (null = no start yet)
//   showSteps(steps)                  draws the directions made by directions.js
//   clearSteps()                      hides the directions again

import { CATEGORIES } from "./markers.js";

// Screens at least this wide have the panel on the left with room to spare
const WIDE_SCREEN = "(min-width: 768px)";

// The chips above the list. A chip is only shown if at least one place belongs to it.
const GROUPS = [
    { id: "all", label: "All", categories: null },
    { id: "block", label: "Blocks", categories: ["block"] },
    { id: "hostel", label: "Hostels", categories: ["hostel"] },
    { id: "food", label: "Food", categories: ["food"] },
    { id: "outdoor", label: "Outdoor", categories: ["outdoor"] },
    { id: "access", label: "Gate and parking", categories: ["gate", "parking"] },
    { id: "toilet", label: "Toilets", categories: ["toilet"] },
];

// The drawings on the direction steps (24 x 24, lines only, coloured by the CSS)
const STEP_ICONS = {
    start: '<path d="M12 20V5"/><path d="M6 11l6-6 6 6"/>', // an arrow pointing up (north)
    right: '<path d="M6 20v-7a3 3 0 0 1 3-3h9"/><path d="M14 6l4 4-4 4"/>',
    left: '<path d="M18 20v-7a3 3 0 0 0-3-3H6"/><path d="M10 6L6 10l4 4"/>',
    arrive: '<path d="M5 21V4"/><path d="M5 4h12l-3 4 3 4H5"/>',
};

function svgHtml(inner) {
    return `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">${inner}</svg>`;
}

function formatMeters(meters) {
    return meters >= 1000 ? `${(meters / 1000).toFixed(1)} km` : `${Math.round(meters)} m`;
}

// ---------- Explore campus ----------

export function initExplore({ places, onPick }) {
    const chipsEl = document.getElementById("explore-chips");
    const listEl = document.getElementById("explore-list");
    const detailsEl = document.getElementById("explore");
    if (!chipsEl || !listEl) return { setDistances() { } }; // the page has no explore list

    const groups = GROUPS.filter(
        (group) => group.categories === null || places.some((p) => group.categories.includes(p.category))
    );

    let activeId = "all";
    let distances = null; // Map: place index -> meters, or null

    // The chips are made once, so keyboard focus is not lost when you press one
    const chipEls = groups.map((group) => {
        const chip = document.createElement("button");
        chip.type = "button";
        chip.className = "ex-chip";
        chip.textContent = group.label;
        chip.addEventListener("click", () => {
            activeId = group.id;
            updateChips();
            renderList();
        });
        chipsEl.append(chip);
        return chip;
    });

    function updateChips() {
        chipEls.forEach((chip, i) => chip.setAttribute("aria-pressed", String(groups[i].id === activeId)));
    }

    function renderList() {
        const group = groups.find((g) => g.id === activeId) || groups[0];
        const items = places
            .map((place, index) => ({ place, index }))
            .filter(({ place }) => group.categories === null || group.categories.includes(place.category));

        // With a start chosen, the nearest places come first
        if (distances) {
            const far = (index) => (distances.has(index) ? distances.get(index) : Infinity);
            items.sort((a, b) => {
                const da = far(a.index);
                const db = far(b.index);
                return da === db ? 0 : da < db ? -1 : 1;
            });
        }

        listEl.replaceChildren();
        for (const { place, index } of items) {
            const kind = CATEGORIES[place.category] || CATEGORIES.other;

            const icon = document.createElement("span");
            icon.className = "ex-icon";
            icon.style.background = kind.color;
            icon.innerHTML = svgHtml(kind.icon); // our own drawing from markers.js, not user text

            const name = document.createElement("span");
            name.className = "ex-name";
            name.textContent = place.name;
            if (place.blockId) {
                const sub = document.createElement("span");
                sub.className = "ex-sub";
                sub.textContent = "Rooms and labs";
                name.append(sub);
            }

            const button = document.createElement("button");
            button.type = "button";
            button.className = "ex-row";
            button.append(icon, name);

            if (distances && distances.has(index)) {
                const distance = document.createElement("span");
                distance.className = "ex-dist";
                distance.textContent = formatMeters(distances.get(index));
                button.append(distance);
            }

            button.addEventListener("click", () => onPick(index));

            const li = document.createElement("li");
            li.append(button);
            listEl.append(li);
        }
    }

    updateChips();
    renderList();

    // On a phone the top panel is small, so the list starts closed there
    if (detailsEl && !window.matchMedia(WIDE_SCREEN).matches) detailsEl.open = false;

    return {
        setDistances(map) {
            distances = map;
            renderList();
        },
    };
}

// ---------- Directions ----------

export function showSteps(steps) {
    const section = document.getElementById("directions");
    const list = document.getElementById("steps-list");
    if (!section || !list) return;

    if (!steps || steps.length === 0) {
        clearSteps();
        return;
    }

    list.replaceChildren();
    for (const step of steps) {
        const icon = document.createElement("span");
        icon.className = "step-icon";
        icon.innerHTML = svgHtml(STEP_ICONS[step.kind] || STEP_ICONS.arrive);
        // The first arrow points the way you head (the map has north at the top)
        if (step.kind === "start" && typeof step.bearing === "number") {
            icon.firstElementChild.style.transform = `rotate(${Math.round(step.bearing)}deg)`;
        }

        const text = document.createElement("div");
        text.className = "step-text";
        text.textContent = step.text;
        if (typeof step.meters === "number") {
            const meters = document.createElement("div");
            meters.className = "step-meters";
            meters.textContent = formatMeters(step.meters);
            text.append(meters);
        }

        const li = document.createElement("li");
        li.className = "step";
        li.dataset.along = String(Math.round(step.along)); // lets a later step highlight the current one
        li.append(icon, text);
        list.append(li);
    }

    section.hidden = false;

    // The directions take over the space, so the explore list folds away (you can open it again)
    const explore = document.getElementById("explore");
    if (explore) explore.open = false;
}

export function clearSteps() {
    const section = document.getElementById("directions");
    const list = document.getElementById("steps-list");
    if (section) section.hidden = true;
    if (list) list.replaceChildren();

    // No route any more: on a wide screen the explore list opens again
    const explore = document.getElementById("explore");
    if (explore && window.matchMedia(WIDE_SCREEN).matches) explore.open = true;
}