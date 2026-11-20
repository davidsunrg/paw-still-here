import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { CONFIG, ZONES } from './config';
import type { Pet } from './data/pets';
import { prefs, store } from './data/store';
import { STR } from './strings';
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
      else if (target === 'hall') player.teleport(0, -2.2, 0);
      else player.teleport(0, ZONES.memFront - 2.5, 0);
    });
  },
  onLantern(text) {
    // 孔明灯从小人面前升起
    world.sky.launch(inFront(1.3, 1.2), text);
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
    return prefs.solo;
  },
  onDetailClosed() {
    if (inSpace) leaveSpace();
  },
  onOffering(pet, kind) {
    world.space.drop(kind);
    world.showInCell(pet, kind);
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
    world.river.launch(pet.name);
    audio.chime(true);
  },
  onGuide(pet) {
    ui.closeAll();
    const entry = cabinetEntry(pet);
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
    const entry = cabinetEntry(pet);
    if (entry) enterSpace(entry);
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

/** 第一次沿步道走近室外的纪念地点时，用一行小字和地上的光点告诉访客这里可以做什么 */
const seen = { river: false, fire: false };
function updateDiscovery() {
  if (!entered || blocked) return;
  const near = (spot: { x: number; z: number }, r: number) => Math.hypot(player.pos.x - spot.x, player.pos.z - spot.z) < r;
  if (!seen.river && near(DOCK_SPOT, 9)) {
    seen.river = true;
    ui.whisper(STR.riverHint);
    if (!guide.active) guide.show(routeToDock(player.pos), () => {});
  } else if (!seen.fire && near(FIRE_SPOT, 7)) {
    seen.fire = true;
    ui.whisper(STR.fireHint);
    const here = new THREE.Vector3(player.pos.x, 0, player.pos.z);
    if (!guide.active) guide.show([here, new THREE.Vector3(FIRE_SPOT.x, 0, FIRE_SPOT.z)], () => {});
  }
}

/** 宠物在纪念柜里的那张相框（照片墙上的不算） */
function cabinetEntry(pet: Pet) {
  const slot = world.slots.get(pet.id);
  return world.photos.entries.find((e) => e.pet === pet && slot && e.center.equals(slot.frame));
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
  const area = player.area;
  player.area = null;
  const free = !player.blocked(back.x, back.z);
  player.area = area;
  if (!free) back = (inSpace ? home : null) ?? { x: player.pos.x, z: player.pos.z, yaw: player.facing };
  interaction?.setHighlight(null);
  marker.hide();
  transition(() => {
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

/** 去别的地方：如果正在小院里（或正在进出），先让画面暗下去再过去 */
function travel(dest: () => void) {
  if (!inSpace && !pending) return dest();
  transition(() => {
    if (inSpace) exitSpace();
    dest();
  });
}

/** 坐下后镜头慢慢转去的方向；访客自己拖动视角或站起来就不再转 */
let swing: number | null = null;

/** 走到长椅前坐下 */
function sitDown() {
  const { seat } = world.space;
  player.walkTo(seat.exit.x, seat.exit.z, 0.25, () => {
    player.sit(seat.x, seat.z, seat.facing, seat.exit);
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
  if (!entered || !interaction || blocked || pending) return;
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
  pose.y += world.space.seat.lift * pose.sit;
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
  world.space.hooks.bench = sitDown;
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
