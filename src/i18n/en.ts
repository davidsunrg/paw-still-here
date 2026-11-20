import type { Section, Species } from '../data/pets';

/**
 * 英语文案。这是最完整的一份：别的语言照着它的结构写，类型由它定出来，缺一条就编译不过。
 * 访客能看到的字都在这里，包括场景里的字、示例宠物的名字和寄语。
 */
export const en = {
  /** 这门语言的排版：html 的 lang、字体、标题的字间距（相对中文的倍数）、石柱上寄语一行最多几个字符 */
  style: {
    lang: 'en',
    serif: "'Iowan Old Style', 'Palatino Linotype', Palatino, Georgia, 'Times New Roman', serif",
    sans: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
    tracking: 0.2,
    pillarLine: 26,
  },

  brand: 'Paw Still Here',
  /** 主标语：入口页 */
  tagline: "As long as they're remembered, they're still with us.",
  /** 短标语：入口木牌、接待台背景墙 */
  taglineShort: 'Remembered, and still with us.',
  /** 入口页底部的网址 */
  site: 'pawstillhere.com',
  /** 页面信息：打包时写进 index.html 的 title、description 和分享卡片（见 vite.config.ts） */
  meta: {
    url: 'https://pawstillhere.com/',
    title: 'Paw Still Here · A quiet place to remember your pet',
    description:
      "As long as they're remembered, they're still with us. Walk through a quiet memorial under the night sky, visit their courtyard, leave a flower, light a candle, or write them a letter.",
  },
  loading: 'Lighting the stars…',
  loadingSteps: {
    sky: 'Lighting the stars…',
    outdoor: 'Laying the stone path…',
    river: 'Letting the river in…',
    fire: 'Lighting the campfire…',
    hall: 'Setting up the lobby…',
    gallery: 'Hanging the frames…',
    space: 'Sweeping the courtyard…',
    finish: 'Almost there…',
  },
  enter: 'Enter',
  hintDesktop: 'WASD or click the ground to move · Drag to look around · Scroll to zoom · Shift to run · Click a frame to visit',
  hintTouch: 'Left stick or tap the ground to move · Swipe on the right to look around · Tap a frame to visit',

  soundOn: 'Sound: on',
  soundOff: 'Sound: off',
  qualityHigh: 'Quality: high',
  qualityLow: 'Quality: low',
  help: 'Help',
  soloOff: 'Visitors: shown',
  soloOn: 'Visitors: hidden',

  tpGate: 'Gate',
  tpRiver: 'River',
  tpFire: 'Fire',
  tpHall: 'Lobby',
  search: 'Find a pet',
  lantern: 'Sky lantern',

  wallTitle: 'Still here.',
  treeLabel: 'The Remembering Tree',

  tipPet: 'Visit their courtyard',
  tipLetters: 'Read the letters written to them',
  tipBench: 'Sit for a while',
  tipGuestbook: 'Open the guestbook',
  tipReception: 'Front desk · Find a pet',
  tipDock: 'Float a river lantern',

  tipFire: 'Burn a letter for them',
  fireHint: 'By the campfire you can write a letter and burn it for them',
  fireTitle: 'Burn a letter for them',
  fireDesc: 'Write down what you want to say and give it to the fire. Your words rise as sparks into the night sky.',
  fireNote: 'A burned letter is not saved. We only remember that you wrote to them. To keep a letter, leave it in their courtyard instead.',
  firePlaceholder: 'What you want to tell them…',
  fireFor: (name: string) => `This letter is for ${name}`,
  fireGo: 'Give it to the fire',
  fireToast: (name: string) => `Your letter to ${name} is in the fire. Look up at the rising sparks`,
  riverHint: 'At the dock by the river you can float a lantern for them',
  riverTitle: 'Float a river lantern',
  riverDesc: 'Their name is written on the lantern. Set it on the water and let it glow.',
  riverPlaceholder: 'Type a name to find the one you remember…',
  riverFor: (name: string) => `This lantern carries the name ${name}`,
  riverChange: 'Change',
  riverPick: 'Choose',
  riverGo: 'Set it afloat',
  riverToast: (name: string) => `The lantern for ${name} is on the water, glowing`,

  giftFlower: 'Flower',
  giftCandle: 'Candle',
  giftSnack: 'Treat',
  giftToy: 'Toy',
  giftLetter: 'Letter',
  giftToast: {
    flower: (name: string) => `You left a flower for ${name}`,
    candle: (name: string) => `You lit a candle for ${name}`,
    snack: (name: string) => `You brought ${name} a treat`,
    toy: (name: string) => `You brought ${name} a toy`,
    letter: (name: string) => `Your letter is now beside ${name}`,
  },
  shrineHint: 'Use the icons below to leave something for them · Walk out of the courtyard or press Esc to go back',
  shrineHintTouch: 'Use the icons below to leave something for them · Walk out of the courtyard to go back',
  spaceLeave: 'Back to the frame',
  riteRiver: 'Float a river lantern',
  riteFire: 'Burn a letter',

  letterTitle: (name: string) => `Letters to ${name}`,
  letterPlaceholder: 'Take your time. What do you want to tell them…',
  letterSend: 'Leave it beside them',
  letterEmpty: 'No letters here yet. Yours can be the first.',
  /** 留言列表里，一封信是写给谁的 */
  letterTo: (name: string) => `To ${name}`,

  /** 物种的显示名 */
  species: { cat: 'Cat', dog: 'Dog', rabbit: 'Rabbit', hamster: 'Hamster', bird: 'Bird' } as Record<Species, string>,

  /** 一只宠物的地址 */
  address: (floor: number, section: Section, cell: number) => `Floor ${floor} · Section ${section} · No. ${cell}`,
  /** 电梯门上方的楼层数字 */
  floorNumber: '1',
  sectionName: (section: Section) => `Section ${section}`,
  /** 每个区两端的铭牌 */
  sectionPlaque: (section: Section, cells: number) => `Section ${section} · 1–${cells}`,
  /** 电梯旁的本层总览图 */
  map: {
    title: 'Floor 1 · Lobby',
    tree: 'Tree',
    reception: 'Front desk',
    elevator: 'Elevator',
    entrance: 'Entrance',
    closed: 'Gallery · not open yet',
    here: 'You are here',
    cells: (cells: number) => `1–${cells}`,
  },
  close: 'Close',

  lanternTitle: 'Release a sky lantern',
  lanternDesc: 'Write a line for them and let the lantern lift it into the night sky.',
  lanternPlaceholder: 'What you want to tell them…',
  lanternGo: 'Release',
  lanternDefault: 'Remembered, and still with us',
  lanternToast: 'Your lantern is rising. Look up',

  guestbookTitle: 'Guestbook',
  guestbookPlaceholder: 'Leave a line for all the little ones here…',
  guestbookSend: 'Write',

  searchTitle: 'Find a pet',
  searchPlaceholder: 'Name, breed or section…',
  searchEmpty: 'Nothing found. Try another name.',
  searchGuide: 'Guide me',
  searchGoto: 'Go there',
  guideToast: (name: string) => `Follow the lights on the ground to find ${name}`,
  guideArrive: (name: string) => `${name} is right here`,

  commentToast: 'Your note has been left',

  /**
   * 示例宠物的内容。各个列表的条数不要改：示例宠物是用固定的随机数从里面挑的，
   * 条数变了，每只宠物挑到的名字、品种、寄语都会跟着变。
   */
  sample: {
    /** 名字用完时的后备名 */
    fallbackName: (i: number) => `Little one ${i}`,
    names: [
      'Mochi', 'Biscuit', 'Luna', 'Milo', 'Peanut', 'Snowball', 'Cola', 'Latte', 'Pudding', 'Waffles', 'Dumpling', 'Muffin',
      'Daisy', 'Clementine', 'Rusty', 'Shadow', 'Fuzzy', 'Lucky', 'Happy', 'Missy', 'Pip', 'Sticky', 'Sesame', 'Bao',
      'Nugget', 'Bun', 'Gyoza', 'Marshmallow', 'Chestnut', 'Yuzu', 'Peaches', 'Jelly', 'Oreo', 'Coco', 'Mocha', 'Toffee',
      'Puff', 'Custard', 'Fries', 'Spud', 'Pumpkin', 'Hazel', 'Goober', 'Walnut', 'Sugar', 'Honey', 'Maple', 'Winter',
      'Sunday', 'Friday', 'Fortune', 'Buddy', 'Sunny', 'Joy', 'Goldie', 'Teddy', 'Tiger', 'Tubbs', 'Meatball', 'Popsicle',
      'Cotton', 'Cloud', 'Star', 'Moon', 'Seven', 'Pepper', 'September', 'Rice', 'Bean', 'Barley', 'Fish', 'Bubbles',
      'Dot', 'Patch', 'Smokey', 'Inky', 'Penny', 'Silver', 'Pineapple', 'Mango', 'Melon', 'Cherry', 'Coconut', 'Lemon',
      'Bear', 'Bella', 'Toot', 'Gus', 'Chirp', 'Tweet', 'Hopper', 'Sparkle', 'Gigi', 'Smiley', 'Annie', 'Sweetie',
      'Mojo', 'Wheat', 'Abu', 'Jellybean',
    ],
    breeds: {
      cat: ['Orange Tabby', 'British Shorthair', 'Ragdoll', 'Brown Tabby', 'Siamese', 'American Shorthair', 'Calico'],
      dog: ['Golden Retriever', 'Corgi', 'Shiba Inu', 'Poodle', 'Border Collie', 'Labrador', 'Mixed Breed', 'Samoyed'],
      rabbit: ['Lop', 'Netherland Dwarf', 'Angora'],
      hamster: ['Syrian', 'Winter White', 'Pudding'],
      bird: ['Cockatiel', 'Budgie', 'Java Sparrow'],
    } as Record<Species, string[]>,
    /** 主人寄语 */
    messages: [
      'Thank you for every day and night beside me.',
      'The house still feels like yours. I miss you.',
      'I still say good morning to you. Every day.',
      'You were the sweetest little one. Always.',
      'I still look for you every time I open the door.',
      'I hope the snacks and the sunshine never run out.',
      'Meeting you was one of the luckiest things in my life.',
      'You taught me what unconditional love is.',
      'I still hear you running to the door.',
      'I still keep your favorite little blanket.',
      'Sorry for the days I came home late. Thank you for never minding.',
      'I walked by your meadow today. The wind was gentle, like you.',
      'You just found another way to stay with me, right?',
      'Good night, my little darling.',
      'Your spot on the balcony is still yours.',
      'You are family. You always were.',
    ],
    /** 示例宠物身边预先放着的信 */
    letters: [
      'I cooked the chicken you loved today, and made an extra portion out of habit.',
      'We moved. The new windowsill is wide, and you would love the sun there.',
      'I dreamed of you last night. You still run so fast.',
      'I washed your little bowl and put it away. I cannot throw it out.',
      'It is the day you came home to us again. Happy birthday.',
      'Thank you for being my little alarm clock all these years.',
    ],
    /** 留言簿里默认展示的几条留言 */
    guestbook: [
      'Thank you for this place. It is good to have somewhere to come and remember.',
      'Every little one here is remembered by someone. That is a lovely thing.',
      'I came to see one, and stayed to read all their names.',
    ],
  },
};
