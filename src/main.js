import Globe from 'globe.gl';
import * as THREE from 'three';
import { feature } from 'topojson-client';
import { geoContains, geoCentroid } from 'd3-geo';
import { createIcons, MapPin, Lock, ArrowDown } from 'lucide';
import { getCountryName } from './countryNames.js';

// ─── State ───────────────────────────────────────────────────────────────────

const state = {
  features: [],       // all GeoJSON country features
  hovered: null,      // feature under cursor (hover mode)
  locked: null,       // feature when user clicked (lock mode)
  isLocked: false,
  // Exact lat/lon of the point the user interacted with
  activePoint: null,  // [lon, lat]
  // Computed antipode info
  antipodePoint: null,  // [lon, lat]
  antipodeFeature: null, // GeoJSON feature at antipode (or null if ocean)
};

let globe;
let globeControls;
let idleTimer;

// ─── Antipode math ───────────────────────────────────────────────────────────

function antipodeOf([lon, lat]) {
  const aLat = -lat;
  const aLon = lon >= 0 ? lon - 180 : lon + 180;
  return [aLon, aLat];
}

function findCountryAt([lon, lat]) {
  return state.features.find(f => geoContains(f, [lon, lat])) ?? null;
}

function coordsLabel([lon, lat]) {
  const latStr = `${Math.abs(lat).toFixed(1)}° ${lat >= 0 ? 'N' : 'S'}`;
  const lonStr = `${Math.abs(lon).toFixed(1)}° ${lon >= 0 ? 'E' : 'W'}`;
  return `${latStr}, ${lonStr}`;
}

// ─── DOM helpers ─────────────────────────────────────────────────────────────

const $ = id => document.getElementById(id);

function updateInfoPanel() {
  const activeFeature = state.isLocked ? state.locked : state.hovered;
  const panel = $('info-panel');
  const funFact = $('fun-fact');

  if (!activeFeature && !state.isLocked) {
    panel.classList.add('hidden');
    funFact.classList.add('hidden');
    return;
  }

  panel.classList.remove('hidden');

  // --- FROM side ---
  const fromName = activeFeature?.properties?.name ?? 'Somewhere';
  $('from-name').textContent = fromName;
  $('from-name').className = 'info-country is-blue';
  $('from-coords').textContent = state.activePoint ? coordsLabel(state.activePoint) : '';

  // --- TO side ---
  const isOcean = !state.antipodeFeature;
  const toName = isOcean ? 'The Ocean' : state.antipodeFeature.properties.name;

  $('to-name').textContent = toName;
  $('to-name').className = isOcean ? 'info-country is-ocean' : 'info-country is-red';
  $('to-coords').textContent = state.antipodePoint ? coordsLabel(state.antipodePoint) : '';

  // Fun fact only appears when the user clicks to lock a location
  if (state.isLocked) {
    funFact.textContent = funMessage(fromName, isOcean ? null : toName, isOcean);
    funFact.classList.remove('hidden');
  } else {
    funFact.classList.add('hidden');
  }
}

function funMessage(fromName, toName, isOcean) {
  if (isOcean) {
    const messages = [
      `Digging from ${fromName}? Pack your swim goggles — it's open ocean!`,
      `From ${fromName} you'd drill straight into the deep blue. Hope you can hold your breath!`,
      `${fromName} → Pacific nothingness. 71% of antipodes are ocean, and yours is one of them!`,
      `The bad news: no country on the other side of ${fromName}. The good news: no customs line!`,
    ];
    return messages[Math.floor(Math.random() * messages.length)];
  }
  const messages = [
    `Drilling from ${fromName} to ${toName} — that's 12,742 km straight through the Earth!`,
    `From ${fromName} you'd pop up in ${toName}. Knock knock, anyone home?`,
    `${fromName} ↔ ${toName}: exact antipodes. Say hi to the locals!`,
    `Start digging in ${fromName} and you'll eventually (in about 42 minutes) reach ${toName}.`,
  ];
  return messages[Math.floor(Math.random() * messages.length)];
}

function setLockBadge(visible) {
  $('lock-indicator').classList.toggle('hidden', !visible);
  $('hint-text').textContent = visible
    ? 'Click same country or press Esc to unlock'
    : 'Hover to explore · Click to lock · Esc to unlock';
}

// ─── Core state update ───────────────────────────────────────────────────────

/**
 * Recompute antipode state from a given [lon, lat] point + feature.
 */
function activate(feature, point) {
  state.activePoint   = point;
  state.antipodePoint = point ? antipodeOf(point) : null;
  state.antipodeFeature = state.antipodePoint
    ? findCountryAt(state.antipodePoint)
    : null;

  if (state.isLocked) {
    state.locked = feature;
  } else {
    state.hovered = feature;
  }
}

