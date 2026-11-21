import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { CONFIG } from '../config';
import { albumOf, type Pet } from '../data/pets';
import { store, type OfferKind } from '../data/store';
import type { PhotoEntry } from './Batches';
import { flowerStem, letter, toy } from './gifts';
import {
  buildBall,
  buildBalloons,
  buildAromaCandle,
  buildBook,
  buildBowls,
  buildCabinet,
  buildCoffeeTable,
  buildCup,
  buildCushion,
  buildFloorLamp,
  buildPendant,
  buildPetBed,
  buildPhotoFrame,
  buildPlant,
  buildRoomShell,
  buildRoundRug,
  buildShelf,
  buildSofa,
  buildVase,
  buildWindow,
  place,
  type RoomContext,
} from './PetRoom';
import { canvasTexture, drawPortrait, makeCanvas, textMesh } from './textures';
import type { World } from './World';

const S = CONFIG.shrine;
const LAYOUT = S.layout;
const FLOOR = -S.y;
const POP_TIME = 0.48;
const CANDLE_PULSE = 0.55;
const CANDLE_FLAME = new THREE.Color(0xffb45a);

export type ShrineHit = 'letter' | 'niche' | null;

function disposeText(mesh: THREE.Mesh | null) {
  if (!mesh) return;
  mesh.removeFromParent();
  const material = mesh.material as THREE.MeshBasicMaterial;
  material.map?.dispose();
  material.dispose();
  mesh.geometry.dispose();
}

/** 单宠物视角：独立场景里的日常客厅。家具只搭一次，打开时只换照片、名字和礼物 */
export class Shrine {
  readonly scene = new THREE.Scene();
  readonly center = new THREE.Vector3(0, S.y, 0);
  readonly normal = new THREE.Vector3(0, 0, 1);
  entry: PhotoEntry | null = null;

  /** 可点击的家具和礼物；房间壳体不参与拾取 */
  private root = new THREE.Group();
  private architecture = new THREE.Group();
  private roomContext: RoomContext;
  private mainPhoto: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private letters = new THREE.Group();
  private mainFlowers = new THREE.Group();
  private tableFlowers = new THREE.Group();
  private tableVase = new THREE.Group();
  private toys = new THREE.Group();
  private bowls: THREE.Group;
  private balloons: THREE.Group;
  private sofa: THREE.Group;
  private cushionLeft: THREE.Group;
  private cushionRight: THREE.Group;
  private nameText: THREE.Mesh | null = null;
  private placed: Record<OfferKind, THREE.Object3D[]> = { flower: [], candle: [], snack: [], toy: [], letter: [] };
  private pops: Array<{ o: THREE.Object3D; t: number; scale: THREE.Vector3; y: number }> = [];
  private fakeShadows: THREE.Mesh[] = [];
  private sun: THREE.DirectionalLight;
  private time = 0;
  private candlePulse = 0;
  private ray = new THREE.Raycaster();
  private ndc = new THREE.Vector2();

