import { describe, it, expect } from 'vitest';
import { normalizeYaw, entryYaw, tourToNodes } from '../src/viewer/nodes.js';
import { validateTour } from '../src/tour-loader.js';

const TAU = 2 * Math.PI;

describe('normalizeYaw', () => {
  it.each([
    [0, 0],
    [Math.PI, Math.PI],
    [-Math.PI / 2, 1.5 * Math.PI],
    [TAU, 0],
    [5 * Math.PI, Math.PI],
    [-7 * Math.PI, Math.PI],
  ])('%f -> %f', (input, expected) => {
    expect(normalizeYaw(input)).toBeCloseTo(expected, 10);
  });
});

describe('entryYaw', () => {
  it('keeps link yaw when both rooms share orientation', () => {
    expect(entryYaw(1.2, 0, 0)).toBeCloseTo(1.2);
  });

  it('preserves plan-frame heading across differently rotated panoramas', () => {
    // heading in plan frame = yaw + northOffset
    const yaw = entryYaw(1.0, 0.5, 2.0);
    expect(normalizeYaw(yaw + 2.0)).toBeCloseTo(normalizeYaw(1.0 + 0.5));
  });

  it('wraps negative results', () => {
    expect(entryYaw(0.1, 0, 1.0)).toBeCloseTo(TAU - 0.9);
  });
});

describe('tourToNodes', () => {
  const { tour } = validateTour({
    plan: { image: 'plan.png', width: 2000, height: 1000 },
    rooms: [
      {
        id: 'a', name: 'A', pano: 'pano/a.jpg', preview: 'pano/a-preview.jpg', planPos: [0.25, 0.5], northOffset: 0.7,
        links: [{ to: 'b', yaw: 1, pitch: -0.2 }, { to: 'b' }],
      },
      { id: 'b', name: 'B', pano: 'pano/b.jpg' },
    ],
  });

  it('maps rooms to virtual tour nodes with absolute urls', () => {
    const [a, b] = tourToNodes(tour, '/houses/x/');
    expect(a).toEqual({
      id: 'a',
      name: 'A',
      caption: 'A',
      panorama: '/houses/x/pano/a.jpg',
      thumbnail: '/houses/x/pano/a-preview.jpg',
      links: [{ nodeId: 'b', position: { yaw: 1, pitch: -0.2 } }],
      map: { x: 500, y: 500 },
      data: { northOffset: 0.7 },
    });
    expect(b.thumbnail).toBeUndefined();
    expect(b.map).toBe(false);
  });

  it('skips unplaced links (yaw null)', () => {
    const [a] = tourToNodes(tour, '/');
    expect(a.links).toHaveLength(1);
  });

  it('disables map positions when the tour has no plan', () => {
    const nodes = tourToNodes({ ...tour, plan: null }, '/');
    expect(nodes.every((n) => n.map === false)).toBe(true);
  });
});

describe('tourToNodes escaping', () => {
  it('escapes html in name and caption', () => {
    const { tour } = validateTour({ rooms: [{ id: 'a', name: '<b>x</b> & y', pano: 'pano/a.jpg' }] });
    const [a] = tourToNodes(tour, '/');
    expect(a.name).toBe('&lt;b&gt;x&lt;/b&gt; &amp; y');
    expect(a.caption).toBe('&lt;b&gt;x&lt;/b&gt; &amp; y');
  });
});
