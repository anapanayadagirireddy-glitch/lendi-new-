// sheet.js
// Phone layout (screens under 768px): a full-screen map with ONE bottom sheet over it.
//
//   - A floating bar at the top shows "From  <->  To" (tap a name to change it, tap the
//     arrows to swap). It is only shown while the sheet is small ("peek").
//   - The sheet has three heights:
//       peek : distance + time, the destination block, and the buttons
//       half : the directions and the From / To form
//       full : almost the whole screen (long lists, or the block card while searching)
//   - The block card (rooms and labs) opens INSIDE the same sheet position. While it is
//     open, the route sheet is hidden. Swipe the card down, or tap the cross, to close it.
//   - Drag the handle, or tap it, to change the height.
//
// On a laptop (768px and wider) nothing here is used: the panel stays on the left.
//
// Public functions (used by ui.js):
//   initSheet()               call once, right after initMap()
//   setPeekDestination(place) tells the sheet which place the route goes to
//   fitRouteInView()          zoom so the whole route is visible above the sheet
//   isPhoneLayout()           true on a phone-size screen
//   setSheetState(name)       "peek" | "half" | "full"
//   getSheetCover()           pixels of the map covered at the bottom (0 on a laptop)

import { getMap, fitRoute } from "./map.js";
import { openBlockCard, closeCard } from "./card.js";

const PHONE = window.matchMedia("(max-width: 767.98px)");

const HALF_RATIO = 0.55; // half = 55% of the screen height
const FULL_RATIO = 0.88; // full = 88%, so a bit of the map still shows on top
const PEEK_MIN = 120; // the smallest sheet
const PEEK_GAP = 14; // space under the last thing shown in the peek strip
const TAP_MOVE_PX = 6; // moving less than this counts as a tap, not a drag
const FLICK_MS = 180; // a quick flick counts a little further

let panel = null; // <aside class="route-panel">
let card = null; // <aside id="block-panel">
let bar = null; // the peek strip inside the panel
let pill = null; // the floating From/To bar
let summary = null;
let info = null; // <p id="route-info"> (ui.js writes the route text here)
let directions = null;
let startSelect = null;
let endSelect = null;
let cardHandle = null; // the handle that sits at the top of the block card

let state = "half"; // the height the sheet is at now
let stateBeforeCard = "half";
let cardOpen = false; // true while the block card is shown (phone only)
let dragging = false;
let lastPx = 0; // the sheet height in pixels (the part of the map it covers)
let peekDest = null; // the place the route goes to

const $ = (id) => document.getElementById(id);

export const isPhoneLayout = () => PHONE.matches;

function hasRoute() {
    return Boolean(directions) && !directions.hidden;
}

// ---------- Heights ----------

function heights() {
    const screen = window.innerHeight;
    const half = Math.round(screen * HALF_RATIO);
    const full = Math.round(screen * FULL_RATIO);

    // The peek strip is exactly as tall as its content (handle + distance + buttons)
    let peek = PEEK_MIN;
    if (bar && !bar.hidden && bar.offsetHeight > 0) {
        peek = bar.offsetTop + bar.offsetHeight + PEEK_GAP;
    }
    peek = Math.max(PEEK_MIN, Math.min(peek, half - 40));
    return { peek, half, full };
}

function showHeight(px) {
    lastPx = px;
    document.documentElement.style.setProperty("--sheet-h", `${px}px`);
}

export function setSheetState(name) {
    if (cardOpen && name === "peek") name = "half"; // the card has no small size
    const all = heights();
    if (!all[name]) return;
    state = name;
    if (panel) panel.dataset.sheet = name;
    if (card) card.dataset.sheet = name;
    showHeight(all[name]);
    updatePill();
}

export function getSheetCover() {
    return PHONE.matches ? lastPx : 0;
}

// Zooms so the whole route is visible in the part of the map the sheet does not cover
export function fitRouteInView() {
    fitRoute(getSheetCover());
}

// ---------- The floating From / To bar ----------

function updatePill() {
    if (!pill) return;
    const label = (select, fallback) => {
        const option = select.options[select.selectedIndex];
        return select.value && option ? option.textContent : fallback;
    };
    const names = pill.querySelectorAll(".rb-name");
    names[0].textContent = label(startSelect, "Choose start");
    names[1].textContent = label(endSelect, "Choose destination");

    const visible = PHONE.matches && state === "peek" && !cardOpen;
    pill.classList.toggle("is-hidden", !visible);
}

// ---------- The peek strip (distance, time, destination, buttons) ----------

function findShareButton() {
    return (
        $("share-btn") ||
        [...document.querySelectorAll(".controls button")].find((b) =>
            b.textContent.trim().toLowerCase().startsWith("share")
        )
    );
}

