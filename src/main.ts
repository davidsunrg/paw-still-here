import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { CONFIG } from './config';
import type { Pet } from './data/pets';
import { prefs, store } from './data/store';
import { STR } from './i18n';
import { AudioSystem } from './systems/AudioSystem';
import { Guide } from './systems/Guide';
import { Interaction } from './systems/Interaction';
import { Marker } from './systems/Marker';
import { Player } from './systems/Player';
import { SimulatedVisitors } from './systems/SimulatedVisitors';
import { Crowd } from './systems/Visitors';
import { UI } from './ui/UI';
import './ui/style.css';
import type { PhotoEntry } from './world/Batches';
import { AvatarBatch, defaultPose } from './world/Avatar';
import { pathX } from './world/Outdoor';
import { FIRE_SPOT } from './world/Bonfire';
import { CAVE_BACK, GATE_BACK, inCaveDoor, inGateDoor } from './world/Cave';
import { CINEMA_BACK, CINEMA_ROOM, CINEMA_SPAWN, inCinemaDoor, inCinemaExit } from './world/Cinema';
import { LANTERN_LAUNCH, LANTERN_SPOT } from './world/LanternTerrace';
import { DOCK_SPOT, routeToDock } from './world/River';
import { World } from './world/World';

const canvas = document.getElementById('scene') as HTMLCanvasElement;

// ---------- 渲染器 ----------
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(68, window.innerWidth / window.innerHeight, 0.1, 900);

const composer = new EffectComposer(
  renderer,
  new THREE.WebGLRenderTarget(window.innerWidth, window.innerHeight, { type: THREE.HalfFloatType, samples: 4 }),
);
composer.addPass(new RenderPass(scene, camera));
// 只有亮度超过 1 的自发光物体（灯、烛火、孔明灯）会产生辉光
composer.addPass(new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.62, 0.7, 1.0));
composer.addPass(new OutputPass());

// ---------- 世界、玩家与各系统 ----------
const world = new World(scene);
const player = new Player(camera, canvas, world.colliders);
const audio = new AudioSystem();
const guide = new Guide(scene);
const marker = new Marker(scene);
const avatar = new AvatarBatch(scene, 1);
const pose = defaultPose(CONFIG.player.color);
let interaction: Interaction | null = null;
let crowd: Crowd | null = null;
let entered = false;
let blocked = false;
let quality: 'high' | 'low' = 'high';

const ui = new UI({
  onEnter() {
    entered = true;
    void audio.start().then(() => audio.setMuted(false));
  },
  onTeleport(target) {
    guide.clear();
    travel(() => {
      if (target === 'gate') player.teleport(pathX(CONFIG.player.spawnZ), CONFIG.player.spawnZ, 0);
      else if (target === 'river') toDock();
      else if (target === 'fire') toFire();
      else if (target === 'lantern') toLantern();
      else player.teleport(0, -2.2, 0);
    });
  },
  onLantern(text) {
    // 孔明灯从平台的桌面上方升起
    world.sky.launch(LANTERN_LAUNCH.clone(), text);
    store.addLantern();
    audio.chime(true);
  },
  onToggleSound() {
    audio.setMuted(!audio.muted);
    return audio.muted;
  },
  onToggleQuality() {
    quality = quality === 'high' ? 'low' : 'high';
    applyQuality();
    return quality;
  },
  onToggleSolo() {
    prefs.solo = !prefs.solo;
    if (crowd) crowd.hidden = prefs.solo;
    world.ride.solo = prefs.solo;
    return prefs.solo;
  },
  onDetailClosed() {
    if (inSpace) leaveSpace();
  },
  onOffering(pet, kind) {
    world.space.drop(kind);
    world.gallery.refresh(pet);
    audio.chime(kind === 'candle');
  },
  onRite(kind, pet) {
    // 在它的小院里选择为它放河灯 / 烧信：直接来到码头 / 篝火旁，宠物已经选好
    ui.closeAll();
    guide.clear();
    travel(kind === 'river' ? toDock : toFire);
    ui.openRite(kind, pet);
  },
  onBurnLetter(pet) {
    store.addRite('fire', pet);
    // 信从小人手里飞向火堆
    world.bonfire.burn(inFront(0.35, 1.0));
    audio.chime(false);
  },
  onRiverLantern(pet) {
    store.addRite('river', pet);
    world.river.launch(pet?.name ?? '');
    audio.chime(true);
  },
  onGuide(pet) {
    ui.closeAll();
    const entry = frameOf(pet);
    // 在别的小院里找它：先回到刚才的相框前，再沿着光点走
    travel(() => {
      guide.show(world.routeTo(pet, player.pos), () => {
        ui.toast(STR.guideArrive(pet.name));
        if (entry) enterSpace(entry);
      });
      ui.toast(STR.guideToast(pet.name));
    });
  },
  onGoto(pet) {
    ui.closeAll();
    guide.clear();
    const entry = frameOf(pet);
    if (entry) enterSpace(entry);
  },
  onRideLeave() {
    if (inRide) leaveRide();
  },
  onBlockingChange(b) {
    blocked = b;
    player.enabled = !b;
    if (b) clearHover();
  },
});

