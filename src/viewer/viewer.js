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

function linkElement(link) {
  const el = document.createElement('div');
  el.className = 'tour-link';
  el.dataset.to = link.nodeId;
  el.innerHTML = '<span class="tour-link__ring"></span>';
  return el;
}

export function createViewer({ container, tour, baseUrl, startRoom, onRoomChange, extraButtons = [] }) {
  const hasPlan = Boolean(tour.plan);
  const plugins = [
    MarkersPlugin,
    [GalleryPlugin, { hideOnClick: true, thumbnailSize: { width: 160, height: 90 } }],
    GyroscopePlugin,
  ];
  if (hasPlan) {
    plugins.push([MapPlugin, {
      static: true,
      position: 'bottom left',
      size: '220px',
      shape: 'square',
      minimizeOnHotspotClick: true,
      spotStyle: { size: 14, color: '#c8a36a', hoverColor: '#ffffff', borderSize: 2, borderColor: '#ffffff' },
      coneColor: '#c8a36a',
      coneSize: 50,
      defaultZoom: 8,
      minZoom: 5,
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
    ...(hasPlan ? { map: { imageUrl: baseUrl + tour.plan.image, size: { width: tour.plan.width, height: tour.plan.height } } } : {}),
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
