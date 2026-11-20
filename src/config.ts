/**
 * 全局可调参数：尺寸、数量、颜色都集中在这里。
 * 坐标约定：访客从 +Z 方向沿石头路走向 -Z，依次经过 大厅 → 通道 → 纪念区。
 */
export const CONFIG = {
  name: '星光宠物纪念馆',

  player: {
    spawnZ: 50,
    /** 小人的身高 */
    height: 1.6,
    radius: 0.35,
    walk: 4.2,
    run: 8,
    /** 转身的快慢，越大转得越快 */
    turn: 11,
    /** 自己这个小人的衣服颜色 */
    color: 0xd9b27c,
    /** 离多远以内的相框 / 物件可以点击（按小人的位置算） */
    reachPhoto: 13,
    reachObject: 8,
    /** 点击地面（或远处的相框、物件）让小人走过去：最远能点多远 */
    walkRange: 30,
    /** 摇杆推到这个程度（0–1）以上就跑起来 */
    stickRun: 0.92,
  },

  /** 第三人称镜头：跟在小人身后，绕着它头部附近的一点转 */
  camera: {
    /** 默认距离，以及滚轮 / 双指缩放的范围 */
    dist: 3.6,
    min: 1.5,
    max: 6,
    /** 俯仰角（弧度），负数是从上往下看 */
    pitch: -0.24,
    pitchMin: -1.2,
    pitchMax: 0.3,
    /** 镜头绕着转的那一点离脚底多高 */
    pivot: 1.45,
    /** 镜头和墙、柜子之间至少留多少空隙；被挡住时最近能贴到多近；离地面至少多高 */
    pad: 0.25,
    near: 0.2,
    floor: 0.3,
    /** 镜头离小人这么近时开始 / 完全淡出小人 */
    fadeFar: 1.25,
    fadeNear: 0.6,
    /** 单宠物特写时小人站的位置：离相框多远、往旁边偏多少 */
    standOff: 0.75,
    standSide: 1.2,
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

  /**
   * 篝火空地：在步道左侧（-x 方向），z 处。radius 是空地半径，gap 是空地边缘到步道边缘的距离。
   */
  bonfire: {
    z: 15,
    radius: 2.6,
    gap: 0.8,
    /** 一封信从投出到烧尽的时长（秒） */
    burnTime: 4.8,
  },

  /** 模拟的其他访客 */
  visitors: {
    /** 同时在场的人数：高画质 / 低画质 */
    count: 10,
    countLow: 5,
    /** 行走速度（米 / 秒），比自己走得慢 */
    speed: 1.3,
    /** 在一个地方停留多久（秒） */
    dwell: [15, 60] as [number, number],
    /** 一位访客逛几个地方之后离开 */
    visits: [2, 5] as [number, number],
    /** 进场 / 离场时淡入淡出的时长（秒） */
    fade: 2.5,
    /** 衣服颜色 */
    colors: [0x8fa7bf, 0xb99aa6, 0x9bb59a, 0xc2ad8a, 0xa69bc0, 0x8fb3b0, 0xc09a86, 0x9aa0a8],
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