world.hooks.guestbook = () => ui.openGuestbook();
world.hooks.reception = () => ui.openSearch();
world.hooks.river = () => ui.openRite('river');
world.hooks.fire = () => ui.openRite('fire');
world.hooks.lantern = () => ui.openLantern();
world.hooks.cinema = () => enterCinema();
world.hooks.cave = () => enterRide('lobby');
world.hooks.gate = () => enterRide('gate');
world.hooks.board = (seat) => boardBoat(seat);
world.hooks.sit = (seats) => {
  // 坐到这张沙发上离自己近的那一边
  const d = (s: { x: number; z: number }) => Math.hypot(s.x - player.pos.x, s.z - player.pos.z);
  const seat = [...seats].sort((a, b) => d(a) - d(b))[0];
  if (!seat) return;
  const go = () => sitDown({ x: seat.x, z: seat.z, facing: seat.facing, yaw: seat.facing, lift: seat.top - CONFIG.player.sitHip, exit: seat.approach });
  const { approach, aisles } = seat;
  // 已经在这一排前面的窄道里，或者座位前面是空地：直接走过去
  if (!aisles || Math.abs(player.pos.z - approach.z) < 0.3) return go();
  // 影厅里一排排座位挡着：先横着走到近的那条过道，沿过道走到这一排，再拐进去
  const ax = [...aisles].sort((a, b) => Math.abs(a - player.pos.x) + Math.abs(a - approach.x) - Math.abs(b - player.pos.x) - Math.abs(b - approach.x))[0];
  player.walkTo(ax, player.pos.z, 0.2, () => player.walkTo(ax, approach.z, 0.2, go));
};

/** 小人面前 dist 米、离地 y 米的位置 */
function inFront(dist: number, y: number) {
  return player.forward().multiplyScalar(dist).add(player.pos).setY(player.pos.y + y);
}

/** 小人站到码头上，面向河面；镜头在它身后斜上方 */
function toDock() {
  seen.river = true;
  player.teleport(DOCK_SPOT.x, DOCK_SPOT.z, DOCK_SPOT.yaw, DOCK_SPOT.pitch, DOCK_SPOT.facing);
}

/** 小人站到篝火旁，面向火堆 */
function toFire() {
  seen.fire = true;
  player.teleport(FIRE_SPOT.x, FIRE_SPOT.z, FIRE_SPOT.yaw, FIRE_SPOT.pitch, FIRE_SPOT.facing);
}

/** 小人站到孔明灯平台的桌前，面向桌子 */
function toLantern() {
  seen.lantern = true;
  player.teleport(LANTERN_SPOT.x, LANTERN_SPOT.z, LANTERN_SPOT.yaw, LANTERN_SPOT.pitch, LANTERN_SPOT.facing);
}