let lastAntipodeFeature = undefined; // track to avoid pointsData churn
let lastLockedState = false;

function refreshGlobe() {
  globe
    .polygonCapColor(capColor)
    .polygonAltitude(polyAlt);

  // Rebuild point markers + labels when antipode target or lock state changes
  if (state.antipodeFeature !== lastAntipodeFeature || state.isLocked !== lastLockedState) {
    lastAntipodeFeature = state.antipodeFeature;
    lastLockedState = state.isLocked;
    globe.pointsData(markerPoints());
    globe.htmlElementsData(markerLabels());
  }
}

// ─── Color + altitude helpers ────────────────────────────────────────────────

function activeFeature() {
  return state.isLocked ? state.locked : state.hovered;
}

function capColor(feat) {
  const active = activeFeature();
  if (feat === active)               return 'rgba(122, 158, 126, 0.8)';  // moss green
  if (state.isLocked && feat === state.antipodeFeature) return 'rgba(194, 113, 94, 0.8)';  // terracotta only when locked
  return 'rgba(240, 230, 211, 0.1)'; // subtle warm tint so land is visible
}

function polyAlt(feat) {
  const active = activeFeature();
  if (feat === active) return 0.018;
  if (state.isLocked && feat === state.antipodeFeature) return 0.018;
  return 0.006; // lift above globe surface to prevent z-fighting
}

function markerPoints() {
  const pts = [];
  if (state.isLocked && state.antipodePoint) {
    pts.push({
      lat: state.antipodePoint[1],
      lng: state.antipodePoint[0],
      label: state.antipodeFeature?.properties?.name ?? 'Open Ocean',
    });
  }
  return pts;
}

function markerLabels() {
  if (!state.isLocked || !state.antipodePoint) return [];
  return [{
    lat: state.antipodePoint[1],
    lng: state.antipodePoint[0],
  }];
}

function createLabelElement() {
  const el = document.createElement('div');
  el.className = 'antipode-label';
  el.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg> Here!';
  return el;
}

// ─── Globe setup ─────────────────────────────────────────────────────────────

