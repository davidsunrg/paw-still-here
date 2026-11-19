/** 所有界面与场景文案集中在这里，方便以后做多语言。 */
export const STR = {
  brand: '星光宠物纪念馆',
  subtitle: '它们只是先去了星星上',
  loading: '正在点亮星空…',
  loadingSteps: {
    sky: '正在点亮星空…',
    outdoor: '正在铺好石头路…',
    hall: '正在布置大厅…',
    corridor: '正在点亮通道…',
    memorial: '正在摆放相框…',
    finish: '马上就好…',
  },
  enter: '进入纪念馆',
  hintDesktop: 'WASD / 方向键移动 · 按住鼠标拖动转视角 · Shift 加速 · 点击相框查看',
  hintTouch: '左下摇杆移动 · 滑动屏幕转视角 · 点击相框查看',

  soundOn: '声音：开',
  soundOff: '声音：关',
  qualityHigh: '画质：高',
  qualityLow: '画质：低',
  help: '帮助',

  tpGate: '入口',
  tpHall: '大厅',
  tpMemorial: '纪念区',
  search: '找宠物',
  lantern: '放孔明灯',

  hallSign: '纪念区',
  wallTitle: '它们曾来过',
  cabinetZone: '区',
  treeLabel: '纪念树',

  tipPet: '点击看看',
  tipGuestbook: '翻开留言簿',
  tipReception: '接待台 · 查找宠物',

  detailFlower: '献花',
  detailCandle: '点蜡烛',
  detailComments: '留言',
  detailNoComments: '还没有留言，写下第一句想念吧。',
  detailPlaceholder: '写下想对它说的话…',
  detailSend: '留言',
  detailLocation: (cab: string, slot: number) => `${cab} 区 · 第 ${slot} 格`,
  close: '关闭',

  lanternTitle: '放一盏孔明灯',
  lanternDesc: '写一句话，让它随灯升上夜空。',
  lanternPlaceholder: '想对它说的话…',
  lanternGo: '放飞',
  lanternDefault: '愿你在星星上一切都好',
  lanternToast: '孔明灯升空了，抬头看看吧',

  guestbookTitle: '留言簿',
  guestbookPlaceholder: '给所有小天使留一句话…',
  guestbookSend: '写下',

  searchTitle: '查找宠物',
  searchPlaceholder: '输入名字、品种或柜子编号…',
  searchEmpty: '没有找到，换个名字试试。',
  searchGuide: '指引',
  searchGoto: '传送',
  guideToast: (name: string) => `沿着地上的光点，就能找到${name}`,
  guideArrive: (name: string) => `${name}就在这里`,

  flowerToast: (name: string) => `你为${name}献上了一朵花`,
  candleToast: (name: string) => `你为${name}点亮了一支蜡烛`,
  commentToast: '留言已留下',

  /** 通道墙上的短句 */
  quotes: [
    '它们只是先去了星星上',
    '谢谢你，陪我走过这一程',
    '想你的时候，就抬头看看',
    '爱不会因为离开而消失',
  ],

  /** 留言簿里默认展示的几条留言 */
  sampleGuestbook: [
    '谢谢这里，让思念有个地方安放。',
    '愿所有的小天使，在那边不再生病。',
    '今晚的星星很亮，一定是你在眨眼睛。',
  ],
};