/** 第一次沿步道走近室外的纪念地点时，用一行小字和地上的光点告诉访客这里可以做什么 */
const seen = { river: false, fire: false, lantern: false };
/** 上一条提示是什么时候出的。篝火和孔明灯平台隔着步道相对，两条提示错开，不互相盖掉 */
let hintedAt = -Infinity;
const HINT_GAP = 8;
function updateDiscovery() {
  if (!entered || blocked) return;
  const now = clock.elapsedTime;
  if (now - hintedAt < HINT_GAP) return;
  const near = (spot: { x: number; z: number }, r: number) => Math.hypot(player.pos.x - spot.x, player.pos.z - spot.z) < r;
  const here = () => new THREE.Vector3(player.pos.x, 0, player.pos.z);
  if (!seen.river && near(DOCK_SPOT, 9)) {
    seen.river = true;
    ui.whisper(STR.riverHint);
    if (!guide.active) guide.show(routeToDock(player.pos), () => {});
  } else if (!seen.fire && near(FIRE_SPOT, 7)) {
    seen.fire = true;
    ui.whisper(STR.fireHint);
    if (!guide.active) guide.show([here(), new THREE.Vector3(FIRE_SPOT.x, 0, FIRE_SPOT.z)], () => {});
  } else if (!seen.lantern && near(LANTERN_SPOT, 7)) {
    seen.lantern = true;
    ui.whisper(STR.lanternHint);
    if (!guide.active) guide.show([here(), new THREE.Vector3(LANTERN_SPOT.x, 0, LANTERN_SPOT.z)], () => {});
  } else return;
  hintedAt = now;
}

/** 宠物在照片墙上的那张相框 */
function frameOf(pet: Pet) {
  return world.slots.get(pet.id)?.entry;
}

// ---------- 进出宠物的小院 ----------
/** 是否在某只宠物的小院里；home 是出来以后回到哪里 */
let inSpace = false;
let home: { x: number; z: number; yaw: number } | null = null;
/** 画面正在暗下去：暗到底的那一刻要做的事。期间又有新的去向时，以最后一个为准 */
let pending: (() => void) | null = null;

/** 画面暗下去，在最暗的时候执行 mid（换地方），再亮起来 */
function transition(mid: () => void) {
  const busy = pending !== null;
  pending = mid;
  if (busy) return;
  ui.veil(true);
  window.setTimeout(() => {
    const run = pending!;
    pending = null;
    run();
    ui.veil(false);
  }, CONFIG.space.fade * 1000);
}

function exitSpace() {
  inSpace = false;
  world.space.close();
  player.area = null;
}

/** 走进这只宠物的小院；出来时回到这张相框前 */
function enterSpace(entry: PhotoEntry) {
  const { center, normal } = entry;
  let back = { x: center.x + normal.x * 1.5, z: center.z + normal.z * 1.5, yaw: Math.atan2(normal.x, normal.z) };
  // 相框前站不下人时，回到进来之前站的地方（已经在别的小院里，就沿用上一次的）
  // （在影厅里找它时，就回到影厅的入口前）
  const { area, room } = player;
  player.area = player.room = null;
  const free = !player.blocked(back.x, back.z);
  player.area = area;
  player.room = room;
  if (!free) back = (inSpace ? home : null) ?? (inCinema ? CINEMA_BACK : inRide ? CAVE_BACK : { x: player.pos.x, z: player.pos.z, yaw: player.facing });
  interaction?.setHighlight(null);
  marker.hide();
  transition(() => {
    if (inCinema) exitCinema();
    if (inRide) exitRide();
    home = back;
    inSpace = true;
    world.space.open(entry.pet);
    player.area = world.space.area;
    const { spawn } = world.space;
    player.teleport(spawn.x, spawn.z, spawn.yaw, spawn.pitch, spawn.facing);
    ui.openDetail(entry.pet);
  });
}

/** 从小院回到相框前 */
function leaveSpace() {
  transition(() => {
    exitSpace();
    if (home) player.teleport(home.x, home.z, home.yaw);
  });
}

// ---------- 进出影厅 ----------
let inCinema = false;

/** 离开影厅：回到大厅里的入口前 */
function exitCinema() {
  inCinema = false;
  player.room = null;
  player.teleport(CINEMA_BACK.x, CINEMA_BACK.z, CINEMA_BACK.yaw);
}

/** 走进影厅：画面暗下去，再亮起来时站在放映厅后门口的平台上，面向银幕 */
function enterCinema() {
  if (inCinema) return;
  marker.hide();
  transition(() => {
    if (inSpace) exitSpace();
    inCinema = true;
    player.room = CINEMA_ROOM;
    player.teleport(CINEMA_SPAWN.x, CINEMA_SPAWN.z, CINEMA_SPAWN.yaw, CINEMA_SPAWN.pitch, CINEMA_SPAWN.facing);
    // 平台比地面高，直接站上去，不让小人从地面升上来
    player.pos.y = player.ground;
  });
}

function leaveCinema() {
  transition(() => {
    if (inCinema) exitCinema();
  });
}

