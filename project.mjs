export const PROJECT_VERSION = 1;
export const MATERIAL_PRESETS = ['white', 'brick', 'concrete', 'wood', 'glass', 'metal', 'plaster', 'tile', 'marble', 'custom'];
const clamp = (value, min, max) => Math.min(max, Math.max(min, Number(value) || 0));
const id = (prefix) => `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
const point = (value, width, depth) => Array.isArray(value) && value.length >= 2
  ? [clamp(value[0], 0, width), clamp(value[1], 0, depth)] : null;
const finite = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const cross = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
function convexHull(points) {
  const sorted = [...new Map(points.map(p => [`${p[0]},${p[1]}`, p])).values()].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (sorted.length < 3) return sorted;
  const lower = [], upper = [];
  for (const p of sorted) {while (lower.length > 1 && cross(lower.at(-2), lower.at(-1), p) <= 0) lower.pop();lower.push(p);}
  for (const p of [...sorted].reverse()) {while (upper.length > 1 && cross(upper.at(-2), upper.at(-1), p) <= 0) upper.pop();upper.push(p);}
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}
function polygonArea(polygon) {return Math.abs(polygon.reduce((sum, p, i) => {const q = polygon[(i + 1) % polygon.length];return sum + p[0] * q[1] - q[0] * p[1];}, 0)) / 2;}
const materialName = value => MATERIAL_PRESETS.includes(value) ? value : 'white';
const materialProps = value => ({
  color: typeof value?.color === 'string' ? value.color.slice(0, 20) : '#f5f5f2',
  roughness: clamp(value?.roughness ?? .72, 0, 1), metalness: clamp(value?.metalness ?? 0, 0, 1),
  opacity: clamp(value?.opacity ?? 1, .05, 1), transparent: Boolean(value?.transparent)
});
export function offsetPolygon(polygon, edgeOffsets = .1) {
  if (!Array.isArray(polygon) || polygon.length < 3) return (polygon || []).map(point => [...point]);
  const signedArea = polygon.reduce((sum, point, index) => {const next = polygon[(index + 1) % polygon.length];return sum + point[0] * next[1] - next[0] * point[1];}, 0) / 2;
  const orientation = signedArea >= 0 ? 1 : -1;
  const offsets = Array.isArray(edgeOffsets) ? edgeOffsets : polygon.map(() => edgeOffsets);
  const edges = polygon.map((start, index) => {
    const end = polygon[(index + 1) % polygon.length], dx = end[0] - start[0], dz = end[1] - start[1], length = Math.hypot(dx, dz) || 1;
    return {start, direction:[dx, dz], normal:[orientation * dz / length, orientation * -dx / length], offset:Math.max(0, finite(offsets[index], .1))};
  });
  return polygon.map((vertex, index) => {
    const previous = edges[(index + edges.length - 1) % edges.length], current = edges[index];
    const p = [previous.start[0] + previous.normal[0] * previous.offset, previous.start[1] + previous.normal[1] * previous.offset];
    const q = [current.start[0] + current.normal[0] * current.offset, current.start[1] + current.normal[1] * current.offset];
    const denominator = previous.direction[0] * current.direction[1] - previous.direction[1] * current.direction[0];
    if (Math.abs(denominator) < 1e-8) return [vertex[0] + current.normal[0] * current.offset, vertex[1] + current.normal[1] * current.offset];
    const t = ((q[0] - p[0]) * current.direction[1] - (q[1] - p[1]) * current.direction[0]) / denominator;
    const intersection = [p[0] + previous.direction[0] * t, p[1] + previous.direction[1] * t];
    const limit = Math.max(previous.offset, current.offset, .01) * 8;
    return Math.hypot(intersection[0] - vertex[0], intersection[1] - vertex[1]) <= limit ? intersection : [vertex[0] + (previous.normal[0] + current.normal[0]) * current.offset / 2, vertex[1] + (previous.normal[1] + current.normal[1]) * current.offset / 2];
  });
}
function boundaryCovered(a, b, walls, tolerance = 18) {
  const dx = b[0] - a[0], dz = b[1] - a[1], length2 = dx * dx + dz * dz, length = Math.sqrt(length2);
  if (length < tolerance) return true;
  const intervals = [];
  for (const wall of walls) {
    const distance = point => Math.abs(dx * (point[1] - a[1]) - dz * (point[0] - a[0])) / length;
    if (distance(wall.a) > tolerance || distance(wall.b) > tolerance) continue;
    const start = ((wall.a[0] - a[0]) * dx + (wall.a[1] - a[1]) * dz) / length2;
    const end = ((wall.b[0] - a[0]) * dx + (wall.b[1] - a[1]) * dz) / length2;
    const low = Math.max(0, Math.min(start, end)), high = Math.min(1, Math.max(start, end));
    if (high > low) intervals.push([low, high]);
  }
  intervals.sort((left, right) => left[0] - right[0]);
  let covered = 0;
  for (const interval of intervals) {if (interval[0] > covered + .025) break;covered = Math.max(covered, interval[1]);}
  return covered >= .975;
}
export function ensureRoomBoundaryWalls(walls, rooms, tolerance = 18) {
  const completed = walls.map(wall => ({...wall, a:[...wall.a], b:[...wall.b], openings:[...(wall.openings || [])]}));
  for (const room of rooms || []) for (let index = 0; index < (room.polygon || []).length; index++) {
    const a = room.polygon[index], b = room.polygon[(index + 1) % room.polygon.length];
    if (!boundaryCovered(a, b, completed, tolerance)) completed.push({a:[...a],b:[...b],thickness:.12,role:'interior',construction:'inferred',openings:[]});
  }
  return completed;
}
function pointInPolygon(point, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i], b = polygon[j];
    if (Math.abs(cross(a, b, point)) < 1e-6 && point[0] >= Math.min(a[0], b[0]) - 1e-6 && point[0] <= Math.max(a[0], b[0]) + 1e-6 && point[1] >= Math.min(a[1], b[1]) - 1e-6 && point[1] <= Math.max(a[1], b[1]) + 1e-6) return true;
    if ((a[1] > point[1]) !== (b[1] > point[1]) && point[0] < (b[0] - a[0]) * (point[1] - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}
function nearPolygon(point, polygon, tolerance = .12) {
  if (pointInPolygon(point, polygon)) return true;
  return polygon.some((a, i) => {const b = polygon[(i + 1) % polygon.length], dx = b[0] - a[0], dy = b[1] - a[1], length2 = dx * dx + dy * dy || 1;const t = Math.max(0, Math.min(1, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / length2));return Math.hypot(point[0] - a[0] - t * dx, point[1] - a[1] - t * dy) <= tolerance;});
}
function onOutlineEdge(a, b, outline, tolerance = .18) {
  return outline.some((start, index) => {
    const end = outline[(index + 1) % outline.length];
    const dx = end[0] - start[0], dy = end[1] - start[1], length = Math.hypot(dx, dy);
    if (length < .1) return false;
    const onEdge = p => {
      const along = ((p[0] - start[0]) * dx + (p[1] - start[1]) * dy) / (length * length);
      return along >= -.04 && along <= 1.04 && Math.abs(cross(start, end, p)) / length <= tolerance;
    };
    return onEdge(a) && onEdge(b);
  });
}
function validPolygon(polygon) {
  if (polygon.length < 3 || polygonArea(polygon) < .04) return false;
  for (let i = 0; i < polygon.length; i++) for (let j = i + 2; j < polygon.length; j++) {
    if (i === 0 && j === polygon.length - 1) continue;
    const a = polygon[i], b = polygon[(i + 1) % polygon.length], c = polygon[j], d = polygon[(j + 1) % polygon.length];
    if (cross(a, b, c) * cross(a, b, d) < 0 && cross(c, d, a) * cross(c, d, b) < 0) return false;
  }
  return true;
}
function imageBounds(raw) {
  const supplied = raw.modelBounds;
  if (Array.isArray(supplied) && supplied.length === 4 && supplied.every(v => Number.isFinite(Number(v))) && supplied[2] - supplied[0] > 50 && supplied[3] - supplied[1] > 50) return supplied.map(Number);
  const points = [...(raw.floorOutline || []), ...(raw.rooms || []).flatMap(room => room.polygon || []), ...(raw.walls || []).flatMap(wall => [wall.a, wall.b])].filter(p => Array.isArray(p) && p.length >= 2);
  if (!points.length) return [0, 0, 1000, 1000];
  const xs = points.map(p => Number(p[0])), ys = points.map(p => Number(p[1]));
  const box = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
  return box.every(Number.isFinite) && box[2] - box[0] > 50 && box[3] - box[1] > 50 ? box : [0, 0, 1000, 1000];
}

export function createBlankProject(name = '未命名项目', width = 10, depth = 8, floorHeight = 3) {
  width = clamp(width, 3, 80); depth = clamp(depth, 3, 80);
  const polygon = [[0, 0], [width, 0], [width, depth], [0, depth]];
  return normalizeProject({version: PROJECT_VERSION, name, width, depth, floors: [{
    id: 'floor-1', name: '一层', height: floorHeight, elevation: 0,
    floorOutline: polygon, exteriorOutline: polygon, voids: [],
    rooms: [{id: 'room-1', name: '未命名1', polygon, material: 'wood'}],
    walls: polygon.map((p, i) => ({id: `wall-${i + 1}`, a: p, b: polygon[(i + 1) % 4], thickness: .2, role: 'exterior', construction: 'filled', openings: []})),
    furniture: [], surfaces: []
  }]});
}

export function normalizeProject(input) {
  if (!input || typeof input !== 'object') throw new Error('项目文件不是有效的 JSON 对象');
  const width = clamp(input.width ?? 10, 2, 100), depth = clamp(input.depth ?? 8, 2, 100);
  if (!Array.isArray(input.floors) || !input.floors.length || input.floors.length > 20) throw new Error('项目需要包含 1 至 20 个楼层');
  let elevation = 0;
  const floors = input.floors.map((raw, fi) => {
    const height = clamp(raw.height ?? 3, 2, 8);
    const floor = {
      id: String(raw.id || `floor-${fi + 1}`).slice(0, 80),
      name: String(raw.name || `${fi + 1}层`).slice(0, 60),
      elevation: finite(raw.elevation, elevation), height,
      sourceImage: typeof raw.sourceImage === 'string' && raw.sourceImage.startsWith('data:image/') ? raw.sourceImage : null,
      floorOutline: [], exteriorOutline: [], voids: [], rooms: [], walls: [], furniture: [], surfaces: []
    };
    elevation = floor.elevation + height + .2;
    for (const [ri, room] of (Array.isArray(raw.rooms) ? raw.rooms : []).slice(0, 150).entries()) {
      const polygon = (Array.isArray(room.polygon) ? room.polygon : []).map(v => point(v, width, depth)).filter(Boolean);
      if (polygon.length < 3) continue;
      floor.rooms.push({id: String(room.id || id('room')).slice(0, 80), name: String(room.name || `未命名${ri + 1}`).slice(0, 60), polygon,
        material: materialName(room.material || 'wood'), materialProps: materialProps(room.materialProps)});
    }
    floor.floorOutline = (Array.isArray(raw.floorOutline) ? raw.floorOutline : []).map(v => point(v, width, depth)).filter(Boolean);
    const roomPoints = floor.rooms.flatMap(room => room.polygon);
    if (!validPolygon(floor.floorOutline) || roomPoints.some(p => !nearPolygon(p, floor.floorOutline))) floor.floorOutline = convexHull([...floor.floorOutline, ...roomPoints]);
    floor.exteriorOutline = (Array.isArray(raw.exteriorOutline) ? raw.exteriorOutline : []).map(v => point(v, width, depth)).filter(Boolean);
    if (!validPolygon(floor.exteriorOutline)) floor.exteriorOutline = floor.floorOutline.map(p => [...p]);
    floor.voids = (Array.isArray(raw.voids) ? raw.voids : []).slice(0, 30).map(poly => (Array.isArray(poly) ? poly : []).map(v => point(v, width, depth)).filter(Boolean)).filter(poly => validPolygon(poly) && poly.every(p => pointInPolygon(p, floor.floorOutline)));
    for (const wall of (Array.isArray(raw.walls) ? raw.walls : []).slice(0, 1000)) {
      const a = point(wall.a, width, depth), b = point(wall.b, width, depth);
      if (!a || !b || Math.hypot(a[0] - b[0], a[1] - b[1]) < .12) continue;
      const openings = (Array.isArray(wall.openings) ? wall.openings : []).slice(0, 20).map(opening => ({
        id: String(opening.id || id('opening')).slice(0, 80), type: ['door', 'window', 'full'].includes(opening.type) ? opening.type : 'door',
        start: clamp(opening.start ?? .35, 0, .98), end: clamp(opening.end ?? .65, .02, 1),
        bottom: clamp(opening.bottom ?? (opening.type === 'window' ? .9 : 0), 0, height - .3),
        top: clamp(opening.top ?? (opening.type === 'window' ? 2.1 : 2.15), .4, height),
        hinge: opening.hinge === 'right' ? 'right' : 'left', swing: ['inward', 'outward', 'slide'].includes(opening.swing) ? opening.swing : 'inward',
        material: materialName(opening.material || (opening.type === 'window' ? 'glass' : 'white')), materialProps: materialProps(opening.materialProps)
      })).filter(o => o.end - o.start >= .04 && o.top - o.bottom >= .35).sort((a, b) => a.start - b.start);
      const role = wall.role === 'exterior' || (!wall.role && onOutlineEdge(a, b, floor.exteriorOutline)) ? 'exterior' : 'interior';
      const construction = role === 'exterior' || wall.construction === 'filled' ? 'filled' : 'inferred';
      floor.walls.push({id: String(wall.id || id('wall')).slice(0, 80), name: String(wall.name || (role === 'exterior' ? '外墙' : construction === 'filled' ? '图纸实墙' : '可拆内墙')).slice(0, 60),
        a, b, thickness: clamp(wall.thickness ?? .18, .06, .8), height: clamp(wall.height ?? height, .4, 8),
        type: wall.type === 'railing' && role !== 'exterior' ? 'railing' : 'wall', role, construction, openings,
        material: materialName(wall.material), materialProps: materialProps(wall.materialProps)});
    }
    for (const furniture of (Array.isArray(raw.furniture) ? raw.furniture : []).slice(0, 500)) {
      floor.furniture.push({id: String(furniture.id || id('furniture')).slice(0, 80), name: String(furniture.name || '家具').slice(0, 60),
        type: ['bed', 'sofa', 'table', 'chair', 'cabinet', 'other'].includes(furniture.type) ? furniture.type : 'other',
        assetId: furniture.assetId ? String(furniture.assetId).slice(0, 100) : null,
        catalogGroup: furniture.catalogGroup ? String(furniture.catalogGroup).slice(0, 40) : null,
        x: clamp(furniture.x, 0, width), z: clamp(furniture.z, 0, depth),
        w: clamp(furniture.w ?? 1, .1, 10), d: clamp(furniture.d ?? .8, .1, 10), h: clamp(furniture.h ?? .8, .1, 5),
        rotation: finite(furniture.rotation, 0), material: materialName(furniture.material), materialProps: materialProps(furniture.materialProps),
        interactive: Boolean(furniture.interactive), lightOn: furniture.lightOn !== false, brightness: clamp(furniture.brightness ?? .8, 0, 1),
        customBlock:Boolean(furniture.customBlock), editMode:['object','face','edge','loop'].includes(furniture.editMode)?furniture.editMode:'object',
        selectedFace:clamp(furniture.selectedFace ?? 0,0,5), faceMaterials:Array.from({length:6},(_,index)=>materialName(furniture.faceMaterials?.[index] || furniture.material || 'custom'))});
    }
    for (const [si, surface] of (Array.isArray(raw.surfaces) ? raw.surfaces : []).slice(0, 120).entries()) {
      const polygon = (Array.isArray(surface.polygon) ? surface.polygon : []).map(v => point(v, width, depth)).filter(Boolean);
      if (!validPolygon(polygon)) continue;
      floor.surfaces.push({id:String(surface.id || id('surface')).slice(0,80), name:String(surface.name || `构件${si + 1}`).slice(0,60),
        type:['slab','ceiling','roof','leanTo'].includes(surface.type) ? surface.type : 'slab', polygon,
        elevation:clamp(surface.elevation ?? (surface.type === 'ceiling' || surface.type === 'roof' || surface.type === 'leanTo' ? height : 0), -.5, height + 5),
        thickness:clamp(surface.thickness ?? .2, .04, 1), pitch:clamp(surface.pitch ?? 0, -60, 60), drainage:Boolean(surface.drainage),
        material:materialName(surface.material || (surface.type === 'roof' ? 'metal' : 'concrete')), materialProps:materialProps(surface.materialProps)});
    }
    if (!floor.rooms.length) throw new Error(`${floor.name}没有可识别的空间，请检查图纸或调整识别结果`);
    return floor;
  });
  return {version: PROJECT_VERSION, id: String(input.id || id('project')).slice(0, 80), name: String(input.name || '未命名项目').slice(0, 80), width, depth, floors};
}

export function assembleRecognitionStages(exterior, interior, spaces) {
  const outline = exterior?.exteriorOutline;
  if (!Array.isArray(outline) || !validPolygon(outline)) throw new Error('AI 未能识别有效的闭合外墙轮廓，请换一张清晰的平面图重试');
  const exteriorWalls = outline.map((a, index) => ({
    a, b: outline[(index + 1) % outline.length], thickness: .24,
    role: 'exterior', construction: 'filled',
    openings: (exterior.exteriorOpenings || []).filter(o => Number(o.edgeIndex) === index).map(({edgeIndex, ...opening}) => opening)
  }));
  const interiorWalls = (interior?.walls || []).map(wall => ({...wall, role: 'interior'}));
  const rooms = spaces?.rooms || [], walls = ensureRoomBoundaryWalls([...exteriorWalls, ...interiorWalls], rooms);
  return {...exterior, walls, rooms, furniture: spaces?.furniture || []};
}

export function projectFromRecognition(rawFloors, plans, name, floorHeight = 3) {
  if (!Array.isArray(rawFloors) || rawFloors.length !== plans.length) throw new Error('AI 返回的楼层数量与图纸数量不一致');
  const bounds = rawFloors.map(imageBounds);
  const width = clamp(plans[0].widthMeters || rawFloors[0].widthMeters || 10, 2, 100);
  const depth = clamp(plans[0].depthMeters || rawFloors[0].depthMeters || width * (bounds[0][3] - bounds[0][1]) / (bounds[0][2] - bounds[0][0]), 2, 100);
  let level = 0;
  const floors = rawFloors.map((raw, index) => {
    const h = clamp(plans[index].floorHeight || floorHeight, 2, 8);
    const [left, top, right, bottom] = bounds[index];
    const meterPoint = p => [clamp((Number(p?.[0]) - left) / (right - left) * width, 0, width), clamp((Number(p?.[1]) - top) / (bottom - top) * depth, 0, depth)];
    const rooms = (raw.rooms || []).map((room, ri) => ({id: `room-${index + 1}-${ri + 1}`, name: `未命名${ri + 1}`, polygon: (room.polygon || []).map(meterPoint)}));
    const floorOutline = (raw.floorOutline || []).map(meterPoint);
    const exteriorOutline = (raw.exteriorOutline || []).map(meterPoint);
    const voids = (raw.voids || []).map(poly => poly.map(meterPoint));
    const walls = (raw.walls || []).map((wall, wi) => ({id: `wall-${index + 1}-${wi + 1}`, a: meterPoint(wall.a), b: meterPoint(wall.b), thickness: wall.thickness || .18,
      role: wall.role, construction: wall.construction,
      openings: (wall.openings || []).map((opening, oi) => ({id: `opening-${index + 1}-${wi + 1}-${oi + 1}`, type: opening.type,
        start: opening.start, end: opening.end, bottom: opening.bottom, top: opening.top}))}));
    if (!walls.length) {
      const seen = new Set();
      for (const room of rooms) room.polygon.forEach((p, pi) => {
        const q = room.polygon[(pi + 1) % room.polygon.length], key = [p, q].map(v => v.map(n => n.toFixed(2)).join(',')).sort().join('|');
        if (!seen.has(key)) {seen.add(key); walls.push({id: id('wall'), a: p, b: q, thickness: .18, construction: 'inferred', openings: []});}
      });
    }
    const furniture = (raw.furniture || []).map((item, fi) => ({id: `furniture-${index + 1}-${fi + 1}`, name: item.name || item.type || '家具',
      type: item.type || 'other', x: meterPoint(item.center)[0], z: meterPoint(item.center)[1], w: clamp(item.w, .1, 1000) / 1000 * width,
      d: clamp(item.d, .1, 1000) / 1000 * depth, h: item.h || .8, rotation: item.rotation || 0}));
    const floor = {id: `floor-${index + 1}`, name: `${index + 1}层`, elevation: level, height: h, sourceImage: plans[index].dataUrl, floorOutline, exteriorOutline, voids, rooms, walls, furniture};
    level += h + .2;
    return floor;
  });
  return normalizeProject({name, width, depth, floors});
}
