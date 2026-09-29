const TAU = 2 * Math.PI;

export function normalizeYaw(yaw) {
  return ((yaw % TAU) + TAU) % TAU;
}

// Heading in plan frame is yaw + northOffset; keep it when entering the next room.
export function entryYaw(linkYaw, fromNorth, toNorth) {
  return normalizeYaw(linkYaw + fromNorth - toNorth);
}

export function tourToNodes(tour, baseUrl) {
  const plan = tour.plan;
  return tour.rooms.map((room) => ({
    id: room.id,
    name: room.name,
    panorama: baseUrl + room.pano,
    thumbnail: room.preview ? baseUrl + room.preview : undefined,
    links: room.links
      .filter((l) => l.yaw !== null)
      .map((l) => ({ nodeId: l.to, position: { yaw: l.yaw, pitch: l.pitch } })),
    map: plan && room.planPos ? { x: room.planPos[0] * plan.width, y: room.planPos[1] * plan.height } : false,
    data: { northOffset: room.northOffset },
  }));
}
