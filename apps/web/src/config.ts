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
    /** 单宠物特写时左右拖动，镜头最多绕着纪念角往每一边转多少（弧度） */
    focusTurn: 0.5,
  },

  /** 石头路：从 startZ 延伸到大厅正门 (z = 0) */
  path: { startZ: 47, width: 3.2 },

  /** 河灯、孔明灯、篝火旁边的小木头路牌：木桩多高、木板的宽 / 高 / 厚、字多高 */
  signpost: { h: 1.3, w: 1.0, boardH: 0.3, t: 0.04, text: 0.2 },

  wallT: 0.4,
  wallH: 5,

  /** 大厅：x ∈ [-w/2, w/2]，z ∈ [0, -d]。backDoor 是后墙正中通往展区的石门（展区还没开，门关着） */
  hall: { w: 24, d: 18, doorHalf: 2.0, doorSpring: 2.4, backDoorHalf: 1.6, backDoorSpring: 2.2, sofaX: 5.2, receptionX: 6.7, elevatorX: -7, mapX: -4.65, stringZ: [-2, -13.2, -4.8, -16] },

  /**
   * 大厅两面墙上的照片墙。进门左手是 1 号墙（A 区），正对面（石门两侧）是 2 号墙（B 区）。右手那面墙不挂照片，是影厅和河的入口。
   * 每面墙 rows 行；格号按列编：面向墙从左到右，每列从上到下。
   */
  gallery: {
    rows: 3,
    /** 每行相框中心的高度，从上到下 */
    rowY: [2.5, 1.75, 1.0],
    /** 相邻两列的间距，相框的边长 */
    pitch: 0.8,
    frame: 0.5,
    /** 1 号墙多少列；2 号墙石门两侧各多少列，以及最靠近石门的一列离中轴线多远 */
    sideCols: 20,
    backCols: 11,
    backInner: 2.5,
    /** 贴在墙上的石板：从多高到多高、多厚 */
    slabY: [0.5, 3.0] as [number, number],
    slabT: 0.1, lane: 8, plaqueY: 3.42,
    /** 后门展区：三排双面展墙，每面 12 列 × 3 行 = 36 格；中间是走道 */
    wing: {
      cols: 12,
      length: 12,
      thickness: 0.4,
      height: 3.6,
      wallZ: [-24.5, -28.5, -32.5],
      backZ: -36,
      corridorHalf: 1.6,
      corridorEnd: -21.5,
    },
  },

  /**
   * 单宠物视角：一间独立 THREE.Scene 里的温馨客厅，不与主场景共用灯光、背景或雾。
   * 房间坐标以地板中心为基准，+Z 朝门口；layout 的 y 以家具落点或安装点为基准。
   * 打开哪只宠物，只换茶几照片、搁板照片、窝边名字牌和礼物。
   */
  shrine: {
    /** 客厅内部的宽、进深、高（米）；镜头固定在前墙外的门口 */
    room: { w: 5.2, d: 3.6, h: 2.9 },
    /** 圆茶几的半径和台面高度；窗边小矮柜的宽、深、高 */
    table: { radius: 0.66, h: 0.4 },
    cabinet: { w: 0.62, d: 0.4, h: 0.52 },
    /** 茶几主照片的边长、镜头注视高度 */
    photo: 0.34,
    y: 1.25,
    /** 取景：doorway 控制桌面 / 竖屏门口距离；body 与 fill 用于背墙辅助校正 */
    view: {
      body: [4.8, 2.8] as [number, number],
      fill: [0.9, 0.78] as [number, number],
      mobileBody: [1.65, 2.75] as [number, number],
      mobileFill: [0.94, 0.68] as [number, number],
      doorway: 0.72,
      mobileDoorway: 0.76,
    },
    /**
     * 家具布置表：at 是 [x, y, z]，yaw 是绕竖直轴的朝向，scale 是整体缩放。
     * 桌面物件的 y 是茶几面，搁板物件的 y 是搁板面；其它家具原点在地板落点。
     */
    layout: {
      sofa: { at: [-1.72, 0, -1.2] as [number, number, number], yaw: 0, scale: 1 },
      cushionLeft: { at: [-2.14, 0.48, -1.28] as [number, number, number], yaw: -0.12, scale: 1 },
      cushionRight: { at: [-1.3, 0.48, -1.28] as [number, number, number], yaw: 0.14, scale: 1 },
      rug: { at: [0, 0, 0.18] as [number, number, number], yaw: 0, scale: 1 },
      coffeeTable: { at: [0, 0, 0.18] as [number, number, number], yaw: 0, scale: 1 },
      photo: { at: [0, 0.4, 0.18] as [number, number, number], yaw: -0.05, scale: 1 },
      book: { at: [-0.35, 0.405, 0.28] as [number, number, number], yaw: -0.14, scale: 1 },
      cup: { at: [0.31, 0.4, 0.38] as [number, number, number], yaw: -0.16, scale: 1 },
      letters: { at: [-0.31, 0.415, 0.44] as [number, number, number], yaw: 0.08, scale: 1 },
      tableVase: { at: [-0.45, 0.4, -0.04] as [number, number, number], yaw: 0, scale: 1 },
      cabinet: { at: [1.28, 0, -1.48] as [number, number, number], yaw: 0, scale: 1 },
      mainVase: { at: [1.28, 0.52, -1.48] as [number, number, number], yaw: 0, scale: 1 },
      balloons: { at: [1.57, 0, -1.29] as [number, number, number], yaw: 0, scale: 1 },
      bed: { at: [1.32, 0, -0.45] as [number, number, number], yaw: 0.12, scale: 1 },
      bowls: { at: [1.55, 0, 0.3] as [number, number, number], yaw: -0.18, scale: 1 },
      ball: { at: [1.12, 0, 0.52] as [number, number, number], yaw: 0.4, scale: 1 },
      floorLamp: { at: [2.34, 0, -0.82] as [number, number, number], yaw: 0, scale: 1 },
      shelfLower: { at: [-1.72, 1.35, -1.76] as [number, number, number], yaw: 0, scale: 1 },
      shelfUpper: { at: [-1.72, 1.9, -1.76] as [number, number, number], yaw: 0, scale: 1 },
      candle: { at: [-1.15, 1.39, -1.63] as [number, number, number], yaw: 0, scale: 1 },
      plant: { at: [-2.05, 1.94, -1.66] as [number, number, number], yaw: 0, scale: 1 },
      shelfPhotoA: { at: [-1.8, 1.39, -1.65] as [number, number, number], yaw: -0.06, scale: 1 },
      shelfPhotoB: { at: [-1.48, 1.94, -1.65] as [number, number, number], yaw: 0.08, scale: 1 },
      window: { at: [0, 0, -1.77] as [number, number, number], yaw: 0, scale: 1 },
      pendant: { at: [0, 0, -0.2] as [number, number, number], yaw: 0, scale: 1 },
    },
    /** 沙发净宽、宠物窝半径、落地灯高；大窗宽 / 高 / 中心高；上下搁板宽度 */
    sofa: { w: 1.7 },
    bed: { radius: 0.58 },
    floorLamp: { h: 1.72 },
    window: { w: 1.65, h: 1.45, y: 1.65, stringBulbs: 6 },
    shelf: { lowerW: 1.18, upperW: 1.02, d: 0.25 },
    /** 灰绿墙、深红棕地板、米白布料、蜂蜜木；橙色只用于靠垫、气球等小面积 */
    palette: {
      wall: 0x91aaa0,
      wallLow: 0xb9c8ba,
      ceiling: 0xece5d8,
      trim: 0xf2ecdf,
      wood: 0xb77a45,
      woodDark: 0x75503a,
      floor: 0x704238,
      fabric: 0xeee4d3,
      fabricShade: 0xd7c7ae,
      accent: 0xd57a3d,
      brass: 0xa8834c,
      leaf: 0x5d7f60,
      curtain: 0xf4ead9,
    },
    /** 独立场景的环境反射、背景与雾；HDR 仅在开发环境替换 RoomEnvironment */
    environment: { env: 0.35, background: 0x53645d, fogNear: 9, fogFar: 22 },
    /** 只让太阳、灯泡和灯罩轻微发光，墙和布料自身不超过 1 */
    glow: { sun: 1.04, shade: 1.02, bulbs: 1.65 },
    /** 独立灯光：环境光、半球光、窗口平行光、落地灯与吊灯；主光从背墙窗户方向射入 */
    light: {
      ambient: 0.12,
      hemi: 0.28,
      sun: 1.15,
      sunPosition: [-2, 6, -4] as [number, number, number],
      floorLamp: 0.65,
      pendant: 0.55,
      shadowSize: 1024,
    },
    /** 主花瓶先插满 10 枝，剩余花才进茶几小花瓶；玩具散点全部位于窝边地毯 / 地板 */
    gifts: {
      mainVase: 10,
      toySpots: [[1.02, 0, 0.62], [1.58, 0, 0.58], [1.96, 0, 0.02], [0.94, 0, -0.12]] as Array<[number, number, number]>,
    },
    /** 可摆放礼物的数量上限；candle 和 snack 只由 store 与礼物栏计数，不占这里的摆放名额 */
    caps: { flower: 14, toy: 4, letter: 5 },
    /** 相册：sample 是示例宠物各有几张，variants 是程序占位画像的画法数量 */
    album: {
      sample: [2, 4] as [number, number],
      variants: 4,
    },
  },

  /** 换地方（进出影厅、山洞）时画面暗下去 / 亮起来各用多久（秒） */
  fade: 0.45,

  /**
   * 纪念树。plaques 是树冠下面挂着的木牌（每块是一封信）：示例的一共多少块、木牌的宽 / 高 / 厚、
   * 木牌中心离地多高（最低、最高，都在人头顶以上）、挂在离树干多远的一圈里（最近、最远）；
   * own 是访客自己的木牌最多亮几块（写得再多也只挂这么多）。
   * sway 是木牌的轻轻摆动：最大摆多少（弧度）、最多拧多少（弧度）、摆一个来回要几秒（范围）、离树多远以内才摆
   */
  tree: {
    plaques: { count: 40, w: 0.17, h: 0.25, t: 0.022, y: [2.25, 3.35] as [number, number], ring: [1.1, 2.9] as [number, number], own: 12, sway: { angle: 0.045, twist: 0.12, period: [4, 6.5], range: 45 } },
  },

  /**
   * 影厅：入口在大厅右墙靠后墙的一侧，走进门厅后画面暗下去，换到建在主场景之外很远处的放映厅。
   * 放映厅里的坐标：银幕在 -Z 一端，出入口在 +Z 一端的后墙正中；座位一排比一排高。
   */
  cinema: {
    x: -600,
    z: 0,
    /** 现在用哪一版：public = 原来的多人剧院，private = 两排沙发的私人放映室 */
    mode: 'public' as 'public' | 'private',
    /** 门洞：在右墙的哪里（z）、半宽、高；门洞后面那段挂着帘子的门厅有多深；走进门厅多深就算进去了 */
    door: { z: -13.2, half: 1.2, h: 2.7, depth: 2.0, enter: 0.9 },
    /** 原来的多人剧院：四排独立座椅、一排比一排高 */
    public: {
      /** 放映厅内部的宽和高；银幕墙和后墙各在 z 的哪里 */
      w: 11,
      h: 5.6,
      front: -7,
      back: 7.5,
      /** 银幕的宽、高、中心高度 */
      screen: { w: 7.2, h: 4.05, y: 3.05 },
      /** 几排、第一排在 z 的哪里、排距、每排比前一排高多少；中间过道两侧各几个座位、座位间距、中间过道的宽 */
      rows: 4,
      firstRow: -1.5,
      rowPitch: 1.5,
      rise: 0.22,
      seatsPerSide: 4,
      seatPitch: 0.8,
      aisle: 1.6,
    },
    /** 私人放映室：两排三人沙发、只高一级 */
    private: {
      w: 8,
      h: 4.4,
      front: -5.6,
      back: 5.6,
      screen: { w: 5, h: 2.81, y: 2.4 },
      rows: 2,
      rowZ: [-1.6, 1.2] as [number, number],
      rise: 0.32,
      sofa: { width: 2.7, depth: 0.95, seats: 3 },
      /** 后排平台的起始 z：从这里往后地面高 rise */
      stepZ: 0,
    },
  },

  /**
   * 思念之河：入口在大厅右墙靠大门的一侧，是一个石砌的拱形洞口。进去迎面是一个箭头，右拐走进一条窄道，
   * 画面暗下去，换到建在主场景之外很远处的大山洞：人站在洞壁高处的石台上，沿石阶走下去是码头，
   * 船一班接一班地来，坐上去顺水漂过山洞；出洞之后来到室外的码头。
   * 反过来也可以：大门旁边有一间石屋，走进去换到洞口外的码头，坐船漂进山洞，靠上洞里的码头，走上石阶回到大厅。
   */
  cave: {
    /** 洞口：在右墙的哪里（z）、半宽、拱从多高开始起弧（拱顶 = spring + half）；洞口后面那一小间岩洞有多深；右拐的那条窄道有多长、走进去多深就换到山洞里 */
    door: { z: -4.8, half: 1.3, spring: 1.6, depth: 2.4, turn: 3.0, enter: 0.7 },
    /** 大门旁边的石屋：中心在哪、门朝西（朝着石头路）；进深、半宽、高；走进去多深就换到洞口外的码头 */
    gate: { x: 6.6, z: 50.5, depth: 3.0, half: 1.3, h: 2.7, enter: 0.9 },
    /** 山洞建在哪里（河道的起点） */
    x: 0,
    z: -600,
    /** 船速（米 / 秒）。从洞里的码头到洞口外大约 130 米，2.2 约一分钟 */
    speed: 2.2,
    /**
     * 河道的中线（相对起点的 x、z），和沿途的横截面：[走了多远, 洞底半宽, 洞顶高度]，中间平滑过渡。
     * 整条河在一个很大的洞厅里，横截面是半个椭圆。洞厅要足够宽、足够高：洞壁离河道远，沿途的灯照到洞壁上才是淡淡的一层，洞里才显得暗而空旷。洞顶高度为 0 的一段是露天的（出洞之后）。
     * 开头和结尾各有一段是笔直的（连续三个点 x 相同）：两处码头贴着河道，船要能靠得上。
     * 洞口外的码头对着倒数第二个点。
     */
    path: [[0, 0], [0, -14], [0, -24], [6, -46], [4, -70], [-6, -95], [-4, -118], [-4, -134], [-4, -150], [-4, -192]] as Array<[number, number]>,
    profile: [[0, 84, 52], [30, 110, 68], [70, 110, 68], [106, 24, 16], [112, 24, 0], [200, 24, 0]] as Array<[number, number, number]>,
    /** 洞壁的石块大概多大（半径）；照洞壁的灯比普通的灯多远还亮着 */
    rock: 7,
    lightReach: 50,
    /** 洞里的石台比水面高多少、码头的木板比水面高多少 */
    station: { ledge: 4, deck: 0.4 },
    /**
     * 船：每隔多少秒发一班（不等坐满）；停在河道上多远的地方上人；每条航线准备几条船轮着用；
     * 每一班有几位别的访客同乘（最少、最多）；进洞的船靠岸后停多少秒让人下船
     */
    boat: { interval: 24, moor: 9.5, count: 9, riders: [1, 3] as [number, number], unload: 10 },
    /**
     * 从船上放的河灯：水面上最多留几盏（再放，最早的一盏慢慢淡出）；放在离船舷多远、船的中心往前多远（ahead，比船头再靠前一点）的水面上；从手里的高度（hand）
     * 落到水面要几秒；水面上那圈光有多大；灯放在自己坐的那一侧，离码头不到 dockClear 米、那一侧又正好是码头时换到另一侧
     */
    floats: { max: 10, reach: 0.4, ahead: 4.6, hand: 0.7, lower: 1.6, glow: 1.9, dockClear: 26 },
    /** 洞里夜空的底光剩下多少（1 是室外）；太暗只靠远灯会显得一片黑 */
    ambience: 0.2,
    /** 在船上最多能仰视多少（弧度） */
    lookUp: 0.85,
    /** 快到终点时，提前多少米开始让画面暗下去 */
    fadeOut: 4,
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

  /** 示例宠物数量：六层都铺满示例；在线时用真实宠物顶掉对应格 */
  petCount: 2052,

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
