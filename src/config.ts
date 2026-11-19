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

/** 派生出的各区域 Z 坐标 */
export const ZONES = {
  hallFront: 0,
  hallBack: -CONFIG.hall.d,
  memFront: -CONFIG.hall.d - CONFIG.corridor.len,
  memBack: -CONFIG.hall.d - CONFIG.corridor.len - CONFIG.memorial.d,
};
