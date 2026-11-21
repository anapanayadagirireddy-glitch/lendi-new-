// map.js
// Everything about the Leaflet map lives here: setting it up,
// drawing the route, placing markers, showing the user's location.
// Other files (like ui.js) import the functions they need from this file.

// Leaflet is loaded in index.html, so the global "L" is already available.

import { createPlaceIcon } from "./markers.js";

// Campus center, taken from your OpenStreetMap link. Order is [latitude, longitude].
const CAMPUS_CENTER = [18.019461, 83.40109];
const DEFAULT_ZOOM = 17;

// Name labels under the markers are shown from this zoom level and higher.
// (Set it to 17 to see every name from the start. Near the Canteen and the Mechanical block
// some labels will then touch each other.)
const LABEL_MIN_ZOOM = 18;

// These variables remember things between function calls
let map = null; // the Leaflet map itself
let markersLayer = null; // a group that holds all place markers
let selectedMarker = null; // the marker of the chosen destination (drawn bigger)
let routeLine = null; // the green line: the part of the route still to walk
let walkedLine = null; // the grey line: the part of the route already walked
let userMarker = null; // the dot showing the user's GPS position

// ---------- Setup ----------

// Creates the map inside <main id="map"> and adds the OpenStreetMap picture tiles.
export function initMap() {
  map = L.map("map").setView(CAMPUS_CENTER, DEFAULT_ZOOM);

  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap contributors",
  }).addTo(map);

  markersLayer = L.layerGroup().addTo(map);

  // Show the name labels under the markers only when the map is zoomed in enough.
  // The CSS (markers.css) does the showing; we only switch the "show-labels" class.
  const updateLabels = () =>
    map.getContainer().classList.toggle("show-labels", map.getZoom() >= LABEL_MIN_ZOOM);
  map.on("zoomend", updateLabels);
  updateLabels();

  return map;
}

export function getMap() {
  return map;
}

// ---------- Markers (named places) ----------

// Adds one round marker for a place, like "Library".
//   options.category   : "block", "hostel", "food", "gate", "parking", "outdoor", "toilet"
//   options.hasDetails : true if tapping it opens a block card (adds a small white dot)
// Returns the Leaflet marker, so the caller can add a click handler or select it later.
export function addPlaceMarker(name, lat, lng, options = {}) {
  return L.marker([lat, lng], {
    icon: createPlaceIcon(name, options),
    title: name, // the browser shows this when you hover (laptop)
    alt: name,
    riseOnHover: true,
  })
    .bindPopup(name, { offset: [0, -2] })
    .addTo(markersLayer);
}

// Makes one marker bigger (the chosen destination). Pass null to go back to normal for all.
export function setSelectedMarker(marker) {
  if (selectedMarker) {
    const old = selectedMarker.getElement();
    if (old) old.classList.remove("mk-selected");
    selectedMarker.setZIndexOffset(0);
  }

  selectedMarker = marker || null;

  if (selectedMarker) {
    const element = selectedMarker.getElement();
    if (element) element.classList.add("mk-selected");
    selectedMarker.setZIndexOffset(500); // above the other markers, below the GPS arrow
  }
}

export function clearPlaceMarkers() {
  selectedMarker = null;
  markersLayer.clearLayers();
}

// ---------- Route line ----------

// latlngs is a list of points: [[lat, lng], [lat, lng], ...]
// fit = true  : zoom the map so the whole route is visible (normal)
// fit = false : leave the map where it is (used when we draw a new route while you walk)
export function drawRoute(latlngs, fit = true) {
  clearRoute(); // remove the old route first (green and grey)

  routeLine = L.polyline(latlngs, {
    color: "#0b6e4f",
    weight: 6,
    opacity: 0.9,
  }).addTo(map);

  if (fit) {
    map.fitBounds(routeLine.getBounds(), { padding: [40, 40] });
  }
}

