import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { houseGeometry, houseRooms } from '../src/model3d/build-house.js';
import { blockingFootprints, moveWithCollision } from '../src/model3d/geometry.js';

const read = (file) => JSON.parse(readFileSync(`public/houses/krakovska/${file}`, 'utf8'));
const model = read('model.json');
const tour = read('tour.json');
const rooms = houseRooms(model, tour);

describe('krakovska model', () => {
  it('puts every 360° photo spot inside its own room', () => {
    for (const room of rooms.filter((r) => r.hasPano)) {
      const [x, z] = room.panoPos.map((v) => v * 1000);
      const rects = model.rooms.find((r) => r.id === room.id).rects;
      expect(rects.some((r) => x > r[0] && x < r[2] && z > r[1] && z < r[3]), room.id).toBe(true);
    }
  });

  it('has a model room for every tour room', () => {
    expect(tour.rooms.map((r) => r.id).filter((id) => !model.rooms.some((m) => m.id === id))).toEqual([]);
  });

  it('stops a walker at the terrace glazing', () => {
    const footprints = blockingFootprints(houseGeometry(model).solids);
    let pos = rooms.find((r) => r.id === 'obyvak').panoPos.map((v) => v * 1000);
    for (let i = 0; i < 200; i++) pos = moveWithCollision(pos, [0, 140], 250, footprints);
    expect(pos[1]).toBeLessThan(9195);
  });

  it('lets a walker through an interior door', () => {
    const footprints = blockingFootprints(houseGeometry(model).solids);
    // Bathroom door: x 3780..4480 in the wall at z 3605..3730.
    let pos = [4130, 3000];
    for (let i = 0; i < 20; i++) pos = moveWithCollision(pos, [0, 100], 250, footprints);
    expect(pos[1]).toBeGreaterThan(4000);
  });
});