// ---------- 思念之河：下到码头，坐船穿过山洞 ----------
/** 是否在河边（在石台、石阶、码头上走，或者坐在船上） */
let inRide = false;
/** 现在在哪一头：洞里通往大厅的码头，还是洞口外通往大门的码头。中途下船、走回头路都回到这一头的入口前 */
let rideSide: 'lobby' | 'gate' = 'lobby';

/** 站到这一头的码头上面的石台上 */
function standAt(side: 'lobby' | 'gate') {
  const { ride } = world;
  const st = side === 'lobby' ? ride.inner : ride.outer;
  rideSide = side;
  player.room = st.room;
  world.setAmbience(ride.ambienceOn(side));
  return st;
}

/** 走进山洞（或者洞口外的码头）：画面暗下去，再亮起来时站在高处的石台上，下面是码头 */
function enterRide(side: 'lobby' | 'gate') {
  if (inRide) return;
  marker.hide();
  guide.clear();
  transition(() => {
    if (inSpace) exitSpace();
    if (inCinema) exitCinema();
    inRide = true;
    world.ride.solo = prefs.solo;
    world.ride.start();
    const { spawn } = standAt(side);
    player.teleport(spawn.x, spawn.z, spawn.yaw, spawn.pitch);
    // 石台比水面高，直接站上去，不让小人从水面升上来
    player.pos.y = player.ground;
    ui.whisper(STR.caveArrive);
  });
}

/** 离开河边（之后去哪里由调用的地方决定） */
function exitRide() {
  inRide = false;
  world.ride.stop();
  world.setAmbience(1);
  player.room = null;
  stopRiding();
}

/** 不再跟着船走（下船了，或者离开了河边） */
function stopRiding() {
  player.riding = false;
  player.lookUp = CONFIG.camera.pitchMax;
  player.boomLimit = Infinity;
  ui.setRiding(false);
}

/** 从河边回到入口前：大厅的洞口，或者大门旁边的石屋 */
function leaveRide(side = rideSide) {
  transition(() => {
    if (!inRide) return;
    exitRide();
    const back = side === 'lobby' ? CAVE_BACK : GATE_BACK;
    player.teleport(back.x, back.z, back.yaw);
  });
}

/** 走到船边，坐到（离点的那个座位最近的）空座上 */
function boardBoat(want: number) {
  if (!inRide || player.riding) return;
  const seat = world.ride.seatNear(want);
  if (!seat) return ui.toast(STR.boatComing);
  player.walkTo(seat.exit.x, seat.exit.z, 0.3, () => {
    // 走过去的这一会儿，船可能开走了，座位也可能被别人坐了
    const now = world.ride.seatNear(seat.code);
    if (!now || !world.ride.claim(now.code)) return ui.toast(STR.boatComing);
    player.sit(now.x, now.z, now.facing, now.exit);
    seatLift = now.lift;
    ui.whisper(STR.boatWait);
  });
}

/** 河边的每一帧：船一班班地走；自己坐在船上时，小人和镜头跟着船 */
function updateRide(dt: number, t: number) {
  const p = world.ride.update(pending && player.riding ? 0 : dt, t, player.pos);
  // 进洞的船靠上了洞里的码头：下船，站到码头上
  const landed = world.ride.takeArrival();
  if (landed) {
    player.sit(player.pos.x, player.pos.z, player.facing, landed);
    player.stand();
    stopRiding();
    standAt('lobby');
    ui.whisper(STR.rideArrive);
    return;
  }
  if (!p) {
    // 走回石台后面的门洞，就回到外面
    const out = pending ? null : world.ride.portalAt(player.pos.x, player.pos.z);
    if (out) leaveRide(out);
    return;
  }
  if (!player.riding) {
    // 船还没开：站起来就让出座位；船开了就不能再走动
    if (!player.seated) return world.ride.release();
    if (!p.sailing) return;
    player.riding = true;
    player.lookUp = CONFIG.cave.lookUp;
    ui.setRiding(true);
    ui.whisper(rideSide === 'lobby' ? STR.rideStart : STR.rideStartIn);
  }
  player.pos.x = p.x;
  player.pos.z = p.z;
  player.facing = p.facing;
  player.yaw += p.turn;
  player.boomLimit = p.boom;
  world.setAmbience(p.ambience);
  // 出洞的船到了终点：画面暗下去，再亮起来时站在室外的码头上
  if (p.done && !pending) {
    transition(() => {
      if (!inRide) return;
      exitRide();
      toDock();
      ui.whisper(STR.rideEnd);
    });
  }
}

