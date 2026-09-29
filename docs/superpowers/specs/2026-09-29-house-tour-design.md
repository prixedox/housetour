# House Tour — Design Spec

Date: 2026-09-29
Status: Approved (design), pending spec review

## Goal

A reusable web-based virtual tour for selling houses built by a friend's construction business. Buyers look around inside 360° panoramas, walk between rooms via hotspots, and see their position on a floor-plan minimap. The first house (Krakovská, novostavba RD) serves as the demo. New houses are added without code changes: prepare photos with a script, place hotspots in a built-in editor, export `tour.json`.

## Scope

In scope:
- Panorama viewer with room-to-room transitions, floor-plan minimap, room list, exterior photo gallery.
- Built-in editor mode (`?edit`) producing `tour.json`.
- Photo preparation script.
- Demo house Krakovská with a first-pass `tour.json`.

Out of scope (for now):
- Hosting/deployment (runs locally; static output so hosting later is trivial).
- Multiple languages (Czech UI only).
- Backend, login, upload admin.
- 3D dollhouse view, free-walk 3D.
- Rooms without panoramas (109 spíž, 110 terasa, 112 kryté stání).

## Source data (demo house)

Folder `C:\Users\prixe\Downloads\photos`:
- 8 equirectangular panoramas, 8192×4096.
- 5 DJI drone photos (exterior).
- `KRAKOVSKÁ.pdf` — floor plan 1.NP, 1:75, rooms 101–112.

Panorama → room mapping:

| File | Room | id |
|---|---|---|
| photo360.jpg | 108 Obývací pokoj + kuchyně | obyvak |
| photo360 (1).jpg | 102 Technická místnost | technicka |
| photo360 (2).jpg | 101 Zádveří | zadveri |
| photo360 (3).jpg | 104 Koupelna | koupelna |
| photo360 (4).jpg | 103 Chodba | chodba |
| photo360 (5).jpg | 107 Ložnice | loznice |
| photo360 (7).jpg | 105 Pokoj (with dog) | pokoj105 |
| photo360 (6).jpg | 106 Pokoj | pokoj106 |

## Tech stack

- Vite + vanilla JavaScript (ES modules), no UI framework.
- Photo Sphere Viewer 5 (`@photo-sphere-viewer/core`) with plugins: `virtual-tour`, `markers`, `map` (custom image + pixel coords; not the Leaflet-based `plan` plugin, which needs geo coords), `gyroscope`.
- `sharp` for image processing (Node script).
- `pdftoppm` / `pdf-to-img` (npm) for one-time plan rendering.
- Vitest for unit tests, Playwright for smoke tests.

## Project structure

```
house-tour/
  index.html
  src/
    main.js            # reads URL params, boots viewer or editor
    tour-loader.js     # fetch + validate tour.json -> normalized Tour object
    viewer/
      viewer.js        # PSV setup, VirtualTour nodes, map plugin
      ui.js            # header, room list, exterior gallery, error screen
    editor/
      editor.js        # edit mode wiring on top of viewer
      editor-state.js  # pure state logic: rooms, links, positions, export
      editor-panel.js  # side panel DOM
    styles.css
  scripts/
    prepare-house.mjs  # source folder -> public/houses/<id>/ images
    render-plan.mjs    # PDF page -> plan.png
  public/houses/
    krakovska/
      tour.json
      pano/<room>.jpg          # 4096×2048
      pano/<room>-preview.jpg  # 512×256, blurred
      plan.png
      exterior/01.jpg ...      # max 2560 px wide
  tests/
    tour-loader.test.js
    editor-state.test.js
    e2e/smoke.spec.js
```

## Data model: `tour.json`

```json
{
  "title": "Novostavba RD Krakovská",
  "start": "obyvak",
  "plan": { "image": "plan.png", "width": 2000, "height": 1500 },
  "rooms": [
    {
      "id": "obyvak",
      "name": "Obývací pokoj + kuchyně",
      "pano": "pano/obyvak.jpg",
      "preview": "pano/obyvak-preview.jpg",
      "planPos": [1450, 820],
      "northOffset": 0.0,
      "links": [ { "to": "chodba", "yaw": 1.2, "pitch": -0.1 } ]
    }
  ],
  "exterior": ["exterior/01.jpg"]
}
```

- `yaw`, `pitch`, `northOffset` in radians.
- `planPos` in plan image pixels.
- `planPos` and `links` optional per room (editor fills them).
- Paths relative to the house folder.

## tour-loader

