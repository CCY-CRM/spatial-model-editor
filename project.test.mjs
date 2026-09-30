import test from 'node:test';
import assert from 'node:assert/strict';
import {assembleRecognitionStages, createBlankProject, ensureRoomBoundaryWalls, normalizeProject, offsetPolygon, projectFromRecognition} from './project.mjs';
import {buildExteriorPrompt, buildInteriorPrompt, buildSpacesPrompt} from './recognition-prompt.mjs';
import {FURNITURE_CATALOG, defaultFurnitureGroup, furnitureAsset} from './furniture-catalog.js';

test('blank project has a continuous floor, editable enclosing walls, and no invented furniture', () => {
  const project = createBlankProject('样例', 10, 8, 3);
  assert.equal(project.floors[0].rooms[0].name, '未命名1');
  assert.equal(project.floors[0].rooms[0].polygon.length, 4);
  assert.equal(project.floors[0].walls.length, 4);
  assert.ok(project.floors[0].walls.every(wall => wall.role === 'exterior' && wall.construction === 'filled'));
  assert.deepEqual(project.floors[0].furniture, []);
});

test('furniture catalog is complete and replacement metadata survives normalization', () => {
  assert.equal(FURNITURE_CATALOG.length, 144);
  assert.equal(defaultFurnitureGroup('chair'), 'chairs');
  assert.equal(furnitureAsset('office-chair').type, 'chair');
  const project = createBlankProject('家具替换', 10, 8, 3);
  project.floors[0].furniture.push({id:'chair-1',name:'Office Chair',type:'chair',assetId:'office-chair',catalogGroup:'chairs',x:5,z:4,w:.6,d:.6,h:1,rotation:30});
  const item = normalizeProject(project).floors[0].furniture[0];
  assert.equal(item.assetId, 'office-chair');
  assert.equal(item.catalogGroup, 'chairs');
  assert.deepEqual([item.x,item.z,item.w,item.d,item.h,item.rotation],[5,4,.6,.6,1,30]);
});

test('floor outline offsets to the exterior face for either polygon direction', () => {
  const clockwise = [[0,0],[0,8],[10,8],[10,0]];
  const counterClockwise = [...clockwise].reverse();
  const expected = [[-.1,-.1],[-.1,8.1],[10.1,8.1],[10.1,-.1]];
  const rounded = polygon => polygon.map(point => point.map(value => Number(value.toFixed(3))));
  assert.deepEqual(rounded(offsetPolygon(clockwise,.1)),expected);
  assert.deepEqual(rounded(offsetPolygon(counterClockwise,.1)),[...expected].reverse());
});

test('missing room boundaries become removable interior walls without duplicating shared edges', () => {
  const exterior = [
    {a:[0,0],b:[1000,0],role:'exterior',openings:[]},
    {a:[1000,0],b:[1000,1000],role:'exterior',openings:[]},
    {a:[1000,1000],b:[0,1000],role:'exterior',openings:[]},
    {a:[0,1000],b:[0,0],role:'exterior',openings:[]}
  ];
  const rooms = [{polygon:[[0,0],[500,0],[500,1000],[0,1000]]},{polygon:[[500,0],[1000,0],[1000,1000],[500,1000]]}];
  const walls = ensureRoomBoundaryWalls(exterior,rooms);
  assert.equal(walls.length,5);
  assert.equal(walls[4].role,'interior');
  assert.equal(walls[4].construction,'inferred');
  assert.deepEqual(walls[4].openings,[]);
});

test('staged recognition locks exterior edges, preserves openings, and marks removable interior walls', () => {
  const exterior = {widthMeters:10,depthMeters:8,modelBounds:[100,100,900,900],
    exteriorOutline:[[100,100],[900,100],[900,900],[100,900]],
    exteriorOpenings:[{edgeIndex:0,type:'door',start:.4,end:.6,bottom:0,top:2.1}],
    floorOutline:[[100,100],[900,100],[900,900],[100,900]],voids:[]};
  const interior = {walls:[{a:[500,100],b:[500,900],thickness:.12,construction:'inferred',openings:[]}]};
  const spaces = {rooms:[{polygon:[[100,100],[500,100],[500,900],[100,900]]},{polygon:[[500,100],[900,100],[900,900],[500,900]]}],furniture:[]};
  const staged = assembleRecognitionStages(exterior,interior,spaces);
  assert.equal(staged.walls.length,5);
  assert.equal(staged.walls[0].openings[0].type,'door');
  const plan={dataUrl:'data:image/png;base64,AAAA'};
  const project=projectFromRecognition([staged],[plan],'测试');
  assert.equal(project.floors[0].walls.filter(wall=>wall.role==='exterior').length,4);
  assert.equal(project.floors[0].walls[4].role,'interior');
  assert.equal(project.floors[0].walls[4].construction,'inferred');
  assert.deepEqual(project.floors[0].exteriorOutline,[[0,0],[10,0],[10,8],[0,8]]);
  assert.equal(normalizeProject(project).floors[0].walls[0].role,'exterior');
});