function updateBar() {
    if (!bar) return;
    const text = (info.textContent || "").trim();
    const route = hasRoute();

    bar.hidden = !(text || route);

    // "Main gate to Mechanical block: 169 m, about 2 min walk"  ->  big "169 m" and "2 min walk"
    summary.replaceChildren();
    summary.classList.remove("is-text");
    const match = text.match(/(\d+(?:\.\d+)?)\s*(km|m)\b[\s\S]*?(\d+)\s*min/i);
    if (match) {
        const distance = document.createElement("strong");
        distance.textContent = `${match[1]} ${match[2]}`;
        const time = document.createElement("span");
        time.textContent = `${match[3]} min walk`;
        summary.append(distance, time);
    } else {
        summary.classList.add("is-text");
        summary.textContent = text;
    }

    // The note ("you are not at ...") that ui.js adds after the numbers
    const noteAt = text.indexOf("Note:");
    const note = $("pk-note");
    note.hidden = !(match && noteAt !== -1);
    note.textContent = noteAt !== -1 ? text.slice(noteAt + 5).trim() : "";

    const destRow = $("pk-dest");
    const showDest = route && peekDest && peekDest.blockId;
    destRow.hidden = !showDest;
    $("pk-dest-name").textContent = peekDest ? peekDest.name : "";

    $("pk-actions").hidden = !route;
    const share = findShareButton();
    $("pk-share").hidden = !(share && !share.hidden);

    // The strip may have become taller or shorter
    if (PHONE.matches && state === "peek" && !cardOpen && !dragging) showHeight(heights().peek);
}

// Called by ui.js when a route is found: which place are we going to?
export function setPeekDestination(place) {
    peekDest = place || null;
    if (bar) updateBar();
}

// ---------- Dragging and tapping the handle ----------

function tapHandle() {
    if (cardOpen) {
        setSheetState(state === "full" ? "half" : "full");
        return;
    }
    const pair = hasRoute() ? ["peek", "half"] : ["half", "full"];
    setSheetState(state === pair[0] ? pair[1] : pair[0]);
}

function bindHandle(handle) {
    let startY = 0;
    let startHeight = 0;
    let lastY = 0;
    let lastTime = 0;
    let velocity = 0; // pixels per millisecond, positive = moving up
    let moved = false;
    let target = null; // the box that is being dragged (the route sheet or the block card)

    handle.addEventListener("pointerdown", (event) => {
        if (!PHONE.matches) return;
        target = cardOpen ? card : panel;
        dragging = true;
        moved = false;
        startY = lastY = event.clientY;
        lastTime = event.timeStamp;
        velocity = 0;
        startHeight = target.offsetHeight;
        target.classList.add("is-dragging"); // no animation while the finger is down
        handle.setPointerCapture(event.pointerId);
    });

    handle.addEventListener("pointermove", (event) => {
        if (!dragging) return;
        const all = heights();
        const delta = startY - event.clientY; // finger up = positive = taller
        if (Math.abs(delta) > TAP_MOVE_PX) moved = true;

        const elapsed = event.timeStamp - lastTime;
        if (elapsed > 0) velocity = (lastY - event.clientY) / elapsed;
        lastY = event.clientY;
        lastTime = event.timeStamp;

        const lowest = cardOpen ? Math.round(all.half * 0.5) : all.peek;
        showHeight(Math.min(all.full, Math.max(lowest, startHeight + delta)));
    });

    function endDrag(event, cancelled) {
        if (!dragging) return;
        dragging = false;
        const projected = target.offsetHeight + velocity * FLICK_MS;
        target.classList.remove("is-dragging");
        if (handle.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId);

        if (!moved && !cancelled) {
            tapHandle();
            return;
        }

        const all = heights();

        // Pulling the block card far down closes it
        if (cardOpen && projected < all.half * 0.75) {
            closeCard();
            return;
        }

        // Otherwise go to the nearest of the heights
        const names = cardOpen ? ["half", "full"] : ["peek", "half", "full"];
        let best = names[0];
        for (const name of names) {
            if (Math.abs(projected - all[name]) < Math.abs(projected - all[best])) best = name;
        }
        setSheetState(best);
    }

    handle.addEventListener("pointerup", (event) => endDrag(event, false));
    handle.addEventListener("pointercancel", (event) => endDrag(event, true));

    // Keyboard: Enter or Space on the handle (a finger tap is already handled above;
    // detail is 0 only for keyboard "clicks")
    handle.addEventListener("click", (event) => {
        if (event.detail === 0) tapHandle();
    });
}