  constructor(private world: World) {
    this.scene.background = new THREE.Color(S.environment.background);
    this.scene.fog = new THREE.Fog(S.environment.background, S.environment.fogNear, S.environment.fogFar);

    // 用 RoomEnvironment 生成这间场景的环境贴图
    const pmrem = new THREE.PMREMGenerator(world.renderer);
    const environment = new RoomEnvironment();
    const fallback = pmrem.fromScene(environment, 0.04);
    this.scene.environment = fallback.texture;
    this.scene.environmentIntensity = S.environment.env;
    environment.dispose();
    pmrem.dispose();

    this.scene.add(new THREE.AmbientLight(0xfff6e8, S.light.ambient));
    this.scene.add(new THREE.HemisphereLight(0xfff1dd, 0x6d5a50, S.light.hemi));
    this.sun = new THREE.DirectionalLight(0xffdfb5, S.light.sun);
    this.sun.position.fromArray(S.light.sunPosition);
    this.sun.target.position.set(0, 0, 0);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.setScalar(S.light.shadowSize);
    Object.assign(this.sun.shadow.camera, { left: -4, right: 4, top: 4, bottom: -4, near: 0.5, far: 18 });
    this.sun.shadow.bias = -0.0005;
    this.sun.shadow.normalBias = 0.025;
    this.sun.shadow.radius = 4;
    this.scene.add(this.sun, this.sun.target);

    this.root.position.copy(this.center);
    this.architecture.position.copy(this.center);
    this.scene.add(this.root, this.architecture);
    this.roomContext = {
      photoMaterial: new THREE.MeshBasicMaterial({ map: world.photos.map, color: 0xffffff }),
      albumPhotos: [],
    };

    const shell = buildRoomShell(this.roomContext);
    shell.position.y = FLOOR;
    this.architecture.add(shell);
    this.architecture.add(place(buildWindow(this.roomContext), LAYOUT.window, FLOOR));

    this.sofa = place(buildSofa(this.roomContext), LAYOUT.sofa, FLOOR);
    this.cushionLeft = place(buildCushion(this.roomContext), LAYOUT.cushionLeft, FLOOR);
    this.cushionRight = place(buildCushion(this.roomContext), LAYOUT.cushionRight, FLOOR);
    this.balloons = place(buildBalloons(this.roomContext), LAYOUT.balloons, FLOOR);
    this.bowls = place(buildBowls(this.roomContext), LAYOUT.bowls, FLOOR);
    this.root.add(
      this.sofa,
      this.cushionLeft,
      this.cushionRight,
      place(buildRoundRug(this.roomContext), LAYOUT.rug, FLOOR),
      place(buildCoffeeTable(this.roomContext), LAYOUT.coffeeTable, FLOOR),
      place(buildPhotoFrame(this.roomContext, S.photo, true), LAYOUT.photo, FLOOR),
      place(buildBook(this.roomContext), LAYOUT.book, FLOOR),
      place(buildCup(this.roomContext), LAYOUT.cup, FLOOR),
      place(buildCabinet(this.roomContext), LAYOUT.cabinet, FLOOR),
      place(buildPetBed(this.roomContext), LAYOUT.bed, FLOOR),
      this.bowls,
      place(buildBall(this.roomContext), LAYOUT.ball, FLOOR),
      place(buildFloorLamp(this.roomContext), LAYOUT.floorLamp, FLOOR),
      place(buildShelf(this.roomContext, S.shelf.lowerW), LAYOUT.shelfLower, FLOOR),
      place(buildShelf(this.roomContext, S.shelf.upperW), LAYOUT.shelfUpper, FLOOR),
      place(buildAromaCandle(this.roomContext), LAYOUT.candle, FLOOR),
      place(buildPlant(this.roomContext), LAYOUT.plant, FLOOR),
      place(buildPhotoFrame(this.roomContext, 0.2), LAYOUT.shelfPhotoA, FLOOR),
      place(buildPhotoFrame(this.roomContext, 0.18), LAYOUT.shelfPhotoB, FLOOR),
      this.balloons,
      place(buildPendant(this.roomContext), LAYOUT.pendant, FLOOR),
    );
    this.mainPhoto = this.roomContext.mainPhoto!;

    // 两只花瓶一直保留各自锚点；茶几花瓶只在主花瓶插满后出现
    const mainVase = place(new THREE.Group(), LAYOUT.mainVase, FLOOR);
    mainVase.add(buildVase(this.roomContext), this.mainFlowers);
    this.tableVase = place(new THREE.Group(), LAYOUT.tableVase, FLOOR);
    this.tableVase.add(buildVase(this.roomContext, true), this.tableFlowers);
    this.root.add(mainVase, this.tableVase);

    place(this.letters, LAYOUT.letters, FLOOR);
    this.root.add(this.letters, this.toys);

    // 两盏局部点光属于这间场景，不借用 world.pointLight，也不开阴影
    const floorLamp = new THREE.PointLight(0xffd0a0, S.light.floorLamp, 4.5, 2);
    floorLamp.position.copy(this.root.localToWorld(new THREE.Vector3(LAYOUT.floorLamp.at[0] - 0.42, FLOOR + S.floorLamp.h - 0.25, LAYOUT.floorLamp.at[2])));
    const pendant = new THREE.PointLight(0xffd6a8, S.light.pendant, 5, 2);
    pendant.position.copy(this.root.localToWorld(new THREE.Vector3(LAYOUT.pendant.at[0], FLOOR + 2.15, LAYOUT.pendant.at[2])));
    this.scene.add(floorLamp, pendant);

    this.root.traverse((o) => {
      if (o instanceof THREE.Mesh && o.userData.contactShadow) this.fakeShadows.push(o);
    });
    this.dusty = true;
  }

