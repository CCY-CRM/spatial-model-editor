const ids=["ac-block","air-conditioner","air-conditioner-block","air-conditioning","alarm-keypad","ball","barbell","barbell-stand","basket-hoop","bathroom-sink","bathtub","bean-bag","bedside-table","books","bookshelf","bunkbed","bush","cactus","car-toy","ceiling-fan","ceiling-lamp","ceiling-light","circular-ceiling-light","closet","coat-rack","coffee-machine","coffee-table","column","computer","couch-medium","couch-small","cutting-board","desk","dining-chair","dining-table","door","door-bar","door-with-bar","doorway-front","double-bed","dresser","drying-rack","easel","electric-panel","ev-wall-charger","exercise-bike","exit-sign","fence","fir-tree","fire-alarm","fire-detector","fire-extinguisher","flat-screen-tv","floor-lamp","freezer","fridge","fruits","frying-pan","glass-door","guitar","hedge","high-fence","hood","hydrant","indoor-plant","iron","ironing-board","kettle","kitchen","kitchen-cabinet","kitchen-counter","kitchen-fridge","kitchen-shelf","kitchen-utensils","laundry-bag","livingroom-chair","lounge-chair","low-fence","medium-fence","microwave","office-chair","office-table","outdoor-playhouse","palm","parking-spot","patio-umbrella","piano","picture","pillar","pool-table","recessed-light","rectangular-carpet","rectangular-ceiling-light","rectangular-mirror","round-carpet","round-mirror","scooter","sewing-machine","shelf","shower","shower-angle","shower-rug","shower-square","single-bed","sink-cabinet","skate","small-indoor-plant","smoke-detector","sofa","sprinkler","stairs","stereo-speaker","stool","stove","sunbed","suspended-fireplace","table","table-lamp","television","tesla","thermostat","threadmill","toaster","toilet","toilet-brush","toilet-paper","toy","trash-bin","tree","tub","tv-stand","wall-art-06","wall-sink","washing-machine","window-double","window-large","window-rectangle","window-round","window-simple","window-small","window-small-2","window-square","window1-black-open-1731","wine-bottle"];
const rules=[
  ["beds",/^(single-bed|double-bed|bunkbed)$/,"bed"],
  ["sofas",/sofa|couch|bean-bag|sunbed/,"sofa"],
  ["chairs",/chair|stool/,"chair"],
  ["tables",/table|desk|pool-table/,"table"],
  ["storage",/closet|dresser|bookshelf|shelf|cabinet|counter|tv-stand|coat-rack/,"cabinet"],
  ["kitchen",/fridge|freezer|stove|hood|coffee-machine|microwave|toaster|kettle|cutting-board|frying-pan|utensils|fruits|wine-bottle|kitchen/,"other"],
  ["bathroom",/sink|bathtub|shower|toilet|tub/,"other"],
  ["lighting",/lamp|light/,"other"],
  ["appliances",/air-condition|ceiling-fan|flat-screen-tv|television|computer|washing-machine|iron|sewing-machine|thermostat|stereo-speaker/,"other"],
  ["decor",/books|plant|bush|cactus|tree|palm|hedge|carpet|mirror|picture|wall-art|guitar|piano|easel|toy|ball|trash-bin|laundry-bag|drying-rack|patio-umbrella/,"other"],
  ["fitness",/barbell|exercise-bike|threadmill|skate|scooter|basket-hoop/,"other"],
  ["safety",/alarm|detector|extinguisher|hydrant|sprinkler|exit-sign|electric-panel|ev-wall-charger/,"other"],
  ["building",/door|window|fence|column|pillar|stairs|parking-spot|ac-block/,"other"]
];
export const GROUP_LABELS={beds:"床",sofas:"沙发",chairs:"椅子",tables:"桌子",storage:"收纳柜",kitchen:"厨房",bathroom:"卫浴",lighting:"灯具",appliances:"家电",decor:"装饰",fitness:"运动",safety:"设备",building:"建筑部件",other:"其他"};
export function defaultFurnitureGroup(type){return ({bed:"beds",sofa:"sofas",chair:"chairs",table:"tables",cabinet:"storage"})[type]||"decor";}
export const FURNITURE_CATALOG=ids.map(id=>{const match=rules.find(([,re])=>re.test(id))||["other",null,"other"];return {id,name:id.split("-").map(s=>s[0].toUpperCase()+s.slice(1)).join(" "),group:match[0],type:match[2],model:"./assets/aedifex/items/"+id+"/model.glb",thumbnail:"./assets/aedifex/items/"+id+"/thumbnail.webp"};});
export const furnitureAsset=id=>FURNITURE_CATALOG.find(item=>item.id===id);
