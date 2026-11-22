// card.js
// The block info card: shows a block's rooms ONE FLOOR AT A TIME (floor chips), plus a search
// bar that answers like "DBMS Lab, 1st floor. Front block, far right end".
//
// Where it appears: this file fills <aside id="block-panel"> from index.html.
// On a wide laptop that panel is docked next to the map, on a phone it is a sheet at the
// bottom (see card.css). If the page has no such element (like card-test.html), a floating
// card is created instead.
//
// Public functions (used by other files):
//   loadBlocks()          load the block data files (call once at startup)
//   openBlockCard(id)     open the card for a block, e.g. openBlockCard("sai-block")
//   closeCard()           close it
//
// Event: whenever the card opens or closes, document gets "blockcard:toggle" with
// detail { open, changed }. ui.js uses it to resize the map.

import { Trie } from "./trie.js";

// The groups shown inside each floor, in this order
const CATEGORIES = [
    { key: "classes", label: "Classes" },
    { key: "labs", label: "Labs" },
    { key: "staffRooms", label: "Staff rooms" },
    { key: "others", label: "Other spaces" },
];

const MAX_SUGGESTIONS = 8;

let blocks = [];
let cardEl = null;

// ---------- Search logic (no screen code here, so it is easy to test) ----------

// "S&H LH-1" -> ["s", "h", "lh", "1"]
export function tokenize(text) {
    return text.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}

// Turns a block into one flat list of rooms, each knowing its floor and group
export function flattenRooms(block) {
    const rooms = [];
    block.floors.forEach((floor, floorIndex) => {
        for (const category of CATEGORIES) {
            (floor[category.key] || []).forEach((room, i) => {
                rooms.push({
                    id: `${floorIndex}-${category.key}-${i}`,
                    name: room.name,
                    directions: room.directions,
                    keywords: room.keywords || [],
                    verify: Boolean(room.verify), // true = location not confirmed yet
                    floorName: floor.floor,
                    floorIndex,
                    categoryLabel: category.label,
                });
            });
        }
    });
    return rooms;
}

// Puts every word of every room name (and its keywords) into a trie
export function buildTrie(rooms) {
    const trie = new Trie();
    for (const room of rooms) {
        const words = [...tokenize(room.name), ...room.keywords.flatMap(tokenize)];
        for (const word of words) {
            trie.insert(word, room.id);
        }
    }
    return trie;
}

// Finds rooms matching what the user typed.
// Each typed word must match the START of some word in the room name.
// "dbms lab" -> rooms that have a word starting with "dbms" AND a word starting with "lab".
export function searchRooms(rooms, trie, query) {
    const tokens = tokenize(query);
    if (tokens.length === 0) return [];

    let matchingIds = null;
    for (const token of tokens) {
        const ids = trie.search(token);
        matchingIds = matchingIds
            ? new Set([...matchingIds].filter((id) => ids.has(id))) // keep only ids in both
            : ids;
        if (matchingIds.size === 0) return [];
    }

    // Rooms where a typed word matches a whole word exactly come first,
    // so "lh-1" shows "LH-1" before "LH-10" and "LH-11".
    const exactScore = (room) => {
        const words = tokenize(room.name);
        return tokens.filter((t) => words.includes(t)).length;
    };

    return rooms
        .filter((room) => matchingIds.has(room.id))
        .sort(
            (a, b) =>
                exactScore(b) - exactScore(a) ||
                a.floorIndex - b.floorIndex ||
                a.name.localeCompare(b.name)
        );
}

// ---------- Loading data ----------

// One file per building. To add another building later, create its file in the data folder
// and add its path to this list.
const BLOCK_FILES = ["data/blocks.json", "data/blocks-mechanical.json"];

export async function loadBlocks(urls = BLOCK_FILES) {
    blocks = [];
    for (const url of urls) {
        try {
            const response = await fetch(url);
            if (!response.ok) continue; // a missing file just means no card for that building
            const data = await response.json();
            blocks.push(...data.blocks);
        } catch (error) {
            console.warn(`Could not load ${url}:`, error);
        }
    }
}

