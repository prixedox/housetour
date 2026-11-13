import { Viewer } from '@photo-sphere-viewer/core';
import { MarkersPlugin } from '@photo-sphere-viewer/markers-plugin';
import { MapPlugin } from '@photo-sphere-viewer/map-plugin';
import { GalleryPlugin } from '@photo-sphere-viewer/gallery-plugin';
import { GyroscopePlugin } from '@photo-sphere-viewer/gyroscope-plugin';
import { VirtualTourPlugin } from '@photo-sphere-viewer/virtual-tour-plugin';
import '@photo-sphere-viewer/core/index.css';
import '@photo-sphere-viewer/markers-plugin/index.css';
import '@photo-sphere-viewer/map-plugin/index.css';
import '@photo-sphere-viewer/gallery-plugin/index.css';
import '@photo-sphere-viewer/virtual-tour-plugin/index.css';
import { tourToNodes, entryYaw } from './nodes.js';

const LANG = {
  zoom: 'Přiblížení',
  zoomOut: 'Oddálit',
  zoomIn: 'Přiblížit',
  moveUp: 'Nahoru',
  moveDown: 'Dolů',
  moveLeft: 'Vlevo',
  moveRight: 'Vpravo',
  fullscreen: 'Celá obrazovka',
  close: 'Zavřít',
  twoFingers: 'Pro posun použijte dva prsty',
  ctrlZoom: 'Pro přiblížení použijte Ctrl + kolečko',
  loadError: 'Panorama se nepodařilo načíst',
  gallery: 'Místnosti',
  gyroscope: 'Gyroskop',
  map: 'Plánek',
  mapMaximize: 'Zvětšit',
  mapMinimize: 'Zmenšit',
  mapNorth: 'Sever',
  mapReset: 'Obnovit',
};

const PHONE = window.matchMedia('(max-width: 600px)');
// Minimap box in px; zoom (percent of the plan image's own size) scales with it so the
// whole house fits either way.
const minimapSize = () => (PHONE.matches ? 140 : 260);
const minimapZoom = () => (10 * minimapSize()) / 260;
// The plan image has wide margins (dimension lines, carport), so overfill the screen a bit.
const OPEN_PLAN_FILL = 1.3;

// Middle of the photo spots on the plan, in plan image pixels.
export function planAnchor(tour) {
  const spots = tour.rooms.filter((r) => r.planPos).map((r) => r.planPos);
  if (spots.length === 0) return null;
  const xs = spots.map((p) => p[0] * tour.plan.width);
  const ys = spots.map((p) => p[1] * tour.plan.height);
  return { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 };
}

function linkElement(link) {
  const el = document.createElement('div');
  el.className = 'tour-link';
  el.dataset.to = link.nodeId;
  el.innerHTML = '<span class="tour-link__ring"></span>';
  return el;
}