/** 去别的地方：如果正在小院、影厅或船上（或正在进出），先让画面暗下去再过去 */
function travel(dest: () => void) {
  if (!inSpace && !inCinema && !inRide && !pending) return dest();
  transition(() => {
    if (inSpace) {
      exitSpace();
      // 先回到相框前；dest 自己会换地方的话，这一步不影响它
      if (home) player.teleport(home.x, home.z, home.yaw);
    }
    if (inCinema) exitCinema();
    if (inRide) exitRide();
    dest();
  });
}

/** 坐下后镜头慢慢转去的方向；访客自己拖动视角或站起来就不再转 */
let swing: number | null = null;

/** 坐着时小人比站着高出多少（长椅和沙发的坐面高度不一样） */
let seatLift = 0;

/** 走到座位前坐下 */
function sitDown(seat: { x: number; z: number; facing: number; yaw: number; lift: number; exit: { x: number; z: number } }) {
  player.walkTo(seat.exit.x, seat.exit.z, 0.25, () => {
    player.sit(seat.x, seat.z, seat.facing, seat.exit);
    seatLift = seat.lift;
    swing = seat.yaw;
  });
}

// ---------- 悬停与点击 ----------
const mouse = { x: 0, y: 0, inside: false, isMouse: false };

function clearHover() {
  ui.setTooltip(null);
  canvas.classList.remove('pointing');
  if (!ui.detailOpen) interaction?.setHighlight(null);
}

canvas.addEventListener('pointermove', (e) => {
  mouse.x = e.clientX;
  mouse.y = e.clientY;
  mouse.inside = true;
  mouse.isMouse = e.pointerType === 'mouse';
});
canvas.addEventListener('pointerleave', () => {
  mouse.inside = false;
  clearHover();
});
canvas.addEventListener('pointerdown', () => canvas.classList.add('dragging'));
window.addEventListener('pointerup', () => canvas.classList.remove('dragging'));

player.onTap = (x, y) => {
  if (!entered || !interaction || blocked || pending || player.riding) return;
  const hit = interaction.pick(x, y);
  if (!hit) {
    // 没点到东西：点的是地面，让小人走过去
    const p = interaction.ground(x, y);
    if (!p) return;
    player.walkTo(p.x, p.z);
    marker.show(p.x, world.heightAt(p.x, p.z), p.z);
    return;
  }
  marker.hide();
  if (hit.kind === 'pet') {
    const { entry } = hit;
    if (!hit.far) return enterSpace(entry);
    // 离得远：先走到相框前，到了再进去
    const x = entry.center.x + entry.normal.x * 1.5;
    const z = entry.center.z + entry.normal.z * 1.5;
    player.walkTo(x, z, 0.3, () => enterSpace(entry));
    marker.show(x, world.heightAt(x, z), z);
  } else if (hit.far) {
    player.walkTo(hit.at.x, hit.at.z, 2.4, hit.item.onClick);
  } else hit.item.onClick();
};

function updateHover() {
  if (!interaction || !entered || blocked || !mouse.inside || !mouse.isMouse || player.dragging) return;
  const hit = interaction.pick(mouse.x, mouse.y);
  if (!hit) {
    clearHover();
    return;
  }
  ui.setTooltip(hit.label, mouse.x, mouse.y);
  canvas.classList.add('pointing');
  interaction.setHighlight(hit.kind === 'pet' ? hit.entry : null);
}

ui.bindJoystick(
  (x, y) => player.stick.set(x, y),
  (x, y) => player.onTap(x, y),
);

// ---------- 画质与尺寸 ----------
function pixelRatio() {
  return Math.min(window.devicePixelRatio, quality === 'high' ? 1.5 : 1);
}

function applyQuality() {
  const pr = pixelRatio();
  renderer.setPixelRatio(pr);
  composer.setPixelRatio(pr);
  if (world.moonLight) world.moonLight.castShadow = quality === 'high';
  world.setLightBudget(quality === 'high' ? CONFIG.lights.pool : CONFIG.lights.poolLow);
  if (crowd) crowd.limit = quality === 'high' ? CONFIG.visitors.count : CONFIG.visitors.countLow;
  resize();
}

function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h, false);
  composer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);