`loadTour(houseId) -> Promise<Tour>`:
- Fetches `/houses/<houseId>/tour.json`.
- Throws `TourError` (Czech message) if fetch fails, JSON invalid, `rooms` empty, or `start` not a room id (falls back to first room if `start` missing).
- Drops links whose `to` is unknown (console warning).
- Resolves relative paths to absolute URLs.
- Pure validation function `validateTour(json)` separated from fetch for unit testing.

## Viewer

- URL: `/?house=krakovska` (default house if param missing: first entry — for now `krakovska`), `&room=<id>` deep link.
- Loads preview first, then full panorama (PSV `panoData`/`sphereCorrection` as needed; preview via VirtualTour node `thumbnail`/progressive loading).
- Controls: drag/swipe, wheel/pinch zoom, fullscreen, gyroscope toggle (on devices supporting it).
- Links rendered as VirtualTour arrows/markers at `yaw`/`pitch`. Click: rotate toward link, transition with fade/zoom into target room. Target room opens facing away from the door it was entered through (compute from the reverse link's yaw if present, +π).
- Minimap: map plugin with `plan.png`, room dots at `planPos`, current room highlighted, heading cone driven by camera yaw + `northOffset`. Clicking a room dot navigates there. Expandable.
- Room list: menu of room names (with preview thumbnails) for navigation.
- Header: house title, "Exteriér" button opening lightbox gallery of `exterior` images.
- Preloading: current room + direct link targets.
- Errors: `TourError` → full-screen Czech error message. Panorama load failure → room hidden from list/map, console warning.
- URL updates `room` param on navigation (history.replaceState).

## Editor (`?edit`)

- Same viewer plus side panel. Autosaves working copy to localStorage key `tour-edit:<houseId>`; on load, offers to restore saved draft if it differs from served `tour.json`.
- Room list in panel; selecting loads panorama.
- "Přidat průchod": next click on panorama captures yaw/pitch, then pick target room from dropdown. Option "i zpětný průchod" creates reverse link B→A with no position; B shows it as "needs placing" until user sets it.
- Existing links: listed per room; delete button; drag marker to reposition.
- "Umístit na plán": next click on minimap (expanded) sets `planPos`.
- "Nastavit sever": stores current camera yaw as `northOffset`.
- Room properties: name, pano file, "start room" checkbox.
- "Export tour.json": downloads file. "Import": loads a JSON file into editor.
- Pre-export validation warnings (non-blocking): rooms with no links, rooms without `planPos`, one-way links, links without position.
- `editor-state.js` is pure (no DOM, no PSV): operations `addLink`, `removeLink`, `moveLink`, `setPlanPos`, `setNorth`, `setRoomProps`, `setStart`, `validate`, `toJSON`.

## Scripts

`node scripts/prepare-house.mjs <sourceDir> <houseId> [--map mapping.json]`:
- Panoramas (2:1 aspect ratio detected): output `pano/<id>.jpg` at 4096×2048 quality ~82, `pano/<id>-preview.jpg` 512×256 blurred.
- Other JPGs: `exterior/NN.jpg`, max 2560 px wide.
- Mapping file maps source filename → room id + name; without it, ids are `room1..N`.
- Generates skeleton `tour.json` if none exists (rooms, no links).

`node scripts/render-plan.mjs <pdf> <houseId> [--crop x,y,w,h]`: renders first page to PNG, optional crop, writes `plan.png`, updates plan width/height in `tour.json`.

## Demo content

- Krakovská prepared with the mapping above.
- First-pass links estimated from panoramas (e.g. chodba hub linking to obyvak, loznice, pokoj105, pokoj106, koupelna, zadveri; zadveri ↔ technicka). User refines in editor.
- `planPos` estimated from the floor plan; plan cropped to the floor plan drawing (no legend).

## Testing

- Unit (Vitest): `validateTour` (valid, empty rooms, bad start, unknown link target, missing optional fields); `editor-state` (add/remove/move link, reverse link creation, plan pos, north, validate warnings, `toJSON` round-trip through `validateTour`).
- E2E smoke (Playwright): tour loads with start room; clicking a link marker changes room (URL param updates); `?edit` export produces JSON that passes `validateTour`.
- Manual: walk the demo house on desktop and at phone width.

## Success criteria

- Opening `/?house=krakovska` locally shows the living room panorama within a few seconds, and all 8 rooms are reachable via hotspots, minimap, and room list.
- Minimap cone direction matches the view once `northOffset` is set.
- A new house can be added with only: prepare script, render-plan script, editor session, exported `tour.json` — no code changes.
