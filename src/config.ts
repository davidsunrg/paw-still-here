/**
 * 全局可调参数：尺寸、数量、颜色都集中在这里。
 * 坐标约定：访客从 +Z 方向沿石头路走向 -Z，走进大厅。
 */
export const CONFIG = {
  player: {
    spawnZ: 50,
    /** 小人的身高 */
    height: 1.6,
    radius: 0.35,
    /** 坐着时臀部比站立的基准高度高多少（和 Avatar 里的坐姿对应） */
    sitHip: 0.42,
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
    /** 镜头和墙之间至少留多少空隙；被挡住时最近能贴到多近；离地面至少多高 */
    pad: 0.25,
    near: 0.2,
    floor: 0.3,
    /** 镜头离小人这么近时开始 / 完全淡出小人 */
    fadeFar: 1.25,
    fadeNear: 0.6,
  },

  /** 石头路：从 startZ 延伸到大厅正门 (z = 0) */
  path: { startZ: 47, width: 3.2 },

  wallT: 0.4,
  wallH: 5,

  /** 大厅：x ∈ [-w/2, w/2]，z ∈ [0, -d]。backDoor 是后墙正中通往展区的石门（展区还没开，门关着） */
  hall: { w: 24, d: 18, doorHalf: 2.0, doorSpring: 2.4, backDoorHalf: 1.6, backDoorSpring: 2.2, sofaX: 5.2, receptionX: 6.7, elevatorX: -7, mapX: -4.65, stringZ: [-2, -4.8, -13.2, -16] },

  /**
   * 大厅三面墙上的照片墙。进门左手是 1 号墙，正对面（石门两侧）是 2 号墙，右手是 3 号墙（正中是影厅入口）。
   * 每面墙 rows 行；格号按列编：面向墙从左到右，每列从上到下。
   */
  gallery: {
    rows: 3,
    /** 每行相框中心的高度，从上到下 */
    rowY: [2.5, 1.75, 1.0],
    /** 相邻两列的间距，相框的边长 */
    pitch: 0.8,
    frame: 0.5,
    /** 1、3 号墙各多少列；2 号墙石门两侧各多少列，以及最靠近石门的一列离中轴线多远 */
    sideCols: 20,
    /** 3 号墙（C 区）正中为影厅入口让出几列，所以 C 区比 A 区少这么多列 */
    doorCols: 4,
    backCols: 11,
    backInner: 2.5,
    /** 贴在墙上的石板：从多高到多高、多厚 */
    slabY: [0.5, 3.0] as [number, number],
    slabT: 0.1, lane: 8, plaqueY: 3.42,
  },

  /**
   * 每只宠物的专属纪念空间：一座露天小院，正中是它的石柱，柱脚的石阶上放礼物，四周一圈弧形石墙。
   * 全馆只有这一座，建在主场景之外很远的地方，进去时换成那只宠物的内容。
   * 院子里的坐标：石柱在 -Z 一侧，出口（弧墙的缺口）朝 +Z。
   */
  space: {
    x: 600,
    z: 0,
    /** 弧墙内侧的半径，墙的高度和厚度，墙围了多少度 */
    radius: 4.2,
    wallH: 2.5,
    wallT: 0.35,
    arc: 240,
    /** 从缺口最远能走出多远；走出这么远就算离开 */
    out: 2.4,
    leave: 1.1,
    /** 进出时画面暗下去 / 亮起来各用多久（秒） */
    fade: 0.45,
    /** 礼物模型放大多少 */
    giftScale: 1.8,
    /** 每类礼物最多摆出多少件实物，超过后不再增加模型 */
    caps: { flower: 14, candle: 6, snack: 4, toy: 4, letter: 5 },
    /** 石柱两侧壁灯和缺口灯柱的亮度 */
    light: 7,
    gateLight: 5,
    /**
     * 相册：这只宠物另外的几张照片，挂在弧墙内侧。
     * angles 是每张挂在什么方向（度，从缺口方向量起，正数在进门的右手边），照片按这个顺序挂；
     * size 是照片边长，y 是照片中心的高度；
     * sample 是示例宠物各有几张，variants 是占位画像一共有几种画法（和 textures 里的 POSES 一致）。
     */
    album: { angles: [102, -102, 80, -80, 124, -124], size: 0.6, y: 1.62, sample: [2, 4] as [number, number], variants: 4 },
  },

  /**
   * 影厅：入口在大厅右墙（C 区）正中，走进门厅后画面暗下去，换到建在主场景之外很远处的放映厅。
   * 放映厅里的坐标：银幕在 -Z 一端，出入口在 +Z 一端的后墙正中；座位一排比一排高。
   */
  cinema: {
    x: -600,
    z: 0,
    /** 放映厅内部的宽和高；银幕墙和后墙各在 z 的哪里 */
    w: 11,
    h: 5.6,
    front: -7,
    back: 7.5,
    /** 银幕的宽、高、中心高度 */
    screen: { w: 7.2, h: 4.05, y: 3.05 },
    /** 座位：几排、第一排在 z 的哪里、排距、每排比前一排高多少；中间过道两侧各几个座位、座位间距、中间过道的宽 */
    rows: 4,
    firstRow: -1.5,
    rowPitch: 1.5,
    rise: 0.22,
    seatsPerSide: 4,
    seatPitch: 0.8,
    aisle: 1.6,
    /** 门洞：半宽、高；门洞后面那段挂着帘子的门厅有多深；走进门厅多深就算进去了 */
    door: { half: 1.2, h: 2.7, depth: 2.0, enter: 0.9 },
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

  /**
   * 孔明灯平台：在步道右侧（+x 方向），隔着步道正对篝火。radius 是石台半径，gap 是石台边缘到步道边缘的距离。
   */
  lanternTerrace: {
    z: 15,
    radius: 2.3,
    gap: 0.8,
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
};
