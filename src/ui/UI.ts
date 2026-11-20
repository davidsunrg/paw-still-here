import { petById, PETS, SECTIONS, type Pet } from '../data/pets';
import { store, type Letter, type OfferKind, type RiteKind } from '../data/store';
import { applyLocaleStyle, STR } from '../i18n';
import { portraitDataURL } from '../world/textures';

export type TeleportTarget = 'gate' | 'river' | 'fire' | 'lantern' | 'hall';

/** 带「选一只宠物」的四个弹窗：河灯、烧信、孔明灯、写一封信（post）。只有烧信必须选 */
type PickKind = RiteKind | 'lantern' | 'post';

export interface UIHooks {
  onEnter(): void;
  onTeleport(target: TeleportTarget): void;
  onLantern(text: string): void;
  /** 返回切换后的静音状态 */
  onToggleSound(): boolean;
  /** 返回切换后的画质 */
  onToggleQuality(): 'high' | 'low';
  /** 切换「独自参观」，返回切换后是否隐藏其他访客 */
  onToggleSolo(): boolean;
  onDetailClosed(): void;
  /** 访客在它的小院里放了一件礼物或一封信（数据已保存） */
  onOffering(pet: Pet, kind: OfferKind): void;
  /** 在它的小院里选择为它放河灯 / 烧信：把访客带到码头 / 篝火旁 */
  onRite(kind: RiteKind, pet: Pet): void;
  /** 访客在码头放下了一盏河灯；pet 是写在灯上的那只宠物，没有选就是 null */
  onRiverLantern(pet: Pet | null): void;
  /** 访客把写给这只宠物的信投进了篝火（信的内容不保存，所以这里不传） */
  onBurnLetter(pet: Pet): void;
  /**
   * 访客写了一封信（数据已保存）：树上多一块木牌。pet 是写给谁的，没有选就是 null；
   * here 是访客此刻正在这只宠物的小院里（信会落在石阶上）
   */
  onLetter(pet: Pet | null, here: boolean): void;
  onGuide(pet: Pet): void;
  onGoto(pet: Pet): void;
  /** 中途下船 */
  /** 坐在船上时点「放河灯」 */
  onRideLantern(): void;
  onRideLeave(): void;
  /** 有面板打开时需要暂停走动 */
  onBlockingChange(blocked: boolean): void;
}

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

/** 爪印：没有写给某一只的信用它当头像（和页面左上角的是同一个） */
const PAW_SVG =
  '<svg viewBox="0 0 100 100" aria-hidden="true"><ellipse cx="50" cy="66" rx="23" ry="18"/><ellipse cx="22" cy="42" rx="8" ry="11" transform="rotate(-20 22 42)"/>' +
  '<ellipse cx="40" cy="26" rx="8" ry="11" transform="rotate(-6 40 26)"/><ellipse cx="60" cy="26" rx="8" ry="11" transform="rotate(6 60 26)"/>' +
  '<ellipse cx="78" cy="42" rx="8" ry="11" transform="rotate(20 78 42)"/></svg>';

