import './styles.css';
import { loadTour, findMissingPanoramas, withoutRooms, TourError } from './tour-loader.js';
import { createViewer } from './viewer/viewer.js';
import { renderHeader, showError, openLightbox } from './viewer/ui.js';

const DEFAULT_HOUSE = 'krakovska';

async function main() {
  const container = document.getElementById('app');
  const headerEl = document.getElementById('header');
  const params = new URLSearchParams(location.search);
  const houseId = params.get('house') || DEFAULT_HOUSE;
  const baseUrl = `${import.meta.env.BASE_URL}houses/${houseId}/`;

  try {
    let tour = await loadTour(houseId, baseUrl);

    if (params.has('edit')) {
      const { startEditor } = await import('./editor/editor.js');
      startEditor({ houseId, baseUrl, tour, container, headerEl });
      return;
    }

    const missing = await findMissingPanoramas(tour, baseUrl);
    if (missing.length > 0) {
      missing.forEach((id) => console.warn(`Panorama místnosti ${id} chybí, místnost skryta.`));
      tour = withoutRooms(tour, missing);
    }

    renderHeader(headerEl, tour.title);
    const requested = params.get('room');
    const startRoom = tour.rooms.some((r) => r.id === requested) ? requested : tour.start;
    const extraButtons = tour.exterior.length > 0
      ? [{ id: 'exterior', title: 'Exteriér', content: 'Exteriér', className: 'exterior-button', onClick: () => openLightbox(tour.exterior.map((p) => baseUrl + p)) }]
      : [];

    createViewer({
      container,
      tour,
      baseUrl,
      startRoom,
      extraButtons,
      onRoomChange: (id) => {
        const url = new URL(location.href);
        url.searchParams.set('room', id);
        history.replaceState(null, '', url);
      },
    });
  } catch (e) {
    console.error(e);
    showError(container, e instanceof TourError ? e.message : 'Něco se pokazilo. Zkuste stránku načíst znovu.');
  }
}

main();