// Zooms the map so the whole route is visible again (for example after the map got narrower
// because the block panel opened).
// bottomExtra = pixels at the bottom that something covers (the sheet on a phone).
export function fitRoute(bottomExtra = 0) {
  if (!routeLine) return;
  // On a phone the floating From/To bar covers the top of the map
  const topExtra = window.matchMedia("(max-width: 767.98px)").matches ? 64 : 0;
  map.fitBounds(routeLine.getBounds(), {
    paddingTopLeft: [40, 40 + topExtra],
    paddingBottomRight: [40, 40 + bottomExtra],
  });
}

// Moves the map so a place sits in the middle of the part you can see (between the floating
// From/To bar and the bottom sheet on a phone). coverBottom = pixels the sheet covers.
export function focusPlace(lat, lng, zoom, coverBottom = 0) {
  const topExtra = window.matchMedia("(max-width: 767.98px)").matches ? 64 : 0;
  map.setView([lat, lng], zoom, { animate: false });
  map.panBy([0, (coverBottom - topExtra) / 2], { animate: false });
}

// Updates the route while you walk, without redrawing it and without moving the map.
//   remaining : the points still to walk (drawn green)
//   walked    : the points already walked (drawn grey)
export function updateRoute(remaining, walked = []) {
  if (routeLine) {
    routeLine.setLatLngs(remaining);
  }

  if (walked.length >= 2) {
    if (!walkedLine) {
      walkedLine = L.polyline(walked, {
        color: "#9ca3af",
        weight: 6,
        opacity: 0.9,
      }).addTo(map);
      if (routeLine) routeLine.bringToFront(); // the green line stays on top of the grey one
    } else {
      walkedLine.setLatLngs(walked);
    }
  }
}

export function clearRoute() {
  if (routeLine) {
    map.removeLayer(routeLine);
    routeLine = null;
  }
  if (walkedLine) {
    map.removeLayer(walkedLine);
    walkedLine = null;
  }
}

// ---------- User location (used later by GPS) ----------

export function showUserLocation(lat, lng) {
  if (userMarker) {
    userMarker.setLatLng([lat, lng]);
  } else {
    userMarker = L.circleMarker([lat, lng], {
      radius: 8,
      color: "#ffffff",
      weight: 3,
      fillColor: "#1d4ed8",
      fillOpacity: 1,
    }).addTo(map);
  }
}

// ---------- Helper for you while building ----------

// Click anywhere on the map and a popup shows that spot's coordinates.
// The line is also copied to your clipboard, ready to paste into places.json.
// You can remove it at the end.
export function enableClickCoords() {
  map.on("click", (e) => {
    const lat = e.latlng.lat.toFixed(6);
    const lng = e.latlng.lng.toFixed(6);
    const line = `"lat": ${lat}, "lng": ${lng}`;
    L.popup().setLatLng(e.latlng).setContent(`${lat}, ${lng}`).openOn(map);
    if (navigator.clipboard) navigator.clipboard.writeText(line).catch(() => { });
    console.log(line);
  });
}

// ---------- Debug: draw the whole graph so we can check the data ----------

let networkLayer = null;

// nodes = [{ id, lat, lng }, ...]    edges = [{ from, to, distance }, ...]
// Blue lines are edges (hover to see the length in meters).
// Red dots are nodes (hover to see the node id).
export function drawNetwork(nodes, edges) {
  if (networkLayer) map.removeLayer(networkLayer);
  networkLayer = L.layerGroup().addTo(map);

  // A quick lookup: node id -> node
  const byId = new Map(nodes.map((n) => [n.id, n]));

  for (const e of edges) {
    const a = byId.get(e.from);
    const b = byId.get(e.to);
    L.polyline(
      [
        [a.lat, a.lng],
        [b.lat, b.lng],
      ],
      { color: "#1d4ed8", weight: 4, opacity: 0.8 }
    )
      .bindTooltip(`${Math.round(e.distance)} m`)
      .addTo(networkLayer);
  }

  for (const n of nodes) {
    L.circleMarker([n.lat, n.lng], {
      radius: 4,
      color: "#b91c1c",
      weight: 2,
      fillColor: "#ffffff",
      fillOpacity: 1,
    })
      .bindTooltip(String(n.id))
      .addTo(networkLayer);
  }
}