function timeLabel(t: number) {
  if (!t) return '';
  const d = new Date(t);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export class UI {
  readonly isTouch = matchMedia('(pointer: coarse)').matches;
  private pet: Pet | null = null;
  private toastTimer = 0;
  private hintTimer = 0;
  private shrineHinted = false;
  private ritePet: Record<PickKind, Pet | null> = { river: null, fire: null, lantern: null, post: null };
  /** 信的弹窗现在只看写给哪一只的；null 是看全部 */
  private lettersPet: Pet | null = null;
  /** 信的弹窗里只看自己写的 */
  private onlyMine = false;
  /** 信的列表里用过的头像，画一次就留着 */
  private avatars = new Map<string, string>();
  private tooltip = $('tooltip');

  constructor(private hooks: UIHooks) {
    document.body.classList.toggle('touch', this.isTouch);

    // 静态文案
    applyLocaleStyle();
    document.querySelectorAll<HTMLElement>('[data-t]').forEach((el) => {
      const v = (STR as Record<string, unknown>)[el.dataset.t!];
      if (typeof v === 'string') el.textContent = v;
    });
    $<HTMLTextAreaElement>('post-input').placeholder = STR.letterPlaceholder;
    $<HTMLInputElement>('post-search').placeholder = STR.pickOptional;
    $<HTMLInputElement>('lantern-input').placeholder = STR.lanternPlaceholder;
    $<HTMLInputElement>('search-input').placeholder = STR.searchPlaceholder;
    $<HTMLInputElement>('river-search').placeholder = STR.pickOptional;
    $<HTMLInputElement>('lantern-search').placeholder = STR.pickOptional;
    $<HTMLInputElement>('fire-search').placeholder = STR.riverPlaceholder;
    $<HTMLTextAreaElement>('fire-input').placeholder = STR.firePlaceholder;
    $('btn-sound').textContent = STR.soundOff;

    $('btn-enter').addEventListener('click', () => {
      $('loader').classList.add('fade');
      $('hud').classList.remove('hidden');
      this.showHint();
      hooks.onEnter();
      $('btn-sound').textContent = STR.soundOn;
    });

    $('btn-sound').addEventListener('click', () => {
      $('btn-sound').textContent = hooks.onToggleSound() ? STR.soundOff : STR.soundOn;
    });
    $('btn-quality').addEventListener('click', () => this.setQualityLabel(hooks.onToggleQuality()));
    $('btn-solo').addEventListener('click', () => this.setSoloLabel(hooks.onToggleSolo()));
    $('btn-help').addEventListener('click', () => this.showHint());

    document.querySelectorAll<HTMLElement>('[data-tp]').forEach((b) =>
      b.addEventListener('click', () => {
        this.closeAll();
        hooks.onTeleport(b.dataset.tp as TeleportTarget);
      }),
    );
    $('btn-search').addEventListener('click', () => this.openSearch());
    $('btn-letters').addEventListener('click', () => this.openLetters());
    $('btn-ride-lantern').addEventListener('click', () => this.hooks.onRideLantern());
    $('btn-ride-leave').addEventListener('click', () => this.hooks.onRideLeave());

    // 弹窗：点遮罩或关闭按钮收起
    document.querySelectorAll<HTMLElement>('.modal').forEach((m) => {
      m.addEventListener('pointerdown', (e) => {
        if (e.target === m) this.closeModals();
      });
      m.querySelector('[data-close]')?.addEventListener('click', () => this.closeModals());
    });
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        // 先收起弹窗，再离开小院
        if (this.modalOpen) this.closeModals();
        else this.closeDetail();
      }
    });

    // 宠物的小院
    $('detail-close').addEventListener('click', () => this.closeDetail());
    $('btn-leave').addEventListener('click', () => this.closeDetail());
    document.querySelectorAll<HTMLElement>('[data-offer]').forEach((b) =>
      b.addEventListener('click', () => this.offer(b.dataset.offer as OfferKind)),
    );
    $('btn-rite-letters').addEventListener('click', () => this.openLetters(this.pet));

    // 信：写一封
    $('post-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const input = $<HTMLTextAreaElement>('post-input');
      const text = input.value.trim();
      if (!text) return;
      const pet = this.ritePet.post;
      if (pet) store.addLetter(pet, text);
      else store.addGuestbook(text);
      input.value = '';
      const here = pet !== null && pet === this.pet;
      // 在它的小院里写的：收起弹窗，让访客看到信落在石阶上；别的时候收起写信的那一块，新写的这封排在最前面
      if (here) this.closeModals();
      else {
        this.showCompose(false);
        this.renderLetters();
        $('letters-list').scrollTop = 0;
      }
      this.renderCounts();
      hooks.onLetter(pet, here);
      this.toast(pet ? STR.giftToast.letter(pet.name) : STR.letterToast);
    });
    $('letters-all').addEventListener('click', () => this.openLetters());
    $('letters-pet').addEventListener('click', () => this.setOnlyMine(false));
    $('letters-mine').addEventListener('click', () => this.setOnlyMine(true));
    $('post-open').addEventListener('click', () => this.showCompose($('post-form').classList.contains('hidden')));

    // 河灯与烧信
    for (const kind of ['river', 'fire'] as const) {
      $(`btn-rite-${kind}`).addEventListener('click', () => {
        if (this.pet) hooks.onRite(kind, this.pet);
      });
    }
    for (const kind of ['river', 'fire', 'lantern', 'post'] as const) {
      $(`${kind}-search`).addEventListener('input', () => this.renderRitePicker(kind));
      $(`${kind}-change`).addEventListener('click', () => this.chooseRitePet(kind, null));
    }
    $('river-go').addEventListener('click', () => {
      const pet = this.ritePet.river;
      this.closeModals();
      hooks.onRiverLantern(pet);
      this.toast(pet ? STR.riverToast(pet.name) : STR.riverToastPlain);
    });
    $('fire-input').addEventListener('input', () => this.updateRiteGo());
    $('fire-go').addEventListener('click', () => {
      const pet = this.ritePet.fire;
      const input = $<HTMLTextAreaElement>('fire-input');
      if (!pet || !input.value.trim()) return;
      // 信的内容到这里为止，不保存也不外传
      input.value = '';
      this.closeModals();
      hooks.onBurnLetter(pet);
      this.toast(STR.fireToast(pet.name));
    });

    // 孔明灯
    $('lantern-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const input = $<HTMLInputElement>('lantern-input');
      // 写了字就用这句话；没写但选了宠物，就写它的名字；都没有，用默认的那一句
      const text = input.value.trim() || this.ritePet.lantern?.name || STR.lanternDefault;
      input.value = '';
      this.closeModals();
      hooks.onLantern(text);
      this.toast(STR.lanternToast);
    });

    // 搜索
    $('search-input').addEventListener('input', () => this.renderSearch());
  }

  // ---------- 加载 ----------

  setProgress(ratio: number, label: string) {
    $('progress').style.width = `${Math.round(ratio * 100)}%`;
    $('load-step').textContent = label;
  }

  ready() {
    $('load-step').textContent = '';
    document.querySelector('#loader .bar')?.classList.add('hidden');
    $('btn-enter').classList.remove('hidden');
  }

  setSoloLabel(solo: boolean) {
    $('btn-solo').textContent = solo ? STR.soloOn : STR.soloOff;
  }

  setQualityLabel(q: 'high' | 'low') {
    $('btn-quality').textContent = q === 'high' ? STR.qualityHigh : STR.qualityLow;
  }

  // ---------- 提示 ----------

  showHint() {
    const el = $('hint');
    el.textContent = this.isTouch ? STR.hintTouch : STR.hintDesktop;
    el.classList.add('show');
    clearTimeout(this.hintTimer);
    this.hintTimer = window.setTimeout(() => el.classList.remove('show'), 8000);
  }

  /** 底部淡入淡出的一行小字，不打断走动 */
  whisper(text: string) {
    const el = $('hint');
    el.textContent = text;
    el.classList.add('show');
    clearTimeout(this.hintTimer);
    this.hintTimer = window.setTimeout(() => el.classList.remove('show'), 7000);
  }

  toast(text: string) {
    const el = $('toast');
    el.textContent = text;
    el.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => el.classList.remove('show'), 3200);
  }

  setTooltip(text: string | null, x = 0, y = 0) {
    if (!text) {
      this.tooltip.classList.remove('show');
      return;
    }
    this.tooltip.textContent = text;
    this.tooltip.style.left = `${x}px`;
    this.tooltip.style.top = `${y}px`;
    this.tooltip.classList.add('show');
  }

  // ---------- 面板状态 ----------

  get detailOpen() {
    return this.pet !== null;
  }

  /** 资料面板在桌面端占据的宽度，用来把画面主体让到左边 */
  get detailWidth() {
    return this.pet && window.innerWidth > 640 ? $('detail').offsetWidth : 0;
  }

  private get modalOpen() {
    return document.querySelector('.modal.open') !== null;
  }

  /** 只有弹窗会暂停走动；在小院里（资料面板开着）照常可以走 */
  private notify() {
    this.hooks.onBlockingChange(this.modalOpen);
  }

  /** 进出小院时把画面暗下去 / 亮起来 */
  /** 船开了 / 下船：底部换成（换回）船上的按钮 */
  setRiding(on: boolean) {
    document.body.classList.toggle('in-ride', on);
    if (!on) $('hint').classList.remove('show');
  }

  veil(on: boolean) {
    $('fade').classList.toggle('on', on);
  }

  private openModal(id: string, focusId?: string) {
    this.closeModals();
    $(id).classList.add('open');
    if (focusId && !this.isTouch) setTimeout(() => $(focusId).focus(), 60);
    this.notify();
  }

  closeModals() {
    document.querySelectorAll('.modal.open').forEach((m) => m.classList.remove('open'));
    (document.activeElement as HTMLElement | null)?.blur?.();
    this.notify();
  }

  closeAll() {
    this.closeModals();
    this.closeDetail();
  }

  // ---------- 宠物详情 ----------

  openDetail(pet: Pet) {
    this.closeModals();
    this.pet = pet;
    $('detail-name').textContent = pet.name;
    $('detail-meta').textContent = [STR.species[pet.species], pet.breed].filter(Boolean).join(' · ');
    $('detail-address').textContent = STR.address(pet.floor, pet.section, pet.cell);
    $('detail-dates').textContent = `${pet.birthDate ?? '?'} — ${pet.passedDate}`;
    $('detail-message').textContent = pet.message;
    this.renderCounts();
    $('detail').classList.add('open');
    $('detail').scrollTop = 0;
    document.body.classList.add('in-shrine');
    // 操作提示只在第一次走进小院时出现
    if (!this.shrineHinted) {
      this.shrineHinted = true;
      const el = $('hint');
      el.textContent = this.isTouch ? STR.shrineHintTouch : STR.shrineHint;
      el.classList.add('show');
      clearTimeout(this.hintTimer);
      this.hintTimer = window.setTimeout(() => el.classList.remove('show'), 6000);
    }
    this.notify();
  }

  closeDetail() {
    if (!this.pet) return;
    this.pet = null;
    $('detail').classList.remove('open');
    document.body.classList.remove('in-shrine');
    $('hint').classList.remove('show');
    (document.activeElement as HTMLElement | null)?.blur?.();
    this.hooks.onDetailClosed();
    this.notify();
  }

  /**
   * 打开信的弹窗：读树上所有的信，也可以写一封。
   * 传了 pet 就只看写给它的，写的时候也已经选好了它；write 是打开后直接开始写。
   */
  openLetters(pet: Pet | null = null, write = false) {
    this.lettersPet = pet;
    this.onlyMine = false;
    $('letters-title').textContent = pet ? STR.letterTitle(pet.name) : STR.lettersTitle;
    $('letters-desc').classList.toggle('hidden', !!pet);
    $('letters-pet').classList.toggle('hidden', !pet);
    if (pet) $('letters-pet').textContent = STR.letterTo(pet.name);
    $<HTMLTextAreaElement>('post-input').value = '';
    this.chooseRitePet('post', pet);
    // 打开先看到的是大家的信；写信的那一块收着，要写的时候才展开
    this.showCompose(write);
    this.renderLetters();
    this.openModal('modal-letters', write ? 'post-input' : undefined);
    $('letters-list').scrollTop = 0;
  }

  private setOnlyMine(on: boolean) {
    this.onlyMine = on;
    this.renderLetters();
    $('letters-list').scrollTop = 0;
  }

  private showCompose(on: boolean) {
    $('post-form').classList.toggle('hidden', !on);
    $('post-open').classList.toggle('on', on);
    if (on && !this.isTouch) setTimeout(() => $('post-input').focus(), 60);
  }

  /** 宠物的小头像：有真实照片的用照片，没有的用占位画像 */
  private avatarOf(pet: Pet) {
    if (pet.photoUrl) return pet.photoUrl;
    let url = this.avatars.get(pet.id);
    if (!url) this.avatars.set(pet.id, (url = portraitDataURL(pet, 96)));
    return url;
  }

  /** 在小院里点石阶上的信：看写给这只宠物的 */
  openPetLetters() {
    if (this.pet) this.openLetters(this.pet);
  }

  private offer(kind: OfferKind) {
    const pet = this.pet;
    if (!pet) return;
    if (kind === 'letter') {
      this.openLetters(pet, true);
      return;
    }
    store.addGift(pet, kind);
    this.renderCounts();
    this.hooks.onOffering(pet, kind);
    this.toast(STR.giftToast[kind](pet.name));
  }

  /** 礼物栏每个图标右上角的数量 */
  private renderCounts() {
    if (!this.pet) return;
    const c = store.counts(this.pet);
    document.querySelectorAll<HTMLElement>('[data-offer]').forEach((b) => {
      const n = c[b.dataset.offer as OfferKind];
      b.querySelector('b')!.textContent = n ? String(n) : '';
    });
  }

  private renderLetters() {
    const list = $('letters-list');
    list.replaceChildren();
    const pet = this.lettersPet;
    $('letters-all').classList.toggle('on', !pet && !this.onlyMine);
    $('letters-pet').classList.toggle('on', !!pet && !this.onlyMine);
    $('letters-mine').classList.toggle('on', this.onlyMine);
    const items = store.feed(pet ?? undefined).filter((l) => !this.onlyMine || l.mine);
    if (!items.length) {
      const li = document.createElement('li');
      li.className = 'empty';
      li.textContent = STR.letterEmpty;
      list.append(li);
      return;
    }
    for (const item of items) list.append(this.letterItem(item));
  }

  /** 列表里的一封信：正文、写给谁、爱心、回的话、举报 */
  private letterItem(item: Letter) {
    const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = '') => {
      const e = document.createElement(tag);
      if (cls) e.className = cls;
      if (text) e.textContent = text;
      return e;
    };
    const li = el('li');
    // 头：它的头像和名字（没有写给某一只的，是一个爪印）、什么时候写的，右边可以去它的小院
    const pet = item.petId ? petById.get(item.petId) : undefined;
    const head = el('div', 'head');
    if (pet) {
      const img = el('img', 'avatar');
      img.src = this.avatarOf(pet);
      img.alt = '';
      head.append(img);
    } else {
      const paw = el('span', 'avatar paw');
      paw.innerHTML = PAW_SVG;
      head.append(paw);
    }
    const who = el('div', 'who');
    who.append(el('b', '', pet ? STR.letterTo(pet.name) : STR.letterToAll));
    const when = [timeLabel(item.time), item.mine ? STR.letterMine : ''].filter(Boolean).join(' · ');
    if (when) who.append(el('small', '', when));
    head.append(who);
    // 已经在看写给它的信（多半就在它的小院里），就不用再去了
    if (pet && pet !== this.lettersPet) {
      const visit = el('button', 'visit', STR.letterVisit(pet.name));
      visit.type = 'button';
      visit.addEventListener('click', () => {
        this.closeModals();
        this.hooks.onGoto(pet);
      });
      head.append(visit);
    }
    li.append(head, el('div', 'text', item.text));

    const acts = el('div', 'acts');
    // 爱心：再点一次收回
    const heart = el('button', 'heart');
    heart.type = 'button';
    heart.setAttribute('aria-label', STR.letterHeart);
    let { hearts, hearted } = item;
    const drawHeart = () => {
      heart.textContent = hearts ? `♥ ${hearts}` : '♥';
      heart.classList.toggle('on', hearted);
      heart.setAttribute('aria-pressed', String(hearted));
    };
    heart.addEventListener('click', () => {
      hearted = store.toggleHeart(item.id);
      hearts += hearted ? 1 : -1;
      drawHeart();
    });
    drawHeart();

    // 回的话：只有一层，点开才显示
    const thread = el('div', 'thread hidden');
    const replies = el('ul', 'replies');
    let count = item.replies.length;
    const addReply = (text: string, time: number) => {
      const r = el('li', '', text);
      const when = timeLabel(time);
      if (when) r.append(el('small', '', when));
      replies.append(r);
    };
    for (const r of item.replies) addReply(r.text, r.time);
    const toggle = el('button');
    toggle.type = 'button';
    const drawToggle = () => (toggle.textContent = count ? STR.letterReplies(count) : STR.letterReply);
    drawToggle();
    const form = el('form');
    const input = el('input');
    input.maxLength = 120;
    input.autocomplete = 'off';
    input.placeholder = STR.replyPlaceholder;
    const send = el('button', 'primary', STR.replySend);
    form.append(input, send);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const text = input.value.trim();
      if (!text) return;
      store.addReply(item.id, text);
      addReply(text, Date.now());
      input.value = '';
      count++;
      drawToggle();
    });
    toggle.addEventListener('click', () => {
      const open = thread.classList.toggle('hidden') === false;
      if (open && !this.isTouch) input.focus();
    });
    thread.append(replies, form);
    acts.append(heart, toggle);

    // 举报：自己写的不用举报
    if (!item.mine) {
      const report = el('button', 'report', STR.letterReport);
      report.type = 'button';
      report.addEventListener('click', () => {
        store.report(item.id);
        li.remove();
        this.toast(STR.reportToast);
      });
      acts.append(report);
    }
    li.append(acts, thread);
    return li;
  }

  // ---------- 搜索 ----------

  openSearch() {
    $<HTMLInputElement>('search-input').value = '';
    this.renderSearch();
    this.openModal('modal-search', 'search-input');
  }

  private renderSearch() {
    const q = $<HTMLInputElement>('search-input').value;
    const list = $('search-results');
    list.replaceChildren();
    const found = this.findPets(q);
    if (!found.length) {
      const li = document.createElement('li');
      li.className = 'empty';
      li.textContent = STR.searchEmpty;
      list.append(li);
      return;
    }
    for (const p of found) {
      const li = document.createElement('li');
      const info = this.petInfo(p);
      const guide = document.createElement('button');
      guide.textContent = STR.searchGuide;
      guide.addEventListener('click', () => {
        this.closeModals();
        this.hooks.onGuide(p);
      });
      const go = document.createElement('button');
      go.className = 'primary';
      go.textContent = STR.searchGoto;
      go.addEventListener('click', () => {
        this.closeModals();
        this.hooks.onGoto(p);
      });
      li.append(info, guide, go);
      list.append(li);
    }
  }

  // ---------- 河灯与烧信 ----------

  /**
   * 打开放河灯 / 烧信的弹窗。烧信要先选一只宠物；河灯可以不选。
   * 从单宠物视角过来时已经选好了宠物。
   */
  openRite(kind: RiteKind, pet: Pet | null = null) {
    $<HTMLInputElement>(`${kind}-search`).value = '';
    if (kind === 'fire') $<HTMLTextAreaElement>('fire-input').value = '';
    this.chooseRitePet(kind, pet);
    this.openModal(`modal-${kind}`, kind === 'fire' ? (pet ? 'fire-input' : 'fire-search') : undefined);
  }

  /** 打开放孔明灯的弹窗：写一句话，也可以选一只宠物 */
  openLantern() {
    $<HTMLInputElement>('lantern-input').value = '';
    $<HTMLInputElement>('lantern-search').value = '';
    this.chooseRitePet('lantern', null);
    this.openModal('modal-lantern', 'lantern-input');
  }

  private chooseRitePet(kind: PickKind, pet: Pet | null) {
    this.ritePet[kind] = pet;
    $(`${kind}-chosen`).classList.toggle('hidden', !pet);
    $(`${kind}-picker`).classList.toggle('hidden', !!pet);
    const chosen = { river: STR.riverFor, fire: STR.fireFor, lantern: STR.lanternFor, post: STR.letterFor }[kind];
    if (pet) $(`${kind}-chosen-name`).textContent = chosen(pet.name);
    else {
      $<HTMLInputElement>(`${kind}-search`).value = '';
      this.renderRitePicker(kind);
    }
    if (kind === 'fire') this.updateRiteGo();
  }

  /** 烧信要选好了宠物、写了内容才能确认 */
  private updateRiteGo() {
    const written = $<HTMLTextAreaElement>('fire-input').value.trim().length > 0;
    $<HTMLButtonElement>('fire-go').disabled = !this.ritePet.fire || !written;
  }

  private renderRitePicker(kind: PickKind) {
    const q = $<HTMLInputElement>(`${kind}-search`).value;
    const list = $(`${kind}-results`);
    list.replaceChildren();
    // 选宠物是可选的时候，没输入就不列出来，弹窗保持简短
    if (kind !== 'fire' && !q.trim()) return;
    const found = this.findPets(q);
    if (!found.length) {
      const li = document.createElement('li');
      li.className = 'empty';
      li.textContent = STR.searchEmpty;
      list.append(li);
      return;
    }
    for (const p of found) {
      const li = document.createElement('li');
      const pick = document.createElement('button');
      pick.type = 'button';
      pick.className = 'primary';
      pick.textContent = STR.riverPick;
      pick.addEventListener('click', () => this.chooseRitePet(kind, p));
      li.append(this.petInfo(p), pick);
      list.append(li);
    }
  }

  /**
   * 按名字、物种、品种查找，不区分大小写、不计空格。
   * 输入的正好是一个区（"a" 或 "section a"）时，这个区的宠物排在前面。
   */
  private findPets(query: string) {
    const norm = (t: string) => t.toLowerCase().replace(/\s/g, '');
    const q = norm(query);
    if (!q) return PETS.slice(0, 30);
    const section = SECTIONS.find((s) => q === norm(s) || q === norm(STR.sectionName(s)));
    const inSection = PETS.filter((p) => p.section === section);
    const byText = PETS.filter(
      (p) =>
        p.section !== section &&
        (norm(p.name).includes(q) || norm(STR.species[p.species]).includes(q) || norm(p.breed ?? '').includes(q)),
    );
    return [...inSection, ...byText].slice(0, 30);
  }

  private petInfo(p: Pet) {
    const info = document.createElement('div');
    info.className = 'info';
    const b = document.createElement('b');
    b.textContent = p.name;
    // 品种一行、地址一行，窄屏上也不会折得很碎
    const breed = document.createElement('small');
    breed.textContent = p.breed ?? STR.species[p.species];
    const address = document.createElement('small');
    address.textContent = STR.address(p.floor, p.section, p.cell);
    info.append(b, breed, address);
    return info;
  }

  // ---------- 触屏摇杆 ----------

  /**
   * 触屏摇杆：手指按在屏幕左侧任意位置，摇杆就出现在手指下面，松手回到左下角。
   * 没有拖动的轻点会转交给 onTap（等同于点了场景里的那个位置）。
   */
  bindJoystick(onMove: (x: number, y: number) => void, onTap: (x: number, y: number) => void) {
    const zone = $('stick-zone');
    const base = $('joystick');
    const stick = $('stick');
    const R = 56;
    let id = -1;
    let origin = { x: 0, y: 0, t: 0 };
    let dragging = false;
    zone.addEventListener('pointerdown', (e) => {
      if (id !== -1) return;
      id = e.pointerId;
      origin = { x: e.clientX, y: e.clientY, t: performance.now() };
      dragging = false;
      zone.setPointerCapture(id);
    });
    zone.addEventListener('pointermove', (e) => {
      if (e.pointerId !== id) return;
      let x = e.clientX - origin.x;
      let y = e.clientY - origin.y;
      if (!dragging) {
        if (Math.hypot(x, y) < 8) return;
        dragging = true;
        base.classList.add('active');
        base.style.left = `${origin.x - R}px`;
        base.style.top = `${origin.y - R}px`;
        base.style.bottom = 'auto';
      }
      x /= R;
      y /= R;
      const len = Math.hypot(x, y);
      if (len > 1) {
        x /= len;
        y /= len;
      }
      stick.style.transform = `translate(${x * 34}px, ${y * 34}px)`;
      onMove(x, -y);
    });
    const end = (e: PointerEvent) => {
      if (e.pointerId !== id) return;
      id = -1;
      if (!dragging && e.type === 'pointerup' && performance.now() - origin.t < 500) onTap(e.clientX, e.clientY);
      dragging = false;
      base.classList.remove('active');
      base.style.left = base.style.top = base.style.bottom = '';
      stick.style.transform = '';
      onMove(0, 0);
    };
    zone.addEventListener('pointerup', end);
    zone.addEventListener('pointercancel', end);
  }
}
