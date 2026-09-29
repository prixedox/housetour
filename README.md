# House Tour

Virtuální prohlídka domů z 360° fotek. Static site (Vite + Photo Sphere Viewer).

## Run

```powershell
npm install
npm run dev          # http://localhost:5173/?house=krakovska
npm test             # unit tests
npm run test:e2e     # Playwright smoke tests (first run: npx playwright install chromium)
npm run build        # static output in dist/
```

URL parameters: `house=<id>` (house folder), `room=<id>` (start room), `edit` (editor).

## Adding a new house

1. Put 360° photos (2:1 equirectangular JPG) and other photos (exterior) in one folder.
2. Optional: create `houses-src/<id>.mapping.json` mapping file names to `{ "id", "name" }` (see `krakovska.mapping.json`).
3. `node scripts/prepare-house.mjs <photoFolder> <id> --map houses-src/<id>.mapping.json --title "Název domu"` (`--title` sets the tour title, default is the id; mapping ids must match `a-z0-9-` and be unique; the title can also be changed later in the editor field "Název prohlídky").
4. `node scripts/render-plan.mjs <plan.pdf> <id> --crop x,y,w,h` (crop as page fractions; check `plan.png`, adjust).
5. `npm run dev`, open `/?house=<id>&edit`:
   - per room: pick target → "Přidat průchod" → click the doorway,
   - "Umístit na plán" → click the room on the plan,
   - face the top side of the plan → "Nastavit sever",
   - fix everything in "Kontrola".
6. "Export tour.json" → replace `public/houses/<id>/tour.json`, commit.