async function init() {
  // Load world topology from CDN (world-atlas 110m, ~70 KB gzipped)
  const topology = await fetch(
    'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json'
  ).then(r => r.json());

  const geojson = feature(topology, topology.objects.countries);

  // Attach human-readable names
  geojson.features.forEach(f => {
    f.properties.name = getCountryName(Number(f.id));
  });

  state.features = geojson.features;

  // ── Build globe ──────────────────────────────────────────────
  const container = $('globe');

  // Flat matte globe — warm mid-brown so countries pop
  const globeMat = new THREE.MeshBasicMaterial({ color: '#3a2e24' });

  globe = Globe({
    animateIn: true,
    rendererConfig: {
      antialias: true,
      alpha: true,
      logarithmicDepthBuffer: true,   // kills z-fighting
      powerPreference: 'high-performance',
    },
  })(container)
    .width(window.innerWidth)
    .height(window.innerHeight)
    .globeMaterial(globeMat)
    .backgroundColor('rgba(0,0,0,0)')
    .atmosphereColor('rgba(210, 140, 100, 0.22)')
    .atmosphereAltitude(0.2)
    .pointOfView({ altitude: window.innerWidth <= 520 ? 4 : 2.5 })

    // Countries
    .polygonsData(state.features)
    .polygonCapColor(capColor)
    .polygonSideColor(() => 'rgba(0, 0, 0, 0.0)')
    .polygonStrokeColor(() => 'rgba(240, 230, 211, 0.18)')
    .polygonAltitude(polyAlt)

    // Antipode marker (exact point)
    .pointsData([])
    .pointColor(() => '#c2715e')
    .pointAltitude(0.05)
    .pointRadius(0.45)
    .pointsMerge(false)
    .pointLabel(d => `<div class="globe-tooltip">Antipode: ${d.label}</div>`)

    // Antipode floating label (auto-hides behind globe)
    .htmlElementsData([])
    .htmlElement(() => createLabelElement())
    .htmlLat(d => d.lat)
    .htmlLng(d => d.lng)
    .htmlAltitude(0.1)
    .htmlTransitionDuration(0)

    // ── Click interaction (lock / unlock) ────────────────────
    .onPolygonClick((feat, _ev, { lat, lng }) => {
      if (state.isLocked && feat === state.locked) {
        unlock();
        return;
      }
      state.isLocked = true;
      activate(feat, [lng, lat]);
      refreshGlobe();
      updateInfoPanel();
      setLockBadge(true);
      stopRotation();
    })

    .onGlobeClick(({ lat, lng }) => {
      if (state.isLocked) {
        unlock();
        return;
      }
      const clickedFeature = findCountryAt([lng, lat]);
      if (clickedFeature) return;

      state.isLocked = true;
      activate(null, [lng, lat]);
      refreshGlobe();
      updateInfoPanel();
      setLockBadge(true);
      stopRotation();
    });

  // ── Renderer quality ────────────────────────────────────────
  globe.renderer().setPixelRatio(Math.min(window.devicePixelRatio, 2));

  // ── Real-time cursor tracking ────────────────────────────────
  // Updates coordinates + antipode as the cursor moves across the globe.
  let rafId = null;
  let pendingPos = null;

  function handlePointerMove(clientX, clientY) {
    if (state.isLocked) return;
    pendingPos = { clientX, clientY };
    if (rafId) return;
    rafId = requestAnimationFrame(() => {
      rafId = null;
      if (!pendingPos) return;
      const { clientX: cx, clientY: cy } = pendingPos;
      pendingPos = null;

      const coords = globe.toGlobeCoords(cx, cy);
      if (!coords) {
        if (state.hovered || state.activePoint) {
          const hadHover = !!state.hovered;
          state.hovered = null;
          state.activePoint = null;
          state.antipodePoint = null;
          state.antipodeFeature = null;
          if (hadHover) refreshGlobe();
          updateInfoPanel();
        }
        return;
      }
      const { lat, lng } = coords;
      const feat = findCountryAt([lng, lat]);
      const prevHovered = state.hovered;
      activate(feat, [lng, lat]);
      // Only repaint polygon colours when the highlighted country changes
      if (feat !== prevHovered) refreshGlobe();
      // Always update the coordinate readout
      updateInfoPanel();
    });
  }

  container.addEventListener('mousemove', e => handlePointerMove(e.clientX, e.clientY));
  container.addEventListener('touchmove', e => {
    const t = e.touches[0];
    if (t) handlePointerMove(t.clientX, t.clientY);
  }, { passive: true });

  container.addEventListener('mouseleave', () => {
    if (state.isLocked) return;
    const hadHover = !!state.hovered;
    state.hovered = null;
    state.activePoint = null;
    state.antipodePoint = null;
    state.antipodeFeature = null;
    if (hadHover) refreshGlobe();
    updateInfoPanel();
  });

  // ── Ctrl / Shift scroll zoom speed ─────────────────────────
  globeControls = globe.controls();
  const controls = globeControls;
  const BASE_ZOOM = 1.0;
  container.addEventListener('wheel', e => {
    if (e.ctrlKey) {
      e.preventDefault();        // prevent browser page-zoom
      controls.zoomSpeed = 4.0;  // fast
    } else if (e.shiftKey) {
      controls.zoomSpeed = 0.25; // precise
    } else {
      controls.zoomSpeed = BASE_ZOOM;
    }
  }, { capture: true, passive: false });

  // ── Auto-rotate with idle resume ────────────────────────────
  controls.autoRotate = true;
  controls.autoRotateSpeed = 0.4;
  controls.enableDamping = true;
  controls.dampingFactor = 0.12;
  controls.rotateSpeed = 0.8;

  idleTimer = null;
  const IDLE_MS = 5000;

  function onUserInput() {
    // Stop spinning immediately on any interaction
    controls.autoRotate = false;
    // Reset the idle countdown
    clearTimeout(idleTimer);
    // Don't resume spinning while a location is locked
    if (state.isLocked) return;
    idleTimer = setTimeout(() => {
      controls.autoRotate = true;
    }, IDLE_MS);
  }

  container.addEventListener('mousedown', onUserInput);
  container.addEventListener('touchstart', onUserInput, { passive: true });
  container.addEventListener('wheel', onUserInput, { passive: true });

  // ── Window resize ───────────────────────────────────────────
  window.addEventListener('resize', () => {
    globe.width(window.innerWidth).height(window.innerHeight);
  });

  // ── Escape key to unlock ────────────────────────────────────
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && state.isLocked) unlock();
  });

  // ── Locate me button ────────────────────────────────────────
  $('btn-locate').addEventListener('click', handleLocateMe);

  // ── Init Lucide icons ──────────────────────────────────────
  createIcons({ icons: { MapPin, Lock, ArrowDown } });

  // ── Draggable info panel on mobile ────────────────────────
  if (window.innerWidth <= 520) {
    initDraggablePanel($('info-panel'));
  }

  // ── Fade out loading screen ─────────────────────────────────
  const loading = $('loading');
  loading.classList.add('fade-out');
  setTimeout(() => loading.remove(), 700);
}

