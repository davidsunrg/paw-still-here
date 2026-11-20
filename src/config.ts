/**
 * 全局可调参数：尺寸、数量、颜色都集中在这里。
 * 坐标约定：访客从 +Z 方向沿石头路走向 -Z，依次经过 大厅 → 通道 → 纪念区。
 */
export const CONFIG = {
  name: '星光宠物纪念馆',

  player: {
    spawnZ: 50,
    eye: 1.65,
    radius: 0.35,
    walk: 4.2,
    run: 8,
  },

  /** 石头路：从 startZ 延伸到大厅正门 (z = 0) */
  path: { startZ: 47, width: 3.2 },

  wallT: 0.4,
  wallH: 5,

  /** 大厅：x ∈ [-w/2, w/2]，z ∈ [0, -d] */
  hall: { w: 24, d: 18, doorHalf: 2.0, doorSpring: 2.4 },

  /** 通道：接在大厅后墙，长度 len */
  corridor: { len: 10, half: 2, doorHalf: 1.6, doorSpring: 2.2 },

  /** 纪念区：接在通道之后 */
  memorial: { w: 36, d: 36 },

  /** 纪念柜 */
  cabinet: {
    count: 8,
    rows: 4,
    cols: 5,
    cellW: 0.72,
    cellH: 0.62,
    depth: 0.42,
    base: 0.4,
    board: 0.04,
  },

  /**
   * 单宠物视角：点击相框后，这一格展开成一个放得下礼物的小龛。
   * w / h / d 是展开后的尺寸，offset 是它从相框向外探出的距离。
   */
  shrine: {
    w: 1.5,
    h: 1.05,
    d: 0.62,
    offset: 0.62,
    /** 小龛中心的高度范围，最下排和最上排的格子展开时会移到这个范围内 */
    minY: 1.0,
    maxY: 2.3,
    /** 刚开始展开时相对最终尺寸的比例（约等于一格的大小） */
    startScale: 0.3,
    /** 展开 / 收回的时长（秒） */
    time: 0.9,
    /** 周围变暗的程度 0–1 */
    veil: 0.93,
    light: 1.3,
    /** 每类礼物最多摆出多少件实物，超过后不再增加模型 */
    caps: { flower: 14, candle: 6, snack: 4, toy: 4, letter: 5 },
  },

  /**
   * 河流：在 z 处横穿石头路，沿 x 方向流向 +x。步道在这里变成一座石拱桥，
   * 码头在桥的下游一侧、靠入口的岸边。
   */
  river: {
    z: 29,
    /** 水面宽度，以及两侧岸坡各占的水平宽度 */
    width: 5,
    bank: 0.5,
    depth: 0.55,
    /** 水面高度（地面是 0） */
    level: -0.2,
    /** 河道向两侧各延伸多远 */
    halfLength: 130,
    /** 水流速度（米 / 秒） */
    flow: 0.45,
    /** 河面上平时漂着的河灯数量，以及访客的河灯最多同时存在几盏 */
    presetLanterns: 36,
    maxUserLanterns: 10,
    /** 访客的河灯漂到离码头这么远时完全淡出 */
    fadeDistance: 46,
    bridge: { halfW: 1.8, len: 7.4, rise: 0.5, rail: 0.42 },
    /** 码头：中心线离桥中心 offsetX，宽 w，从岸边伸进河里 len */
    dock: { offsetX: 4.4, w: 2.2, len: 1.7 },
  },

  /** 宠物数量（上限 100，受照片图集大小限制） */
  petCount: 96,
  /** 大厅照片墙展示的精选数量 */
  wallPhotos: 24,

  sky: {
    stars: 2600,
    bandStars: 1600,
    lanterns: 60,
    /** 流星出现间隔（秒）范围 */
    meteorInterval: [1.5, 5] as [number, number],
  },

  /** 同时参与渲染的点光源数量，以及灯随距离淡出的范围（米） */
  lights: { pool: 10, poolLow: 6, fadeStart: 20, fadeEnd: 30 },

  colors: {
    fog: 0x151833,
    ground: 0x3f6e4a,
    wall: 0xd9cfc0,
    wood: 0x7a5539,
    woodDark: 0x4b3425,
    woodLight: 0xb89468,
    warm: 0xffc47a,
    stone: 0x8d8a84,
  },
};

/** 河道两岸的 Z 坐标：north 靠大厅一侧，south 靠入口一侧 */
export const RIVER_BANKS = {
  north: CONFIG.river.z - CONFIG.river.width / 2 - CONFIG.river.bank,
  south: CONFIG.river.z + CONFIG.river.width / 2 + CONFIG.river.bank,
};

/** 派生出的各区域 Z 坐标 */
export const ZONES = {
  hallFront: 0,
  hallBack: -CONFIG.hall.d,
  memFront: -CONFIG.hall.d - CONFIG.corridor.len,
  memBack: -CONFIG.hall.d - CONFIG.corridor.len - CONFIG.memorial.d,
};