// ---------- Small helpers ----------

// Create an element with a class and text
function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
}

// The short text on a floor chip: "Ground floor" -> "G", "2nd floor (CSSE Dept)" -> "2"
export function floorShortLabel(name, index) {
    if (/ground/i.test(name)) return "G";
    const match = name.match(/^(\d+)/);
    return match ? match[1] : String(index);
}

// Finds the card box. Normally it is <aside id="block-panel"> in index.html.
function getCardElement() {
    if (cardEl) return cardEl;

    cardEl = document.getElementById("block-panel");
    if (!cardEl) {
        // No panel in this page (card-test.html): make a floating card
        cardEl = el("aside", "block-card bc-floating");
        cardEl.hidden = true;
        document.body.appendChild(cardEl);
    }
    cardEl.classList.add("block-card");
    cardEl.setAttribute("aria-label", "Block details");
    return cardEl;
}

// Tells the page that the card opened or closed (so the map can be resized)
function announce(open, changed) {
    document.dispatchEvent(new CustomEvent("blockcard:toggle", { detail: { open, changed } }));
}

export function closeCard() {
    if (!cardEl || cardEl.hidden) return;
    cardEl.hidden = true;
    announce(false, true);
}

// ---------- Drawing the card ----------

export function openBlockCard(blockId) {
    const block = blocks.find((b) => b.id === blockId);
    if (!block) {
        console.warn(`No block data for "${blockId}"`);
        return;
    }

    const rooms = flattenRooms(block);
    const trie = buildTrie(rooms);
    const roomById = new Map(rooms.map((room) => [room.id, room]));

    const card = getCardElement();
    const wasOpen = !card.hidden;
    card.hidden = false;
    card.replaceChildren();
    card.scrollTop = 0;

    let currentFloor = 0; // the floor chip that is switched on
    let selectedId = null; // the room that is highlighted (or null)

    // ----- The top part: it stays visible while the room list scrolls -----
    const sticky = el("div", "bc-top");

    // Header
    const header = el("div", "bc-header");
    header.append(el("h2", "bc-title", block.name));
    const closeBtn = el("button", "bc-close", "\u2715");
    closeBtn.type = "button";
    closeBtn.setAttribute("aria-label", "Close");
    closeBtn.addEventListener("click", closeCard);
    header.append(closeBtn);

    // Search bar and its suggestions
    const search = el("div", "bc-search");
    const input = el("input", "bc-input");
    input.type = "search";
    input.placeholder = `Search a room or lab in ${block.name}`;
    input.setAttribute("aria-label", "Search rooms");
    const suggestions = el("ul", "bc-suggestions");
    search.append(input, suggestions);

    // The answer message
    const answer = el("div", "bc-answer");
    answer.setAttribute("aria-live", "polite");
    answer.hidden = true;

    // Floor chips: G, 1, 2, 3, 4
    const chips = el("div", "bc-chips");
    chips.setAttribute("role", "group");
    chips.setAttribute("aria-label", "Floors");
    const chipEls = block.floors.map((floor, index) => {
        const chip = el("button", "bc-chip", floorShortLabel(floor.floor, index));
        chip.type = "button";
        chip.title = floor.floor;
        chip.setAttribute("aria-label", floor.floor);
        chip.addEventListener("click", () => {
            currentFloor = index;
            renderFloor();
        });
        chips.append(chip);
        return chip;
    });

    sticky.append(header, search, answer, chips);

    // ----- The scrolling part: how to read directions, floor name, room list -----
    const note = el("details", "bc-note");
    note.append(el("summary", "", "How to read the directions"), el("p", "", block.entranceNote));

    const floorTitle = el("h3", "bc-floor-title");
    const list = el("div", "bc-list");

    // Draws the rooms of the current floor (one floor at a time)
    function renderFloor() {
        const floor = block.floors[currentFloor];
        chipEls.forEach((chip, index) => chip.setAttribute("aria-pressed", String(index === currentFloor)));
        floorTitle.textContent = floor.floor;
        list.replaceChildren();

        let anyRoom = false;
        for (const category of CATEGORIES) {
            const items = floor[category.key] || [];
            if (items.length === 0) continue;
            anyRoom = true;

            list.append(el("h4", "bc-group", category.label));
            const ul = el("ul", "bc-rooms");
            items.forEach((room, i) => {
                const id = `${currentFloor}-${category.key}-${i}`;
                const li = el("li", "", room.name);
                li.tabIndex = 0;
                li.dataset.id = id;
                if (room.verify) li.append(el("span", "bc-tbc", "to be confirmed"));
                if (id === selectedId) {
                    li.classList.add("bc-highlight");
                }
                ul.append(li);
            });
            list.append(ul);
        }

        if (!anyRoom) list.append(el("p", "bc-empty", "No rooms listed for this floor yet."));
    }

    // Show the answer message for one room, switch to its floor and highlight it
    function showRoom(room) {
        suggestions.replaceChildren();
        selectedId = room.id;
        currentFloor = room.floorIndex;

        answer.hidden = false;
        answer.replaceChildren(
            el("strong", "", room.name),
            el("span", "", ` \u2013 ${room.floorName}. ${room.directions}.`)
        );
        if (room.verify) answer.append(el("span", "bc-tbc", "to be confirmed"));

        // Flash the message so the eye goes to it
        answer.classList.remove("bc-flash");
        void answer.offsetWidth; // restarts the animation
        answer.classList.add("bc-flash");

        renderFloor();

        const li = list.querySelector(`li[data-id="${room.id}"]`);
        if (li) {
            // Keep the room clear of the top part that stays on screen
            li.style.scrollMarginTop = `${sticky.offsetHeight + 8}px`;
            li.scrollIntoView({ block: "nearest", behavior: "smooth" });
        }
    }

    // Tapping a room in the list shows its answer (one listener for the whole list)
    list.addEventListener("click", (e) => {
        const li = e.target.closest("li[data-id]");
        if (li) showRoom(roomById.get(li.dataset.id));
    });
    list.addEventListener("keydown", (e) => {
        if (e.key !== "Enter" && e.key !== " ") return;
        const li = e.target.closest("li[data-id]");
        if (!li) return;
        e.preventDefault();
        showRoom(roomById.get(li.dataset.id));
    });

    // Typing in the search bar
    input.addEventListener("input", () => {
        const query = input.value.trim();
        suggestions.replaceChildren();
        answer.hidden = true;
        if (selectedId !== null) {
            selectedId = null; // remove the highlight
            renderFloor();
        }
        if (!query) return;

        const results = searchRooms(rooms, trie, query);

        if (results.length === 0) {
            answer.hidden = false;
            answer.replaceChildren(el("span", "", `No room matching "${query}" in ${block.name}.`));
            return;
        }

        results.slice(0, MAX_SUGGESTIONS).forEach((room) => {
            const li = el("li");
            const btn = el("button", "bc-suggestion");
            btn.type = "button";
            btn.append(el("span", "bc-s-name", room.name), el("span", "bc-s-floor", room.floorName));
            btn.addEventListener("click", () => showRoom(room));
            li.append(btn);
            suggestions.append(li);
        });

        if (results.length > MAX_SUGGESTIONS) {
            suggestions.append(
                el("li", "bc-more", `${results.length - MAX_SUGGESTIONS} more. Type more letters to narrow it down.`)
            );
        }
    });

    // Enter picks the first suggestion
    input.addEventListener("keydown", (e) => {
        if (e.key !== "Enter") return;
        const results = searchRooms(rooms, trie, input.value.trim());
        if (results.length > 0) showRoom(results[0]);
    });

    // Escape closes the card (but not while you are typing in the search box,
    // where Escape just clears the text)
    card.onkeydown = (e) => {
        if (e.key === "Escape" && e.target !== input) closeCard();
    };

    card.append(sticky, note, floorTitle, list);
    renderFloor();
    announce(true, !wasOpen);
}