import type { Section, Species } from '../data/pets';

/**
 * 英语文案。这是最完整的一份：别的语言照着它的结构写，类型由它定出来，缺一条就编译不过。
 * 访客能看到的字都在这里，包括场景里的字、示例宠物的名字和寄语。
 */
export const en = {
  /** 这门语言的排版：html 的 lang、字体、标题的字间距（相对中文的倍数） */
  style: {
    lang: 'en',
    serif: "'Iowan Old Style', 'Palatino Linotype', Palatino, Georgia, 'Times New Roman', serif",
    sans: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
    tracking: 0.2,
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
      "As long as they're remembered, they're still with us. Walk through a quiet memorial under the night sky, stop at their photo, leave a flower, light a candle, or write them a letter.",
  },
  loading: 'Lighting the stars…',
  loadingSteps: {
    sky: 'Lighting the stars…',
    outdoor: 'Laying the stone path…',
    river: 'Letting the river in…',
    fire: 'Lighting the campfire…',
    lantern: 'Folding the paper lanterns…',
    hall: 'Setting up the lobby…',
    gallery: 'Hanging the frames…',
    shrine: 'Dusting the little shelves…',
    cinema: 'Dimming the theater lights…',
    cave: 'Filling the river in the cave…',
    finish: 'Almost there…',
  },
  enter: 'Enter',
  hintDesktop: 'WASD or click the ground to move · Drag to look around · Scroll to zoom · Shift to run · Click a photo to visit them',
  hintTouch: 'Left stick or tap the ground to move · Swipe on the right to look around · Tap a photo to visit them',

  soundOn: 'Sound: on',
  soundOff: 'Sound: off',
  qualityHigh: 'Quality: high',
  qualityLow: 'Quality: low',
  help: 'Help',
  soloOff: 'Visitors: shown',
  soloOn: 'Visitors: hidden',

  tpGate: 'Gate',
  tpDock: 'Dock',
  tpFire: 'Fire',
  tpLantern: 'Lanterns',
  tpHall: 'Lobby',

  wallTitle: 'Still here.',
  /** 右墙两个入口之间的一行字 */
  wallTitleRight: 'Stay a while.',

  tipPet: 'Visit them',
  tipLetters: 'Read the letters written to them',
  tipBench: 'Sit for a while',
  /** 纪念树：点树 */
  tipTree: 'Read the letters on the tree',
  tipReception: 'Front desk · A place for your pet',
  tipDock: 'Float a river lantern',
  tipLantern: 'Release a sky lantern',
  /** 影厅：大厅右墙的入口、招牌上的两行字、座位、出口上方的牌子、银幕没有放映时的一行字 */
  tipCinema: 'Step into the Memory Theater',
  cinemaSign: 'The Memory Theater',
  cinemaNow: 'Now showing · The days we shared',
  tipSeat: 'Take this seat',
  cinemaExit: 'Lobby',
  cinemaIdle: 'Take any seat',
  /** 思念之河：洞口上方木牌的两行字、鼠标悬停的提示、还没开放时点了之后的一行字 */
  caveSign: 'The River of Longing',
  caveSub: 'By boat, through the cave, to the dock',
  tipCave: 'Step into the River of Longing',
  caveArrow: 'To the boats',
  caveSubGate: 'By boat, through the cave, to the lobby',
  caveGate: 'Gate',
  caveArrive: 'Take the steps down to the dock. A boat leaves every little while.',
  tipBoat: 'Take a seat on the boat',
  boatComing: 'The next boat is on its way.',
  boatWait: 'The boat sets off in a moment.',
  rideStart: 'Drag to look around. The boat will carry you to the dock.',
  rideStartIn: 'Drag to look around. The boat will carry you into the cave.',
  rideArrive: 'Take the steps up to the lobby.',
  rideEnd: 'The boat brought you to the dock outside the cave. Take the steps up when you are ready.',
  rideLeave: 'Leave the boat',

  /** 三处小木头路牌上的名字（两三个词） */
  signRiver: 'River lanterns',
  signLantern: 'Sky lanterns',
  signFire: 'Letters to the fire',
  tipFire: 'Burn a letter for them',
  fireHint: 'By the campfire you can write a letter and burn it for them',
  fireTitle: 'Burn a letter for them',
  /** 来历：这件事在很多地方意味着什么（放在怎么做之前） */
  fireLore: 'Giving a letter to the fire is an old way of sending words you cannot deliver by hand.',
  fireDesc: 'Write down what you want to say and give it to the fire. Your words rise as sparks into the night sky.',
  fireNote: 'A burned letter is not saved. We only remember that you wrote to them. To keep a letter, leave it beside their photo instead.',
  firePlaceholder: 'What you want to tell them…',
  fireFor: (name: string) => `This letter is for ${name}`,
  fireGo: 'Give it to the fire',
  fireToast: (name: string) => `Your letter to ${name} is in the fire. Look up at the rising sparks`,
  riverHint: 'At the dock by the river you can float a lantern for them',
  riverTitle: 'Float a river lantern',
  riverLore: 'In many places, people set small lanterns on the water at night. Each one carries a thought for someone they love.',
  riverDesc: 'Set a lantern on the water and let it glow. If it is for one of them, their name is written on it.',
  riverPlaceholder: 'Type a name to find the one you remember…',
  /** 选宠物是可选的时候，搜索框里的提示（河灯、孔明灯） */
  pickOptional: 'For one of them? Type a name (optional)…',
  riverFor: (name: string) => `This lantern carries the name ${name}`,
  riverChange: 'Change',
  riverPick: 'Choose',
  riverGo: 'Set it afloat',
  riverToast: (name: string) => `The lantern for ${name} is on the water, glowing`,
  /** 没有写给某一只的河灯 */
  riverToastPlain: 'Your lantern is on the water, glowing',

  giftFlower: 'Flower',
  giftCandle: 'Candle',
  giftSnack: 'Treat',
  giftToy: 'Toy',
  giftLetter: 'Letter',
  giftToast: {
    flower: (name: string) => `You left a flower for ${name}`,
    candle: (name: string) => `You brightened the candle in ${name}'s room`,
    snack: (name: string) => `You brought ${name} a treat`,
    toy: (name: string) => `You brought ${name} a toy`,
    letter: (name: string) => `Your letter is now beside ${name}`,
  },
  shrineHint: 'Drag to look around · Esc to go back',
  shrineHintTouch: 'Drag to look around · Tap outside to go back',
  shrineLeave: 'Back',
  /** 相册 */
  albumLabel: 'Photos',
  photoPrev: 'Previous photo',
  photoNext: 'Next photo',
  photoOf: (i: number, n: number) => `Photo ${i} of ${n}`,
  riteRiver: 'Float a river lantern',
  riteFire: 'Burn a letter',

  /**
   * 信：每一封都挂在纪念树上（树上的一块木牌）。写给某一只的，同时留在它的纪念角里。
   * 底部的按钮、弹窗的标题和说明；只看写给某一只的时候的标题、回到全部的按钮；单宠物视角里的按钮
   */
  letters: 'Letters',
  lettersTitle: 'Letters on the tree',
  lettersDesc: 'Every letter left here hangs on the Remembering Tree. Read them, or leave one of your own.',
  letterTitle: (name: string) => `Letters to ${name}`,
  lettersAll: 'All letters',
  riteLetters: 'Letters to them',
  /** 写一封：输入框里的提示、选好了写给谁、按钮、写完之后的一行字（没有写给某一只的） */
  letterPlaceholder: 'Take your time. What do you want to tell them…',
  letterFor: (name: string) => `This letter is for ${name}`,
  letterWrite: 'Write a letter',
  letterSend: 'Leave this letter',
  letterToast: 'Your letter is on the tree',
  letterEmpty: 'No letters here yet. Yours can be the first.',
  /** 列表里，一封信是写给谁的；没有写给某一只的；自己写的 */
  letterTo: (name: string) => `To ${name}`,
  letterToAll: 'To all the little ones here',
  letterMine: 'Yours',
  /** 每封信右上角：去看看它 */
  letterVisit: (name: string) => `Visit ${name}`,
  /** 每封信下面：爱心（给看不见图标的人念的）、回一句、回的话有几条、输入框、发送、举报、举报之后的一行字 */
  letterHeart: 'Send a heart',
  letterReply: 'Reply',
  letterReplies: (n: number) => (n === 1 ? '1 reply' : `${n} replies`),
  replyPlaceholder: 'A few kind words back…',
  replySend: 'Send',
  letterReport: 'Report',
  reportToast: 'Thank you for telling us. You will not see that letter again.',

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
    cinema: 'Theater',
    cave: 'River',
    entrance: 'Entrance',
    closed: 'Gallery · not open yet',
    here: 'You are here',
    cells: (cells: number) => `1–${cells}`,
  },
  close: 'Close',

  lanternTitle: 'Release a sky lantern',
  lanternHint: 'At the lantern table you can write a line and send a sky lantern up',
  lanternLore: 'A sky lantern is a paper lantern lifted by the warmth of its own flame. People release them to send a wish, or a few words, upward.',
  lanternDesc: 'Write a line and let the lantern lift it into the night sky. You can also send it for one of them.',
  lanternFor: (name: string) => `This lantern is for ${name}`,
  lanternPlaceholder: 'What you want to tell them…',
  lanternGo: 'Release',
  lanternDefault: 'Remembered, and still with us',
  lanternToast: 'Your lantern is rising. Look up',

  createMemorialTitle: 'Create a memorial',
  petName: 'Name',
  speciesLabel: 'Species',
  breedLabel: 'Breed (optional)',
  passedDateLabel: 'Passing date',
  messageLabel: 'A few words',
  memorialSave: 'Save',
  memorialCreated: 'Memorial saved — welcome back.',
  memorialUpdated: 'Memorial updated.',
  memorialDeleted: 'Memorial removed.',
  memorialError: 'Could not reach the memorial service.',
  memorialDelete: 'Delete this memorial',
  memorialEdit: 'Edit memorial',
  memorialEditor: {
    title: 'A place for your pet',
    subtitle: 'Start with a name and a species. Everything else can wait until you are ready.',
    editTitle: (name: string) => `Edit ${name}'s memorial`,
    editSubtitle: 'Update the details or rearrange the album. Other visitors cannot edit this memorial in this browser.',
    choosePhoto: 'Choose a photo',
    changePhoto: 'Change photo',
    removePhoto: 'Remove',
    emptyMain: 'Optional — a portrait will be drawn if no photo is added.',
    name: 'Name *',
    species: 'Species *',
    more: 'More details',
    less: 'Fewer details',
    breed: 'Breed (optional)',
    birth: 'Birth date (optional)',
    passed: 'Passing date (optional)',
    message: 'A few words (optional)',
    messagePlaceholder: 'A habit, a favorite place, something you still want to say…',
    album: 'Photo album (optional)',
    addPhotos: 'Add photos',
    moveUp: 'Move photo left',
    moveDown: 'Move photo right',
    saveCreate: 'Place on the photo wall',
    saveEdit: 'Save changes',
    saving: 'Saving…',
    uploading: (done: number, total: number) => `Uploading ${done} of ${total}…`,
    editHint: 'You can edit this memorial later in this browser.',
    delete: 'Delete memorial',
    deleteConfirm: (name: string) => `Delete ${name}'s memorial? This cannot be undone.`,
    deleteCancel: 'Keep it',
    deleteConfirmButton: 'Delete permanently',
    deleting: 'Deleting…',
    errorRequired: 'Please add a name and choose a species.',
    errorImageType: 'Please choose image files only.',
    errorImageSize: 'Each photo must be 10 MB or smaller.',
    errorGalleryFull: 'The photo wall is full. Please try again after a space becomes available.',
    errorUnauthorized: 'Your session has expired. Please reload and try again.',
    errorForbidden: 'This memorial can only be edited by its creator in this browser.',
    errorUpload: 'A photo could not be uploaded. Your text and completed uploads are still here — please retry.',
    errorDelete: 'Could not delete this memorial. Please try again.',
    errorGeneric: 'Could not save. Your entries are still here — please try again.',
    status: {
      existing: 'Saved',
      pending: 'Waiting to upload',
      uploading: 'Uploading…',
      completed: 'Uploaded',
      error: 'Upload failed — retry when saving',
    },
  },

  /** 右上角：主按钮、自己的宠物、收着设置的菜单 */
  addPet: 'Add your pet',
  myPets: 'My pets',
  menu: 'Settings',
  myPetsTitle: 'My pets',
  myPetsEmpty: 'You have not added a pet in this browser yet.',
  /** 还没有自己的宠物时出现一次的小卡片 */
  inviteText: 'Every frame here holds someone loved. There is room for yours.',
  inviteClose: 'Not now',

  /** 真实宠物的礼物和信保存在服务器上：一天一次、失败、写信太多、删信 */
  giftAlready: {
    flower: (name: string) => `You already left ${name} a flower today. Come back tomorrow.`,
    candle: (name: string) => `Your candle for ${name} is still lit today. Come back tomorrow.`,
    snack: (name: string) => `${name} already has your treat today. Come back tomorrow.`,
    toy: (name: string) => `${name} already has your toy today. Come back tomorrow.`,
  },
  giftFailed: 'That did not reach them. Please try again.',
  letterLimit: 'You have left several letters here today. Come back tomorrow to write more.',
  letterFailed: 'Your letter could not be saved. Please try again.',
  letterRemove: 'Remove',
  letterRemoved: 'Letter removed.',
  /** 主人回来时：不在的这段时间里，别人留下了多少东西 */
  awayToast: (name: string, n: number) =>
    n === 1 ? `While you were away, someone left something for ${name}` : `While you were away, ${n} things were left for ${name}`,

  /** 专属链接：入口按钮、链接里的宠物已经不在了 */
  enterVisit: (name: string) => `Visit ${name}`,
  linkMissing: 'That memorial is no longer here.',
  /** 分享：按钮、弹窗的标题和说明（平时 / 刚创建完）、各个按钮、做完之后的一行字 */
  share: 'Share',
  shareTitle: (name: string) => `Share ${name}'s place`,
  shareDesc: 'Anyone with this link arrives right here, and can leave a flower or a letter.',
  shareCreatedTitle: (name: string) => `${name}'s frame is on the wall`,
  shareCreatedDesc: 'Send this link to the people who loved them, so they can visit too.',
  shareCopy: 'Copy',
  shareCopied: 'Link copied',
  shareSend: 'Send the link',
  shareImage: 'Save a picture',
  shareImageSaved: 'Picture saved',
  shareImageFailed: 'Could not make the picture. Please try again.',
  shareText: (name: string) => `I made a place to remember ${name}. Come and visit.`,
  shareCardVisit: (name: string) => `Visit ${name} at`,

  searchEmpty: 'Nothing found. Try another name.',
  searchGuide: 'Guide me',
  searchGoto: 'Go there',
  guideToast: (name: string) => `Follow the lights on the ground to find ${name}`,
  guideArrive: (name: string) => `${name} is right here`,

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
      'Your leash still hangs by the door. I touch it on my way out.',
      'It rained today. I thought of how you watched the window.',
      'I found one of your toys under the sofa and sat with it for a while.',
      'The neighbors still ask about you. Everyone remembers you.',
      'I planted the flowers you used to sniff. They came up this spring.',
      'Some evenings I still save you the last bite.',
    ],
    /** 写给这里所有小家伙的信（没有写给某一只的），示例的几封 */
    guestbook: [
      'Thank you for this place. It is good to have somewhere to come and remember.',
      'Every little one here is remembered by someone. That is a lovely thing.',
      'I came to see one, and stayed to read all their names.',
    ],
  },
};
