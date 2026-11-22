// dock.js - ONE panel for everything on a laptop.
//
// On a laptop the block card (rooms and labs) used to be a second box next to the map.
// Now it lives INSIDE the left route panel, under two tabs:
//
//     [ Route ]  [ Rooms and labs ]
//
//   Route            -> the directions and the Explore list (as before)
//   Rooms and labs   -> the block card for the destination
//
// On a phone nothing changes: the card stays in the bottom sheet (js/sheet.js).
// This file only moves the existing <aside id="block-panel"> into the panel on a laptop
// and back to the page on a phone. js/card.js is not changed.

import { openBlockCard, closeCard } from "./card.js";

const LAPTOP = window.matchMedia("(min-width: 768px)");

let panel = null; // <aside class="route-panel">
let card = null; // <aside id="block-panel">
let home = null; // where the card lives on a phone (the .app box)
let tabs = null; // the two tab buttons
let slot = null; // the box inside the panel that holds the card on a laptop
let routeTab = null;
let detailsTab = null;
let dest = null; // the destination place of the current route, if it is a block

export function initDock() {
    panel = document.querySelector(".route-panel");
    card = document.getElementById("block-panel");
    if (!panel || !card) return;
    home = card.parentElement;

    tabs = document.createElement("div");
    tabs.className = "panel-tabs";
    tabs.setAttribute("role", "tablist");
    tabs.hidden = true;

    routeTab = makeTab("Route");
    detailsTab = makeTab("Rooms and labs");
    tabs.append(routeTab, detailsTab);

    slot = document.createElement("div");
    slot.className = "panel-details";

    // The tabs sit at the top of the panel (laptop.css orders them), the card box after them
    panel.append(tabs, slot);

    routeTab.addEventListener("click", () => {
        closeCard();
        panel.scrollTop = 0;
    });

    detailsTab.addEventListener("click", () => {
        if (card.hidden && dest) openBlockCard(dest.blockId);
        panel.scrollTop = 0;
    });

    document.addEventListener("blockcard:toggle", refresh);
    LAPTOP.addEventListener("change", place);
    place();
}

// ui.js calls this after every Find route. place = the destination, or null.
export function setDockBlock(place) {
    dest = place && place.blockId ? place : null;
    if (tabs) refresh();
}

function makeTab(text) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "panel-tab";
    button.setAttribute("role", "tab");
    button.textContent = text;
    return button;
}

// Laptop: the card goes inside the panel. Phone: it goes back to the page.
function place() {
    if (LAPTOP.matches) slot.append(card);
    else home.append(card);
    refresh();
}

function refresh() {
    const open = !card.hidden;
    const onLaptop = LAPTOP.matches;
    const show = onLaptop && (open || Boolean(dest));

    tabs.hidden = !show;
    panel.classList.toggle("has-card", onLaptop && open);
    routeTab.setAttribute("aria-selected", String(!open));
    detailsTab.setAttribute("aria-selected", String(open));
    detailsTab.disabled = !open && !dest;
}