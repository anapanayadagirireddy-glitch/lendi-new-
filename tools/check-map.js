// tools/check-map.js
// Looks for problems in the route data (data/nodes.json and data/edges.json).
// It does NOT change anything. It only prints what looks wrong, so you can fix it.
//
// Run it from your project folder with:   node tools/check-map.js
//
// What it looks for:
//   1. Points that sit right next to another path but are NOT connected to it
//      (this is what made the route go the long way round the garden).
//   2. Two paths that cross each other but have no shared point, so you cannot turn from one to the other.
//   3. Places in places.json where the walking route is much longer than the straight line.

const fs = require("fs");
const path = require("path");

const DATA = path.join(__dirname, "..", "data");
const NEAR_M = 5; // "right next to another path" means closer than this (meters)

function readJson(name, fallback) {
    try {
        return JSON.parse(fs.readFileSync(path.join(DATA, name), "utf8"));
    } catch (error) {
        return fallback;
    }
}

const nodesList = readJson("nodes.json", []);
const edgesList = readJson("edges.json", []);
const places = readJson("places.json", []);

if (nodesList.length === 0) {
    console.log("data/nodes.json is missing or empty. Run:  node tools/convert.js");
    process.exit(1);
}

// ---------- Helpers ----------
function haversine(lat1, lng1, lat2, lng2) {
    const R = 6371000;
    const toRad = (deg) => (deg * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
}

// Convert to meters around a point, so we can do simple geometry
function xy(origin, p) {
    return [
        (p.lng - origin.lng) * 111320 * Math.cos((origin.lat * Math.PI) / 180),
        (p.lat - origin.lat) * 110540,
    ];
}

// Closest point on the straight piece a-b to the point p
function pointToEdge(p, a, b) {
    const [ax, ay] = xy(p, a);
    const [bx, by] = xy(p, b);
    const dx = bx - ax;
    const dy = by - ay;
    const lengthSquared = dx * dx + dy * dy;
    let t = lengthSquared === 0 ? 0 : -(ax * dx + ay * dy) / lengthSquared;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(ax + t * dx, ay + t * dy);
}

// Do two straight pieces cross each other? (they must cross in the middle of both)
function crossPoint(a1, a2, b1, b2) {
    const [p1x, p1y] = xy(a1, a1);
    const [p2x, p2y] = xy(a1, a2);
    const [p3x, p3y] = xy(a1, b1);
    const [p4x, p4y] = xy(a1, b2);
    const d = (p2x - p1x) * (p4y - p3y) - (p2y - p1y) * (p4x - p3x);
    if (Math.abs(d) < 1e-9) return null; // parallel
    const t = ((p3x - p1x) * (p4y - p3y) - (p3y - p1y) * (p4x - p3x)) / d;
    const u = ((p3x - p1x) * (p2y - p1y) - (p3y - p1y) * (p2x - p1x)) / d;
    if (t <= 0.001 || t >= 0.999 || u <= 0.001 || u >= 0.999) return null;
    return {
        lat: a1.lat + (p1y + t * (p2y - p1y)) / 110540,
        lng: a1.lng + (p1x + t * (p2x - p1x)) / (111320 * Math.cos((a1.lat * Math.PI) / 180)),
    };
}

// ---------- Build the graph ----------
const nodes = new Map(nodesList.map((n) => [n.id, n]));
const adj = new Map(nodesList.map((n) => [n.id, []]));
for (const e of edgesList) {
    adj.get(e.from).push({ to: e.to, d: e.distance });
    adj.get(e.to).push({ to: e.from, d: e.distance });
}

// Walking distance from one point to every other point (the graph is small, so this is fast)
function distancesFrom(start) {
    const dist = new Map(nodesList.map((n) => [n.id, Infinity]));
    dist.set(start, 0);
    const done = new Set();
    for (; ;) {
        let u = null;
        let best = Infinity;
        for (const [id, d] of dist) if (!done.has(id) && d < best) { best = d; u = id; }
        if (u === null) break;
        done.add(u);
        for (const { to, d } of adj.get(u)) {
            if (dist.get(u) + d < dist.get(to)) dist.set(to, dist.get(u) + d);
        }
    }
    return dist;
}

const fmt = (n) => `(${n.lat.toFixed(6)}, ${n.lng.toFixed(6)})`;

console.log(`Route data: ${nodesList.length} points, ${edgesList.length} path pieces\n`);

// ---------- Check 1: points next to another path but not connected to it ----------
console.log(`CHECK 1: points less than ${NEAR_M} m from another path, but not connected to it`);
let problems1 = 0;
for (const n of nodesList) {
    const own = new Set(adj.get(n.id).map((x) => x.to));
    own.add(n.id);
    const dist = distancesFrom(n.id);
    for (const e of edgesList) {
        if (own.has(e.from) || own.has(e.to)) continue;
        const gap = pointToEdge(n, nodes.get(e.from), nodes.get(e.to));
        if (gap > NEAR_M) continue;
        const walk = Math.min(dist.get(e.from), dist.get(e.to));
        if (walk > gap + 25) {
            problems1++;
            const kind = adj.get(n.id).length === 1 ? "dead end" : "point";
            console.log(
                `  ${kind} ${n.id} ${fmt(n)} is ${gap.toFixed(1)} m from another path, ` +
                `but walking between them is ${walk === Infinity ? "impossible" : Math.round(walk) + " m"}`
            );
        }
    }
}
if (problems1 === 0) console.log("  nothing found");

// ---------- Check 2: paths that cross without a shared point ----------
console.log("\nCHECK 2: paths that cross each other without a shared point");
let problems2 = 0;
for (let i = 0; i < edgesList.length; i++) {
    for (let j = i + 1; j < edgesList.length; j++) {
        const a = edgesList[i];
        const b = edgesList[j];
        if (a.from === b.from || a.from === b.to || a.to === b.from || a.to === b.to) continue;
        const hit = crossPoint(nodes.get(a.from), nodes.get(a.to), nodes.get(b.from), nodes.get(b.to));
        if (hit) {
            problems2++;
            console.log(`  two paths cross at ${fmt(hit)} but are not connected`);
        }
    }
}
if (problems2 === 0) console.log("  nothing found");

// ---------- Check 3: places where the walk is much longer than the straight line ----------
console.log("\nCHECK 3: places where the walking route is much longer than the straight line");
const spots = places
    .filter((p) => typeof p.lat === "number" && typeof p.lng === "number")
    .map((p) => {
        let best = null;
        for (const n of nodesList) {
            const d = haversine(p.lat, p.lng, n.lat, n.lng);
            if (!best || d < best.d) best = { id: n.id, d };
        }
        return { name: p.name, lat: p.lat, lng: p.lng, node: best.id };
    });
const detours = [];
for (let i = 0; i < spots.length; i++) {
    const dist = distancesFrom(spots[i].node);
    for (let j = i + 1; j < spots.length; j++) {
        const straight = haversine(spots[i].lat, spots[i].lng, spots[j].lat, spots[j].lng);
        const walk = dist.get(spots[j].node);
        if (straight > 5 && walk >= 120 && walk >= 3 * straight) {
            detours.push({ a: spots[i].name, b: spots[j].name, straight, walk });
        }
    }
}
detours.sort((x, y) => y.walk / y.straight - x.walk / x.straight);
if (spots.length === 0) {
    console.log("  (no places.json found)");
} else if (detours.length === 0) {
    console.log("  nothing found");
} else {
    for (const d of detours.slice(0, 10)) {
        console.log(`  ${d.a} to ${d.b}: straight ${Math.round(d.straight)} m, walking ${Math.round(d.walk)} m`);
    }
    console.log("  (some detours are normal, like a building in the way. Look for ones that surprise you.)");
}

console.log(
    problems1 + problems2 === 0
        ? "\nNo broken connections found in the route data."
        : `\nFound ${problems1 + problems2} possible broken connection(s). Send me this output.`
);