// ---------- Setup ----------

function placeAttribution() {
    const map = getMap();
    if (map && map.attributionControl) {
        map.attributionControl.setPosition(PHONE.matches ? "topright" : "bottomright");
    }
}

// Tap a name in the floating bar: show the form
function editRoute() {
    setSheetState("half");
    setTimeout(() => {
        const controls = panel.querySelector(".controls");
        if (controls) controls.scrollIntoView({ block: "start", behavior: "smooth" });
    }, 40);
}

export function initSheet() {
    panel = document.querySelector(".route-panel");
    card = $("block-panel");
    bar = $("peek-bar");
    pill = $("route-bar");
    summary = $("pk-summary");
    info = $("route-info");
    directions = $("directions");
    startSelect = $("start-select");
    endSelect = $("end-select");
    const handle = $("sheet-handle");
    if (!panel || !card || !bar || !pill || !summary || !info || !directions || !handle) return;
    if (!startSelect || !endSelect) return;

    // The block card gets its own handle (the page has one handle, so we copy it)
    cardHandle = handle.cloneNode(true);
    cardHandle.removeAttribute("id");
    cardHandle.classList.add("in-card");
    bindHandle(handle);
    bindHandle(cardHandle);

    setSheetState("half"); // at the start the From and To fields are visible
    placeAttribution();
    updateBar();
    updatePill();

    // ---------- Buttons ----------
    $("rb-start").addEventListener("click", editRoute);
    $("rb-end").addEventListener("click", editRoute);

    $("rb-swap").addEventListener("click", () => {
        // "My location" only exists in the From list, so it cannot be swapped
        if (!startSelect.value || !endSelect.value || startSelect.value === "me") return;
        const from = startSelect.value;
        startSelect.value = endSelect.value;
        endSelect.value = from;
        startSelect.dispatchEvent(new Event("change")); // ui.js updates the Explore distances
        $("route-btn").click();
    });

    $("pk-steps").addEventListener("click", () => {
        setSheetState(state === "peek" ? "half" : "full");
    });
    $("pk-gps").addEventListener("click", () => $("gps-btn").click());
    $("pk-share").addEventListener("click", () => {
        const share = findShareButton();
        if (share) share.click();
    });
    $("pk-dest").addEventListener("click", () => {
        if (peekDest && peekDest.blockId) openBlockCard(peekDest.blockId);
    });

    // ---------- Reacting to the rest of the page ----------

    // ui.js writes every message and the route text into #route-info
    new MutationObserver(() => {
        updateBar();
        updatePill();
    }).observe(info, { childList: true, characterData: true, subtree: true });

    startSelect.addEventListener("change", updatePill);
    endSelect.addEventListener("change", updatePill);

    // A route was found (the directions appear): drop to the small strip so the map is visible
    // and fit the route into the part of the map that is still uncovered.
    new MutationObserver(() => {
        updateBar();
        if (!PHONE.matches || !hasRoute() || cardOpen) return;
        setSheetState("peek");
        fitRouteInView();
    }).observe(directions, { attributes: true, attributeFilter: ["hidden"] });

    // The block card opened or closed
    document.addEventListener("blockcard:toggle", () => {
        const wasOpen = cardOpen;
        cardOpen = Boolean(PHONE.matches && !card.hidden);
        panel.classList.toggle("sheet-hidden", cardOpen);

        if (cardOpen) {
            // The card is drawn again for every block, so its handle is put back each time
            const top = card.querySelector(".bc-top");
            if (top && !top.contains(cardHandle)) top.prepend(cardHandle);
            if (!wasOpen) {
                stateBeforeCard = state;
                setSheetState("half");
            }
        } else if (wasOpen) {
            setSheetState(hasRoute() ? "peek" : stateBeforeCard === "peek" ? "half" : stateBeforeCard);
        }
        updatePill();
    });

    // Typing in the card's search box: use the tall sheet so the answer is easy to see
    card.addEventListener("focusin", (event) => {
        if (PHONE.matches && event.target.classList && event.target.classList.contains("bc-input")) {
            setSheetState("full");
        }
    });

    // Turning the phone, or a laptop window crossing 768px
    PHONE.addEventListener("change", () => {
        placeAttribution();
        cardOpen = Boolean(PHONE.matches && !card.hidden);
        panel.classList.toggle("sheet-hidden", cardOpen);
        if (PHONE.matches) setSheetState(state);
        updatePill();
        const map = getMap();
        if (map) map.invalidateSize();
    });

    // The screen height changes when the phone's address bar hides or shows
    window.addEventListener("resize", () => {
        if (PHONE.matches && !dragging) setSheetState(state);
    });
}