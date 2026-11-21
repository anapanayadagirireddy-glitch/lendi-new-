// directions.js
// Turns a route (a list of [lat, lng] points) into written steps like
//   "Head east from Main gate", "Turn right near Garden", "Mechanical block is on your right".
//
// THE IDEA (in plain words):
//   Walk along the route and look at the direction you face. Every time the direction
//   changes a lot (more than TURN_DEG degrees), that is a turn. Left or right comes from
//   which way the direction changed. The distance of each step is how far you walk until
//   the next step.
//
// This file has no screen code. It only does maths, so it is easy to test.

import { haversine } from "./graph.js";

const TURN_DEG = 45; // a change of direction bigger than this is a turn
const SHARP_DEG = 130; // bigger than this: a sharp turn
const WINDOW_M = 10; // the direction is measured over about this many meters (smooths curves)
const MIN_STEP_M = 12; // two turns closer than this count as one
const START_SKIP_M = 6; // ignore turns this close to the start
const SHORT_FIRST_LEG_M = 12; // a first turn closer than this is a small jog, not a real turn
const END_SKIP_M = 10; // ignore turns this close to the destination
const LANDMARK_M = 25; // a place this close to a turn is named in the step
const SIDE_MIN_M = 6; // the destination must be this far to the side to say left or right
const MIN_POINT_GAP_M = 0.5; // points closer than this are treated as one point

const COMPASS = [
    "north",
    "north-east",
    "east",
    "south-east",
    "south",
    "south-west",
    "west",
    "north-west",
];

const toRad = (deg) => (deg * Math.PI) / 180;