test('recognition converts image coordinates into meters and preserves empty furniture', () => {
  const raw = {widthMeters: 12, depthMeters: 8, modelBounds: [100,100,900,900],
    floorOutline: [[100,100],[900,100],[900,900],[100,900]], voids: [],
    rooms: [{polygon: [[100,100],[900,100],[900,900],[100,900]]}],
    walls: [{a:[100,100],b:[900,100],thickness:.2,openings:[{type:'door',start:.4,end:.6,bottom:0,top:2.1}]}], furniture: []};
  const plan = {dataUrl:'data:image/png;base64,AAAA',imageWidth:1200,imageHeight:800};
  const project = projectFromRecognition([raw,raw],[plan,plan],'测试',3);
  assert.equal(project.floors.length, 2);
  assert.equal(project.floors[1].elevation, 3.2);
  assert.equal(project.floors[0].rooms[0].name, '未命名1');
  assert.equal(project.floors[0].rooms[0].polygon[0][0], 0);
  assert.equal(project.floors[0].rooms[0].polygon[1][0], 12);
  assert.deepEqual(project.floors[0].floorOutline, [[0,0],[12,0],[12,8],[0,8]]);
  assert.equal(project.floors[0].walls[0].openings[0].type, 'door');
  assert.deepEqual(project.floors[0].furniture, []);
  assert.equal(normalizeProject(project).floors[1].rooms[0].name, '未命名1');
});

test('floor outline remains continuous when room extraction misses a corridor', () => {
  const raw = {widthMeters: 10, depthMeters: 10, modelBounds: [100,100,900,900],
    floorOutline: [[100,100],[900,100],[900,900],[100,900]], voids: [],
    rooms: [{polygon: [[100,100],[450,100],[450,900],[100,900]]}], walls: [], furniture: []};
  const plan = {dataUrl:'data:image/png;base64,AAAA',imageWidth:2000,imageHeight:1000};
  const floor = projectFromRecognition([raw],[plan],'校验').floors[0];
  assert.equal(floor.rooms.length, 1);
  assert.deepEqual(floor.floorOutline, [[0,0],[10,0],[10,10],[0,10]]);
  assert.equal(floor.voids.length, 0);
});

test('upper-floor coordinates stay on the shared building grid across different image margins', () => {
  const first = {widthMeters: 12, depthMeters: 8, modelBounds: [100,100,900,900],
    floorOutline: [[100,100],[900,100],[900,900],[100,900]], voids: [],
    rooms: [{polygon: [[100,100],[900,100],[900,900],[100,900]]}],
    walls: [{a:[200,200],b:[700,200],thickness:.2,openings:[]}], furniture: []};
  const upper = {widthMeters: 12, depthMeters: 8, modelBounds: [50,80,850,880],
    floorOutline: [[150,180],[750,180],[750,780],[150,780]], voids: [],
    rooms: [{polygon: [[150,180],[750,180],[750,780],[150,780]]}],
    walls: [{a:[150,180],b:[650,180],thickness:.2,openings:[]}], furniture: []};
  const plan = {dataUrl:'data:image/png;base64,AAAA'};
  const project = projectFromRecognition([first,upper],[plan,plan],'多层对齐');
  assert.deepEqual(project.floors[0].walls[0].a, project.floors[1].walls[0].a);
  assert.deepEqual(project.floors[0].walls[0].b, project.floors[1].walls[0].b);
  assert.deepEqual(project.floors[1].floorOutline, [[1.5,1],[10.5,1],[10.5,7],[1.5,7]]);
});

test('stage prompts preserve the order and separate exterior, interior, and room decisions', () => {
  const outer=buildExteriorPrompt({widthMeters:12,depthMeters:18},true);
  assert.match(outer,/第一张为首层定位参考/);
  assert.match(outer,/外墙中心线/);
  assert.match(outer,/没有实体墙线的区段必须识别为窗或门/);
  assert.match(buildInteriorPrompt({modelBounds:[0,0,1000,1000],exteriorOutline:[[0,0],[1000,0],[1000,1000]],floorOutline:[],voids:[]}),/可拆除内墙/);
  assert.match(buildSpacesPrompt({exteriorOutline:[],floorOutline:[],voids:[]},{walls:[]}),/不存在无构件的开放缺口/);
});