// ─── Draggable panel (mobile) ─────────────────────────────────────────────────

function initDraggablePanel(panel) {
  let startX, startY, startLeft, startTop, dragging = false;
  const EDGE_MARGIN = 10;

  panel.addEventListener('touchstart', e => {
    if (e.touches.length !== 1) return;
    dragging = true;
    const t = e.touches[0];
    const rect = panel.getBoundingClientRect();
    startX = t.clientX;
    startY = t.clientY;
    startLeft = rect.left;
    startTop = rect.top;

    // Switch to fixed positioning for drag
    panel.style.position = 'fixed';
    panel.style.left = startLeft + 'px';
    panel.style.top = startTop + 'px';
    panel.style.right = 'auto';
    panel.style.bottom = 'auto';
    panel.style.transform = 'none';
    panel.style.transition = 'none';
    panel.style.zIndex = '30';
  }, { passive: true });

  panel.addEventListener('touchmove', e => {
    if (!dragging || e.touches.length !== 1) return;
    const t = e.touches[0];
    const dx = t.clientX - startX;
    const dy = t.clientY - startY;

    let newLeft = startLeft + dx;
    let newTop = startTop + dy;

    // Clamp inside viewport
    const pw = panel.offsetWidth;
    const ph = panel.offsetHeight;
    newLeft = Math.max(EDGE_MARGIN, Math.min(window.innerWidth - pw - EDGE_MARGIN, newLeft));
    newTop = Math.max(EDGE_MARGIN, Math.min(window.innerHeight - ph - EDGE_MARGIN, newTop));

    panel.style.left = newLeft + 'px';
    panel.style.top = newTop + 'px';
  }, { passive: true });

  panel.addEventListener('touchend', () => {
    if (!dragging) return;
    dragging = false;

    // Snap to nearest horizontal edge
    const rect = panel.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const snapLeft = centerX < window.innerWidth / 2;

    panel.style.transition = 'left 0.25s ease, top 0.25s ease';
    panel.style.left = snapLeft
      ? EDGE_MARGIN + 'px'
      : (window.innerWidth - rect.width - EDGE_MARGIN) + 'px';

    // Clamp top
    let finalTop = rect.top;
    finalTop = Math.max(EDGE_MARGIN, Math.min(window.innerHeight - rect.height - EDGE_MARGIN, finalTop));
    panel.style.top = finalTop + 'px';
  });
}

// ─── Rotation helpers ────────────────────────────────────────────────────────

function stopRotation() {
  clearTimeout(idleTimer);
  if (globeControls) globeControls.autoRotate = false;
}

function resumeIdleRotation() {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    if (globeControls) globeControls.autoRotate = true;
  }, 5000);
}

// ─── Unlock ──────────────────────────────────────────────────────────────────

function unlock() {
  state.isLocked = false;
  state.locked   = null;
  // Restore to hovered state (which may be nothing)
  activate(state.hovered, state.hovered ? geoCentroid(state.hovered) : null);
  refreshGlobe();
  updateInfoPanel();
  setLockBadge(false);
  resumeIdleRotation();
}

// ─── Geolocation ─────────────────────────────────────────────────────────────

function handleLocateMe() {
  if (!navigator.geolocation) {
    alert('Your browser doesn\'t support geolocation. Try clicking directly on a country!');
    return;
  }

  const btn = $('btn-locate');
  const btnText = $('btn-locate-text');
  btnText.textContent = 'Locating…';
  btn.disabled = true;

  navigator.geolocation.getCurrentPosition(
    ({ coords: { latitude: lat, longitude: lng } }) => {
      const feat = findCountryAt([lng, lat]);

      state.isLocked = true;
      activate(feat, [lng, lat]);
      refreshGlobe();
      updateInfoPanel();
      setLockBadge(true);
      stopRotation();

      // Fly the camera to the user's location
      globe.pointOfView({ lat, lng, altitude: 2.2 }, 1400);

      btnText.textContent = 'Find My Antipode';
      btn.disabled = false;
    },
    _err => {
      alert('Could not get your location — try clicking on your country instead!');
      btnText.textContent = 'Find My Antipode';
      btn.disabled = false;
    },
    { timeout: 8000 }
  );
}

// ─── Boot ─────────────────────────────────────────────────────────────────────

init().catch(err => {
  console.error('Failed to initialise globe:', err);
  $('loading').innerHTML = `
    <div id="loading-inner" style="color:#ff5c4a">
      <p>Failed to load globe data.<br>Check your internet connection and refresh.</p>
    </div>`;
});