  /** dusty 沿用原接口名，现在表示高画质阴影；低画质使用家具下的模糊圆斑 */
  get dusty() {
    return this.sun.castShadow;
  }

  set dusty(on: boolean) {
    this.sun.castShadow = on;
    for (const mesh of this.fakeShadows) mesh.visible = !on;
  }

  get isOpen() {
    return this.entry !== null;
  }

  /** 镜头始终在这间独立客厅的门口范围内 */
  inside(x: number, z: number, margin = 0.3) {
    if (!this.entry) return true;
    return Math.abs(x - this.center.x) < S.room.w / 2 + 0.4 - margin && z > -S.room.d / 2 + margin && z < S.room.d / 2 + 1.8 - margin;
  }

  open(entry: PhotoEntry) {
    this.entry = entry;
    this.candlePulse = 0;
    this.setPet(entry.pet);
    this.rebuild();
    this.root.updateMatrixWorld(true);
    this.architecture.updateMatrixWorld(true);
  }

  close() {
    this.entry = null;
    this.pops.length = 0;
    this.candlePulse = 0;
  }

  /** 新礼物在所属位置轻轻弹出，不再从照片上方落下 */
  drop(kind: OfferKind) {
    if (!this.entry) return;
    this.rebuild();
    // 蜡烛永远只有一只：每次送礼只让同一只火苗跳亮，不走新增物件动画
    if (kind === 'candle') {
      this.candlePulse = CANDLE_PULSE;
      return;
    }
    const list = this.placed[kind];
    const o = list[list.length - 1];
    if (!o) return;
    const scale = o.scale.clone();
    this.pops.push({ o, t: 0, scale, y: o.position.y });
    o.scale.copy(scale).multiplyScalar(0.25);
  }

  pick(clientX: number, clientY: number, camera: THREE.Camera): ShrineHit {
    if (!this.entry) return null;
    this.ndc.set((clientX / window.innerWidth) * 2 - 1, -(clientY / window.innerHeight) * 2 + 1);
    this.ray.setFromCamera(this.ndc, camera);
    const hit = this.ray.intersectObject(this.root, true)[0];
    if (!hit) return null;
    for (let o: THREE.Object3D | null = hit.object; o; o = o.parent) if (o === this.letters) return 'letter';
    return 'niche';
  }

  update(dt: number) {
    if (!this.entry) return;
    this.time += dt;
    this.balloons.rotation.z = Math.sin(this.time * 0.75) * 0.025;
    this.candlePulse = Math.max(0, this.candlePulse - dt);
    const flame = this.roomContext.candleFlame;
    const glow = this.roomContext.candleGlow;
    if (flame?.visible && glow) {
      const flicker = 0.9 + 0.1 * Math.sin(this.time * 9.1) * Math.sin(this.time * 5.3 + 1.2);
      const boost = this.candlePulse / CANDLE_PULSE;
      flame.material.color.copy(CANDLE_FLAME).multiplyScalar(1.35 * flicker + 2.1 * boost);
      flame.scale.set(0.006 * (1 + boost * 0.3), 0.014 * (0.92 + flicker * 0.08 + boost * 0.5), 0.006 * (1 + boost * 0.3));
      flame.position.x = Math.sin(this.time * 8.3) * 0.0012;
      glow.material.opacity = 0.14 * flicker + 0.32 * boost;
      const size = 0.24 + boost * 0.06;
      glow.scale.set(size, size, 1);
    }
    for (let i = this.pops.length - 1; i >= 0; i--) {
      const p = this.pops[i];
      p.t = Math.min(1, p.t + dt / POP_TIME);
      const ease = 1 - Math.pow(1 - p.t, 3);
      const bounce = 1 + Math.sin(p.t * Math.PI) * 0.1;
      p.o.scale.copy(p.scale).multiplyScalar((0.25 + ease * 0.75) * bounce);
      p.o.position.y = p.y + Math.sin(p.t * Math.PI) * 0.025;
      if (p.t >= 1) {
        p.o.scale.copy(p.scale);
        p.o.position.y = p.y;
        this.pops.splice(i, 1);
      }
    }
  }