// ---------- 主循环 ----------
const clock = new THREE.Clock();
let viewShift = 0;

function frame() {
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;

  if (inRide) updateRide(dt, t);
  player.update(dt);
  pose.x = player.pos.x;
  pose.y = player.pos.y;
  pose.z = player.pos.z;
  pose.facing = player.facing;
  pose.phase = player.phase;
  pose.stride = player.stride;
  // 坐在长椅上
  if (swing !== null) {
    if (!player.seated || player.dragging) swing = null;
    else player.yaw += Math.atan2(Math.sin(swing - player.yaw), Math.cos(swing - player.yaw)) * (1 - Math.exp(-dt * 2.5));
  }
  pose.sit += ((player.seated ? 1 : 0) - pose.sit) * (1 - Math.exp(-dt * 3.5));
  pose.y += seatLift * pose.sit;
  // 站在它的石柱前时微微低头
  const front = world.space.front;
  const bowing = inSpace && !player.seated && player.stride < 0.1 && Math.hypot(player.pos.x - front.x, player.pos.z - front.z) < 1.6;
  pose.bow += ((bowing ? 0.3 : 0) - pose.bow) * (1 - Math.exp(-dt * 4));
  avatar.set(0, pose, t);
  avatar.opacity = player.fade;
  avatar.commit();
  if (!player.walking) marker.hide();
  marker.update(dt, t);
  crowd?.update(dt, t);
  world.update(dt, t, camera, player.pos, pixelRatio());
  guide.update(t, player.pos);
  interaction?.update(t);
  // 从缺口走出小院，就回到相框前
  if (inSpace && !pending) {
    const { area } = world.space;
    if (Math.hypot(player.pos.x - area.x, player.pos.z - area.z) > area.r + CONFIG.space.leave) ui.closeDetail();
  }
  // 走进大厅右墙的门厅就进影厅；在影厅里走进后门的门厅就回大厅
  if (!pending && entered) {
    if (inCinema) {
      if (inCinemaExit(player.pos.x, player.pos.z)) leaveCinema();
    } else if (!inSpace && !inRide && inCinemaDoor(player.pos.x, player.pos.z)) enterCinema();
    else if (!inSpace && !inRide && inCaveDoor(player.pos.x, player.pos.z)) enterRide('lobby');
    else if (!inSpace && !inRide && inGateDoor(player.pos.x, player.pos.z)) enterRide('gate');
  }
  updateDiscovery();
  updateHover();

  // 资料面板打开时，把画面主体让到面板左侧
  const targetShift = ui.detailWidth / 2;
  viewShift += (targetShift - viewShift) * (1 - Math.exp(-dt * 6));
  if (viewShift > 0.5) camera.setViewOffset(window.innerWidth, window.innerHeight, viewShift, 0, window.innerWidth, window.innerHeight);
  else if (camera.view) camera.clearViewOffset();

  if (quality === 'high') composer.render(dt);
  else renderer.render(scene, camera);
}

// ---------- 启动 ----------
async function boot() {
  quality = ui.isTouch ? 'low' : 'high';
  ui.setQualityLabel(quality);
  player.teleport(pathX(CONFIG.player.spawnZ), CONFIG.player.spawnZ, 0);

  player.heightAt = guide.heightAt = (x, z) => world.heightAt(x, z);
  const steps = world.steps();
  for (let i = 0; i < steps.length; i++) {
    const [key, run] = steps[i];
    ui.setProgress(i / steps.length, STR.loadingSteps[key]);
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    run();
  }
  interaction = new Interaction(camera, world, player.pos);
  world.space.hooks.letters = () => ui.openLetters();
  world.space.hooks.bench = () => sitDown(world.space.seat);
  // 其他访客：现在是本地模拟的；以后接后端时把这里换成从网络收状态的 VisitorSource
  crowd = new Crowd(scene, new SimulatedVisitors(world), CONFIG.visitors.count);
  crowd.hidden = prefs.solo;
  ui.setSoloLabel(prefs.solo);
  applyQuality();
  ui.setProgress(1, '');
  renderer.setAnimationLoop(frame);
  // 等第一帧（着色器编译）结束后再显示入口按钮
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(null))));
  ui.ready();

  if (import.meta.env.DEV) {
    Object.assign(window, { __memorial: { player, world, ui, camera, renderer, avatar, crowd } });
  }
}

void boot();