// Direction from point a to point b in degrees: 0 = north, 90 = east (a and b are [lat, lng])
function bearing(a, b) {
    const [lat1, lng1] = a;
    const [lat2, lng2] = b;
    const y = Math.sin(toRad(lng2 - lng1)) * Math.cos(toRad(lat2));
    const x =
        Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
        Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(toRad(lng2 - lng1));
    return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

// How far you turn going from direction "from" to direction "to", between -180 and 180.
// Positive = clockwise = a right turn. Negative = a left turn.
function angleDiff(from, to) {
    return ((((to - from) % 360) + 540) % 360) - 180;
}

function compassName(degrees) {
    return COMPASS[Math.round(degrees / 45) % 8];
}

// Removes points that sit almost on top of each other (the route has some tiny pieces)
function cleanPoints(latlngs) {
    const out = [];
    for (const p of latlngs) {
        const last = out[out.length - 1];
        if (!last || haversine(last[0], last[1], p[0], p[1]) >= MIN_POINT_GAP_M) out.push(p);
    }
    // Always keep the real end of the route
    const end = latlngs[latlngs.length - 1];
    if (out.length > 0 && out[out.length - 1] !== end) {
        if (out.length === 1) out.push(end);
        else out[out.length - 1] = end;
    }
    return out;
}

// The point about WINDOW_M meters before / after point i (or the first / last point)
function indexBehind(cum, i) {
    let j = i;
    while (j > 0 && cum[i] - cum[j] < WINDOW_M) j--;
    return j;
}

function indexAhead(cum, i) {
    let k = i;
    while (k < cum.length - 1 && cum[k] - cum[i] < WINDOW_M) k++;
    return k;
}

// 63 m -> 65 m. Never less than 5 m.
function roundMeters(meters) {
    return Math.max(5, Math.round(meters / 5) * 5);
}

// The name of the closest place within LANDMARK_M of a point, or "" if there is none
function nearestPlaceName(places, point, skipNames) {
    let best = "";
    let bestDistance = LANDMARK_M;
    for (const place of places) {
        if (skipNames.includes(place.name)) continue;
        const d = haversine(point[0], point[1], place.lat, place.lng);
        if (d <= bestDistance) {
            bestDistance = d;
            best = place.name;
        }
    }
    return best;
}

// "Mechanical block is on your right", or "Arrive at Parking" when it is straight ahead
function arrivalText(pts, cum, destination, name) {
    if (!destination || typeof destination.lat !== "number") return `Arrive at ${name}`;

    const endIndex = pts.length - 1;
    const end = pts[endIndex];
    const heading = bearing(pts[indexBehind(cum, endIndex)], end);
    const distance = haversine(end[0], end[1], destination.lat, destination.lng);
    if (distance < SIDE_MIN_M) return `Arrive at ${name}`;

    const toDestination = bearing(end, [destination.lat, destination.lng]);
    const sideways = distance * Math.sin(toRad(angleDiff(heading, toDestination)));
    if (Math.abs(sideways) < SIDE_MIN_M) return `Arrive at ${name}`;
    return `${name} is on your ${sideways > 0 ? "right" : "left"}`;
}

// ---------- The main function ----------
// latlngs     : [[lat, lng], ...] from the start of the route to the destination
// options.from        : name of the start place, or null / "My location" (then it is left out)
// options.to          : name of the destination
// options.destination : the destination place { lat, lng } (used to say left or right at the end)
// options.places      : all places { name, lat, lng } (used to name landmarks at turns)
//
// Returns a list of steps:
//   { kind: "start" | "left" | "right" | "arrive", text, along, meters, bearing?, sharp? }
//   along  = meters from the start of the route to where the step begins
//   meters = how far you walk until the next step (null for the last step)
export function buildDirections(latlngs, options = {}) {
    const { from = null, to = "", destination = null, places = [] } = options;
    const pts = cleanPoints(latlngs || []);
    if (pts.length < 2) return [];

    // cum[i] = meters from the start up to point i
    const cum = [0];
    for (let i = 1; i < pts.length; i++) {
        cum.push(cum[i - 1] + haversine(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]));
    }
    const total = cum[cum.length - 1];

    // 1) Find the turns
    const turns = [];
    for (let i = 1; i < pts.length - 1; i++) {
        if (cum[i] < START_SKIP_M || total - cum[i] < END_SKIP_M) continue;
        const before = bearing(pts[indexBehind(cum, i)], pts[i]);
        const after = bearing(pts[i], pts[indexAhead(cum, i)]);
        const delta = angleDiff(before, after);
        if (Math.abs(delta) < TURN_DEG) continue;

        // Several points in a row can look like one turn: keep the sharpest one
        const last = turns[turns.length - 1];
        if (last && cum[i] - cum[last.index] < MIN_STEP_M) {
            if (Math.abs(delta) > Math.abs(last.delta)) turns[turns.length - 1] = { index: i, delta };
        } else {
            turns.push({ index: i, delta });
        }
    }

    // A tiny jog right at the start (for example from the gate onto the path) is not a turn.
    // We drop it and measure the starting direction after it.
    let startIndex = 0;
    if (turns.length > 0 && cum[turns[0].index] < SHORT_FIRST_LEG_M) {
        startIndex = turns[0].index;
        turns.shift();
    }

    // 2) Write the steps
    const fromName = from && from !== "My location" ? from : "";
    const destName = to || "your destination";
    const startBearing = bearing(pts[startIndex], pts[indexAhead(cum, startIndex)]);

    const steps = [
        {
            kind: "start",
            text: `Head ${compassName(startBearing)}${fromName ? ` from ${fromName}` : ""}`,
            along: 0,
            bearing: startBearing,
        },
    ];

    for (const turn of turns) {
        const right = turn.delta > 0;
        const sharp = Math.abs(turn.delta) >= SHARP_DEG;
        const side = right ? "right" : "left";
        const landmark = nearestPlaceName(places, pts[turn.index], [fromName, to]);
        const base = sharp ? `Make a sharp ${side}` : `Turn ${side}`;
        steps.push({
            kind: side,
            sharp,
            text: landmark ? `${base} near ${landmark}` : base,
            along: cum[turn.index],
        });
    }

    steps.push({
        kind: "arrive",
        text: arrivalText(pts, cum, destination, destName),
        along: total,
    });

    // 3) The distance of each step: how far until the next one
    for (let i = 0; i < steps.length - 1; i++) {
        steps[i].meters = roundMeters(steps[i + 1].along - steps[i].along);
    }
    steps[steps.length - 1].meters = null;

    return steps;
}