  private setPet(pet: Pet) {
    const [u0, v0, u1, v1] = this.world.photos.uvOf(pet);
    const uv = this.mainPhoto.geometry.attributes.uv as THREE.BufferAttribute;
    uv.setXY(0, u0, v1);
    uv.setXY(1, u1, v1);
    uv.setXY(2, u0, v0);
    uv.setXY(3, u1, v0);
    uv.needsUpdate = true;
    this.roomContext.frameMaterial?.color.setHex(this.world.slots.get(pet.id)?.frame ?? S.palette.woodDark).multiplyScalar(0.9);

    disposeText(this.nameText);
    this.nameText = textMesh(pet.name, { height: 0.042, color: '#fff3df', maxWidth: 0.18 });
    this.nameText.position.set(-0.16, 0.058, 0.137);
    this.nameText.renderOrder = 11;
    this.bowls.add(this.nameText);
    this.setAlbumPhotos(pet);
  }

  /** 搁板小相框使用相册其他照片；真实图片未到时先画同一张占位画像 */
  private setAlbumPhotos(pet: Pet) {
    const shots = albumOf(pet);
    this.roomContext.albumPhotos.forEach((material, i) => {
      const shot = shots[i];
      const [canvas, ctx] = makeCanvas(256, 256);
      drawPortrait(ctx, 0, 0, 256, pet, shot?.variant ?? i + 1);
      const apply = (texture: THREE.Texture) => {
        material.map?.dispose();
        material.map = texture;
        material.needsUpdate = true;
      };
      apply(canvasTexture(canvas));
      if (shot?.url) {
        new THREE.TextureLoader().load(shot.url, (texture) => {
          if (this.entry?.pet !== pet) {
            texture.dispose();
            return;
          }
          texture.colorSpace = THREE.SRGBColorSpace;
          apply(texture);
        });
      }
    });
  }

  private rebuild() {
    const pet = this.entry?.pet;
    if (!pet) return;
    this.pops.length = 0;
    this.letters.clear();
    this.mainFlowers.clear();
    this.tableFlowers.clear();
    this.toys.clear();
    for (const k of Object.keys(this.placed) as OfferKind[]) this.placed[k] = [];

    const gifts = store.gifts(pet);
    const counts = store.counts(pet);
    const caps = S.caps;
    const flowers = gifts.flower.slice(0, caps.flower);
    this.tableVase.visible = flowers.length > S.gifts.mainVase;
    const addFlowers = (list: number[], target: THREE.Group, small: boolean) => {
      list.forEach((v, j) => {
        const angle = j * 2.4;
        const radius = small ? 0.022 : 0.04;
        const holder = new THREE.Group();
        const stem = flowerStem(v, (small ? 0.18 : 0.25) + 0.025 * (j % 4));
        stem.scale.setScalar(small ? 1 : 1.15);
        stem.rotation.z = j === 0 ? 0 : 0.16 + 0.06 * (j % 3);
        holder.add(stem);
        holder.position.set(Math.cos(angle) * radius, small ? 0.06 : 0.08, Math.sin(angle) * radius);
        holder.rotation.y = angle;
        target.add(holder);
        this.placed.flower.push(holder);
      });
    };
    addFlowers(flowers.slice(0, S.gifts.mainVase), this.mainFlowers, false);
    addFlowers(flowers.slice(S.gifts.mainVase), this.tableFlowers, true);

    gifts.toy.slice(0, caps.toy).forEach((v, i) => {
      const spot = S.gifts.toySpots[i % S.gifts.toySpots.length];
      const o = toy(v, i);
      o.position.set(spot[0], FLOOR + spot[1] + 0.002, spot[2]);
      o.rotation.y = i * 1.7 + 0.4;
      o.scale.setScalar(1.15);
      this.toys.add(o);
      this.placed.toy.push(o);
    });

    const lit = counts.candle > 0;
    if (this.roomContext.candleFlame) this.roomContext.candleFlame.visible = lit;
    if (this.roomContext.candleGlow) this.roomContext.candleGlow.visible = lit;
    if (lit && this.roomContext.candleFlame) this.placed.candle.push(this.roomContext.candleFlame);

    const n = Math.min(counts.letter, caps.letter);
    for (let i = 0; i < n; i++) {
      const o = letter();
      o.position.set((i % 2 ? 0.012 : -0.01), i * 0.0068, -(i % 3) * 0.006);
      o.rotation.y = ((i * 0.37) % 1 - 0.5) * 0.5;
      this.letters.add(o);
      this.placed.letter.push(o);
    }
  }
}