export function createViewer({ container, tour, baseUrl, startRoom, onRoomChange, extraButtons = [] }) {
  const hasPlan = Boolean(tour.plan);
  // The minimap stays centred on the middle of the house; only the pin moves between rooms.
  const anchor = hasPlan ? planAnchor(tour) : null;
  const plugins = [
    MarkersPlugin,
    [GalleryPlugin, { hideOnClick: true, thumbnailSize: { width: 160, height: 90 } }],
    GyroscopePlugin,
  ];
  if (hasPlan) {
    plugins.push([MapPlugin, {
      static: true,
      position: 'bottom left',
      size: `${minimapSize()}px`,
      shape: 'square',
      minimizeOnHotspotClick: true,
      spotStyle: { size: 14, color: '#c8a36a', hoverColor: '#ffffff', borderSize: 2, borderColor: '#ffffff' },
      coneColor: '#c8a36a',
      coneSize: 50,
      defaultZoom: minimapZoom(),
      minZoom: 5,
      ...(anchor ? { center: anchor } : {}),
    }]);
  }
  plugins.push([VirtualTourPlugin, {
    positionMode: 'manual',
    renderMode: '2d',
    nodes: tourToNodes(tour, baseUrl),
    startNodeId: startRoom,
    preload: true,
    arrowStyle: { element: linkElement, size: { width: 56, height: 56 } },
    transitionOptions: (toNode, fromNode, fromLink) => ({
      effect: 'fade',
      speed: 1500,
      rotation: true,
      showLoader: true,
      ...(fromLink && fromNode
        ? { rotateTo: { yaw: entryYaw(fromLink.position.yaw, fromNode.data.northOffset, toNode.data.northOffset), pitch: 0 } }
        : {}),
    }),
    ...(hasPlan ? { map: { imageUrl: baseUrl + tour.plan.image, size: { width: tour.plan.width, height: tour.plan.height }, recenter: !anchor } } : {}),
  }]);

  const navbar = ['zoom', 'move', 'gallery', 'gyroscope', ...extraButtons, 'caption', 'fullscreen'];

  const viewer = new Viewer({
    container,
    lang: LANG,
    loadingTxt: 'Načítání…',
    defaultZoomLvl: 30,
    touchmoveTwoFingers: false,
    mousewheelCtrlKey: false,
    navbar,
    plugins,
  });

  const vt = viewer.getPlugin(VirtualTourPlugin);
  const map = hasPlan ? viewer.getPlugin(MapPlugin) : null;

  // The opened (maximised) plan keeps the minimap's zoom by default, which leaves it tiny
  // on a big screen; zoom it to fill the view instead, and back when it is minimised.
  map?.addEventListener('view-changed', ({ view }) => {
    if (view === 'maximized') {
      const { clientWidth: w, clientHeight: h } = viewer.container;
      const fit = Math.min(w / tour.plan.width, h / tour.plan.height);
      map.setZoom(fit * OPEN_PLAN_FILL * 100);
    } else {
      map.setZoom(minimapZoom());
    }
  });

  // The minimap re-centres on the current room after it closes from full size; pan it back
  // to the middle of the house. setCenter(x, false) moves only the pin, not the view.
  const mapEl = viewer.container.querySelector('.psv-map');
  if (map && anchor && mapEl) {
    mapEl.addEventListener('transitionend', () => {
      const room = map.config.center;
      if (!room || mapEl.classList.contains('psv-map--maximized')) return;
      map.setCenter(anchor);
      map.setCenter(room, false);
    });
  }

  if (map && mapEl) {
    // Phone rotated or window resized across the breakpoint.
    PHONE.addEventListener('change', () => {
      map.setOptions({ size: `${minimapSize()}px`, defaultZoom: minimapZoom() });
      if (!mapEl.classList.contains('psv-map--maximized')) map.setZoom(minimapZoom());
    });

    // On a phone the minimap is too small to aim at a room dot or the corner button, so a
    // tap anywhere on the small map opens the full plan (rooms are picked there).
    let tap = null;
    mapEl.addEventListener('touchstart', (e) => {
      const small = PHONE.matches && !mapEl.classList.contains('psv-map--maximized');
      tap = small && e.target.tagName === 'CANVAS' ? { x: e.touches[0].clientX, y: e.touches[0].clientY } : null;
    }, { capture: true, passive: true });
    mapEl.addEventListener('touchend', (e) => {
      if (!tap) return;
      const t = e.changedTouches[0];
      const moved = Math.hypot(t.clientX - tap.x, t.clientY - tap.y);
      tap = null;
      if (moved > 10) return;
      e.stopPropagation();
      e.preventDefault();
      map.maximize();
    }, { capture: true });
  }

  vt.addEventListener('node-changed', ({ node }) => {
    map?.setOptions({ rotation: node.data.northOffset });
    onRoomChange?.(node.id);
  });

  return {
    viewer,
    tour: vt,
    map,
    currentRoom: () => vt.getCurrentNode()?.id,
    reload(nextTour, roomId) {
      // getCurrentNode() is null during a transition, so the caller supplies the room.
      const target = nextTour.rooms.some((r) => r.id === roomId) ? roomId : nextTour.start;
      vt.setNodes(tourToNodes(nextTour, baseUrl), target);
    },
    destroy: () => viewer.destroy(),
  };
}
