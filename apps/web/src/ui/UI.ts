import { albumOf, petById, PETS, SECTIONS, type Pet } from '../data/pets';
import { ApiError } from '../api/client';
import { prefs, store, type Letter, type OfferKind, type RiteKind } from '../data/store';
import { tributes } from '../data/tributes';
import { applyLocaleStyle, STR } from '../i18n';
import { portraitDataURL } from '../world/textures';
import { MemorialEditor } from './MemorialEditor';
import { makeShareCard } from './share-card';

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
  /** 访客往它的纪念角里放了一件礼物（数据已保存） */
  onOffering(pet: Pet, kind: OfferKind): void;
  /** 在单宠物视角里选择为它放河灯 / 烧信：把访客带到码头 / 篝火旁 */
  onRite(kind: RiteKind, pet: Pet): void;
  /** 访客在码头放下了一盏河灯；pet 是写在灯上的那只宠物，没有选就是 null */
  onRiverLantern(pet: Pet | null): void;
  /** 访客把写给这只宠物的信投进了篝火（信的内容不保存，所以这里不传） */
  onBurnLetter(pet: Pet): void;
  /**
   * 访客写了一封信（数据已保存）：树上多一块木牌。pet 是写给谁的，没有选就是 null；
   * here 是访客此刻正开着这只宠物的纪念角（信会落在台面上）
   */
  onLetter(pet: Pet | null, here: boolean): void;
  /**
   * 这只宠物收到的礼物或信变了，而且不是访客刚放下的那一下
   * （从服务器读到了最新的，或者刚放的没存上被拿掉了）：把相框下面和纪念角里摆的东西重摆一遍
   */
  onTributesChanged(pet: Pet): void;
  /** 渲染一帧并交出 3D 画布，用来画分享图；必须马上画下来，下一帧就没了 */
  onCapture?(): HTMLCanvasElement | null;
  onGoto(pet: Pet): void;
  /** 坐在船上时点「放河灯」 */
  onRideLantern(): void;
  /** 中途下船 */
  onRideLeave(): void;
  /** 有面板打开时需要暂停走动 */
  onBlockingChange(blocked: boolean): void;
  /** API 在线时可创建真实纪念宠物 */
  memorialApiEnabled?: boolean;
  onMemorialSaved?(petId?: string, mode?: 'create' | 'edit' | 'delete'): void | Promise<void>;
}

/** 进来多久之后，才问还没有宠物的访客要不要给自己的宠物留个位置 */
const INVITE_DELAY = 40_000;

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
  /** 当前这只宠物的照片：第 0 张是主照片；thumb 是缩略图，full 是点开后的大图（用到才画） */
  private shots: Array<{ thumb: string; full: () => string }> = [];
  private shot = 0;
  private ritePet: Record<PickKind, Pet | null> = { river: null, fire: null, lantern: null, post: null };
  /** 信的弹窗现在只看写给哪一只的；null 是看全部 */
  private lettersPet: Pet | null = null;
  /** 信的弹窗里只看自己写的 */
  private onlyMine = false;
  /** 信的列表里用过的头像，画一次就留着 */
  private avatars = new Map<string, string>();
  private tooltip = $('tooltip');
  private memorialEditor: MemorialEditor;
  private editorReturnFocus: HTMLElement | null = null;
  /** 分享弹窗现在说的是哪一只 */
  private sharePet: Pet | null = null;
  private inviteTimer = 0;

  constructor(private hooks: UIHooks) {
    document.body.classList.toggle('touch', this.isTouch);
    this.memorialEditor = new MemorialEditor($('memorial-card'), {
      onSaved: async (petId, mode) => {
        this.closeModals();
        this.toast(mode === 'create' ? STR.memorialCreated : STR.memorialUpdated);
        await hooks.onMemorialSaved?.(petId, mode);
      },
      onDeleted: async () => {
        this.closeDetail();
        this.toast(STR.memorialDeleted);
        await hooks.onMemorialSaved?.(undefined, 'delete');
      },
    });

    // 静态文案
    applyLocaleStyle();
    document.querySelectorAll<HTMLElement>('[data-t]').forEach((el) => {
      const v = (STR as Record<string, unknown>)[el.dataset.t!];
      if (typeof v === 'string') el.textContent = v;
    });
    $<HTMLTextAreaElement>('post-input').placeholder = STR.letterPlaceholder;
    $<HTMLInputElement>('post-search').placeholder = STR.pickOptional;
    $<HTMLInputElement>('lantern-input').placeholder = STR.lanternPlaceholder;
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
      this.inviteTimer = window.setTimeout(() => this.showInvite(), INVITE_DELAY);
    });

    // 右上角：给自己的宠物留个位置、自己的宠物、收着设置的菜单
    const canCreate = !!hooks.memorialApiEnabled;
    $('btn-add-pet').classList.toggle('hidden', !canCreate);
    $('btn-add-pet').addEventListener('click', () => this.openMemorialForm());
    $('btn-my-pets').classList.toggle('hidden', !PETS.some((p) => p.canManage));
    $('btn-my-pets').addEventListener('click', () => this.openMyPets());
    const menuBtn = $('btn-menu');
    menuBtn.setAttribute('aria-label', STR.menu);
    const setMenu = (open: boolean) => {
      $('menu-pop').classList.toggle('hidden', !open);
      menuBtn.setAttribute('aria-expanded', String(open));
    };
    menuBtn.addEventListener('click', () => setMenu($('menu-pop').classList.contains('hidden')));
    // 点菜单外面收起；点菜单里的开关不收，可以连着调几项
    document.addEventListener('pointerdown', (e) => {
      const t = e.target as Node;
      if (!$('menu-pop').contains(t) && !menuBtn.contains(t)) setMenu(false);
    });
    $('invite-close').setAttribute('aria-label', STR.inviteClose);
    $('invite-close').addEventListener('click', () => this.hideInvite());
    $('invite-go').addEventListener('click', () => {
      this.hideInvite();
      this.openMemorialForm();
    });

    $('btn-sound').addEventListener('click', () => {
      $('btn-sound').textContent = hooks.onToggleSound() ? STR.soundOff : STR.soundOn;
    });
    $('btn-quality').addEventListener('click', () => this.setQualityLabel(hooks.onToggleQuality()));
    $('btn-solo').addEventListener('click', () => this.setSoloLabel(hooks.onToggleSolo()));
    $('btn-help').addEventListener('click', () => {
      setMenu(false);
      this.showHint();
    });

    document.querySelectorAll<HTMLElement>('[data-tp]').forEach((b) =>
      b.addEventListener('click', () => {
        this.closeAll();
        hooks.onTeleport(b.dataset.tp as TeleportTarget);
      }),
    );
    $('btn-create-memorial').classList.toggle('hidden', !canCreate);
    $('btn-create-memorial').addEventListener('click', () => this.openMemorialForm());
    $('btn-letters').addEventListener('click', () => this.openLetters());
    $('btn-ride-lantern').addEventListener('click', () => this.hooks.onRideLantern());
    document.getElementById('memorial-edit')?.addEventListener('click', () => {
      if (this.pet) this.openMemorialEditor(this.pet);
    });
    $('memorial-share').addEventListener('click', () => {
      if (this.pet) this.openShare(this.pet);
    });
    $('share-copy').addEventListener('click', () => void this.copyShareLink());
    $('share-send').addEventListener('click', () => void this.sendShareLink());
    $('share-image').addEventListener('click', () => void this.saveShareImage());
    $('share-url').addEventListener('focus', () => $<HTMLInputElement>('share-url').select());
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
        // 先收起弹窗，再退出单宠物视角
        if (this.modalOpen) this.closeModals();
        else this.closeDetail();
        return;
      }
      // 看大图时左右键翻照片
      if ($('modal-photos').classList.contains('open')) {
        if (e.key === 'ArrowLeft') this.stepPhoto(-1);
        else if (e.key === 'ArrowRight') this.stepPhoto(1);
        return;
      }
    });

    // 单宠物视角
    $('btn-leave').addEventListener('click', () => this.closeDetail());
    // 相册的大图：两侧的箭头、左右滑动
    $('album').setAttribute('aria-label', STR.albumLabel);
    $('photo-prev').setAttribute('aria-label', STR.photoPrev);
    $('photo-next').setAttribute('aria-label', STR.photoNext);
    $('photo-prev').addEventListener('click', () => this.stepPhoto(-1));
    $('photo-next').addEventListener('click', () => this.stepPhoto(1));
    let swipeX: number | null = null;
    $('photo-view').addEventListener('pointerdown', (e) => (swipeX = e.clientX));
    $('photo-view').addEventListener('pointerup', (e) => {
      const dx = swipeX === null ? 0 : e.clientX - swipeX;
      swipeX = null;
      if (Math.abs(dx) > 40) this.stepPhoto(dx < 0 ? 1 : -1);
    });
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
      if (pet) {
        store.addLetter(pet, text).then(
          // 存好了：列表里那封换成正式的（可以拿掉了）
          () => this.lettersShowing(pet) && this.renderLetters(),
          (error) => {
            // 没存上：这封已经拿掉了，把字还给访客，数字和摆着的东西改回去
            this.tributesChanged(pet);
            if (!input.value) input.value = text;
            this.toast(error instanceof ApiError && error.code === 'letter_limit' ? STR.letterLimit : STR.letterFailed);
          },
        );
      } else store.addGuestbook(text);
      input.value = '';
      const here = pet !== null && pet === this.pet;
      // 正开着它的纪念角时写的：收起弹窗，让访客看到信落在台面上；别的时候收起写信的那一块，新写的这封排在最前面
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
  }

  // ---------- 加载 ----------

  setProgress(ratio: number, _label?: string) {
    $('progress').style.width = `${Math.round(ratio * 100)}%`;
  }

  ready() {
    $('loader').classList.add('ready');
    $('btn-enter').classList.remove('hidden');
  }

  /** 从某只宠物的链接进来时，入口按钮写「去看它」 */
  setEnterLabel(text: string) {
    $('btn-enter').textContent = text;
  }

  /** 按下入口按钮（创建、编辑之后重新载入时直接进去） */
  enter() {
    $('btn-enter').click();
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

  private get modalOpen() {
    return document.querySelector('.modal.open') !== null;
  }

  /** 只有弹窗算「挡住」；单宠物视角里小人本来就站着不动，点击另有处理 */
  private notify() {
    this.hooks.onBlockingChange(this.modalOpen);
  }

  /** 船开了 / 下船：底部换成（换回）船上的按钮 */
  setRiding(on: boolean) {
    document.body.classList.toggle('in-ride', on);
    if (!on) $('hint').classList.remove('show');
  }

  /** 换地方时把画面暗下去 / 亮起来 */
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
    const editorWasOpen = $('modal-memorial').classList.contains('open');
    document.querySelectorAll('.modal.open').forEach((m) => m.classList.remove('open'));
    document.querySelectorAll('#album .on').forEach((b) => b.classList.remove('on'));
    (document.activeElement as HTMLElement | null)?.blur?.();
    if (editorWasOpen && this.editorReturnFocus) {
      this.editorReturnFocus.focus();
      this.editorReturnFocus = null;
    }
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
    const dates = `${pet.birthDate ?? '?'} — ${pet.passedDate ?? '?'}`;
    $('detail-meta').textContent = [STR.species[pet.species], pet.breed, dates].filter(Boolean).join(' · ');
    $('detail-address').textContent = STR.address(pet.floor, pet.section, pet.cell);
    $('detail-message').textContent = pet.message ?? '';
    $('memorial-share').classList.toggle('hidden', !pet.isReal);
    $('memorial-edit').classList.toggle('hidden', !(pet.canManage && this.hooks.memorialApiEnabled));
    this.hideInvite();
    this.syncAddress(pet);
    this.renderCounts();
    void this.loadTributes(pet);
    this.renderAlbum(pet);
    $('detail').classList.add('open');
    document.body.classList.add('in-shrine');
    // 操作提示只在第一次打开纪念角时出现
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
    document.body.classList.remove('in-shrine', 'has-album');
    $('hint').classList.remove('show');
    (document.activeElement as HTMLElement | null)?.blur?.();
    this.syncAddress(null);
    this.hooks.onDetailClosed();
    this.notify();
  }

  /** 地址栏跟着走：开着真实宠物的纪念角时是它的专属链接，别的时候不带 */
  private syncAddress(pet: Pet | null) {
    const url = new URL(location.href);
    if (pet?.isReal) url.searchParams.set('pet', pet.id);
    else url.searchParams.delete('pet');
    if (url.href !== location.href) history.replaceState(null, '', url);
  }

  /**
   * 走进真实宠物的纪念角：向服务器读它收到的礼物和信。
   * 是自己的宠物时，顺便问一下上次来过之后别人留下了多少，告诉主人。
   */
  private async loadTributes(pet: Pet) {
    if (!pet.isReal) return;
    const since = pet.canManage ? prefs.lastSeen(pet.id) : undefined;
    const asked = Date.now();
    let fresh;
    try {
      fresh = await tributes.load(pet.id, since);
    } catch {
      // 读不到就先用照片墙带来的数量，不打扰访客
      return;
    }
    if (pet.canManage) prefs.markSeen(pet.id, asked);
    this.tributesChanged(pet);
    if (fresh && this.pet === pet) {
      const n = fresh.flower + fresh.candle + fresh.snack + fresh.toy + fresh.letter;
      if (n > 0) this.toast(STR.awayToast(pet.name, n));
    }
  }

  /** 信的弹窗是不是正开着、而且看得到写给这只宠物的信 */
  private lettersShowing(pet: Pet) {
    return $('modal-letters').classList.contains('open') && (this.lettersPet === null || this.lettersPet === pet);
  }

  /** 这只宠物的礼物或信变了：数字、信的列表、场景里摆的东西都跟上 */
  private tributesChanged(pet: Pet) {
    if (this.pet === pet) this.renderCounts();
    if (this.lettersShowing(pet)) this.renderLetters();
    this.hooks.onTributesChanged(pet);
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

  /** 右侧那一列缩略图：主照片加相册里的几张；只有一张照片的不显示 */
  private renderAlbum(pet: Pet) {
    const make = (url: string | undefined, variant: number) => {
      let big = url;
      return { thumb: url ?? portraitDataURL(pet, 144, variant), full: () => (big ??= portraitDataURL(pet, 900, variant)) };
    };
    this.shots = [make(pet.photoUrl, 0), ...albumOf(pet).map((s) => make(s.url, s.variant))];
    const strip = $('album');
    strip.replaceChildren();
    strip.scrollTop = 0;
    const many = this.shots.length > 1;
    document.body.classList.toggle('has-album', many);
    if (!many) return;
    this.shots.forEach((s, i) => {
      const b = document.createElement('button');
      b.setAttribute('aria-label', STR.photoOf(i + 1, this.shots.length));
      const img = document.createElement('img');
      img.src = s.thumb;
      img.alt = '';
      img.loading = 'lazy';
      img.draggable = false;
      b.append(img);
      b.addEventListener('click', () => this.openPhoto(i));
      strip.append(b);
    });
  }

  private openPhoto(i: number) {
    this.showPhoto(i);
    this.openModal('modal-photos');
  }

  private stepPhoto(dir: number) {
    const n = this.shots.length;
    if (n) this.showPhoto((this.shot + dir + n) % n);
  }

  private showPhoto(i: number) {
    const n = this.shots.length;
    this.shot = i;
    $<HTMLImageElement>('photo-view').src = this.shots[i].full();
    $<HTMLImageElement>('photo-view').alt = STR.photoOf(i + 1, n);
    $('photo-count').textContent = `${i + 1} / ${n}`;
    [...$('album').children].forEach((b, j) => b.classList.toggle('on', j === i));
    $('album').children[i]?.scrollIntoView({ block: 'nearest' });
  }

  /** 在纪念角里点那摞信：看写给这只宠物的 */
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
    // 真实宠物同一种礼物一天一次：今天放过了就直接说，不让东西先出现再消失
    if (store.givenToday(pet, kind)) {
      this.toast(STR.giftAlready[kind](pet.name));
      return;
    }
    store.addGift(pet, kind).catch((error) => {
      // 服务器没收下：这一件已经拿掉了，把数字和摆着的东西改回去
      this.tributesChanged(pet);
      this.toast(error instanceof ApiError && error.code === 'already_today' ? STR.giftAlready[kind](pet.name) : STR.giftFailed);
    });
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
    // 头：它的头像和名字（没有写给某一只的，是一个爪印）、什么时候写的，右边可以去看它
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
    // 已经在看写给它的信（多半就开着它的纪念角），就不用再去了
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

    // 保存在服务器上的信：写的人、或者这只宠物的主人可以拿掉
    if (item.removable) {
      const remove = el('button', 'report', STR.letterRemove);
      remove.type = 'button';
      remove.addEventListener('click', () => {
        remove.disabled = true;
        store.removeLetter(item).then(
          () => {
            li.remove();
            this.toast(STR.letterRemoved);
            if (pet) this.tributesChanged(pet);
          },
          () => {
            remove.disabled = false;
            this.toast(STR.letterFailed);
          },
        );
      });
      acts.append(remove);
    }

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

  // ---------- 我的宠物 ----------

  /** 这台浏览器创建的宠物：直接去；还没有的时候只有一句话和创建按钮 */
  openMyPets() {
    const pets = PETS.filter((pet) => pet.canManage);
    $('my-pets-empty').classList.toggle('hidden', pets.length > 0);
    const list = $('your-results');
    list.replaceChildren();
    for (const p of pets) {
      const li = document.createElement('li');
      const go = document.createElement('button');
      go.type = 'button';
      go.className = 'primary';
      go.textContent = STR.searchGoto;
      go.addEventListener('click', () => {
        this.closeModals();
        this.hooks.onGoto(p);
      });
      li.append(this.petInfo(p), go);
      list.append(li);
    }
    this.openModal('modal-search');
  }

  /** 大厅前台：有自己的宠物就列出来，没有就直接开始创建（创建不了时也列出来，那里有一句说明） */
  openReception() {
    if (!PETS.some((pet) => pet.canManage) && this.hooks.memorialApiEnabled) this.openMemorialForm();
    else this.openMyPets();
  }

  // ---------- 创建提示 ----------

  /**
   * 进来一会儿之后出现一次的小卡片：这里也可以放你的宠物。
   * 只给还没有宠物、也没见过这张卡片的访客；正在看纪念角、开着弹窗、坐着船时不出来打扰（这一次就不出了）。
   */
  private showInvite() {
    if (!this.hooks.memorialApiEnabled || prefs.inviteSeen || PETS.some((pet) => pet.canManage)) return;
    if (this.pet || this.modalOpen || document.body.classList.contains('in-ride')) return;
    prefs.inviteSeen = true;
    $('invite-card').classList.remove('hidden');
  }

  private hideInvite() {
    clearTimeout(this.inviteTimer);
    $('invite-card').classList.add('hidden');
  }

  // ---------- 分享 ----------

  private shareUrl(pet: Pet) {
    return `${location.origin}/?pet=${pet.id}`;
  }

  /** 打开分享弹窗；created 是刚创建完的那一次，标题和说明不一样，多一行可以随时修改的提示 */
  openShare(pet: Pet, created = false) {
    this.sharePet = pet;
    $('share-title').textContent = created ? STR.shareCreatedTitle(pet.name) : STR.shareTitle(pet.name);
    $('share-desc').textContent = created ? STR.shareCreatedDesc : STR.shareDesc;
    $<HTMLInputElement>('share-url').value = this.shareUrl(pet);
    const note = $('share-note');
    note.textContent = created ? STR.memorialEditor.editHint : '';
    note.classList.toggle('hidden', !created);
    this.openModal('modal-share');
  }

  private async copyShareLink() {
    const pet = this.sharePet;
    if (!pet) return;
    const input = $<HTMLInputElement>('share-url');
    try {
      await navigator.clipboard.writeText(this.shareUrl(pet));
    } catch {
      // 不让用剪贴板的环境：选中链接，访客可以自己复制
      input.focus();
      input.select();
      if (!document.execCommand?.('copy')) return;
    }
    this.toast(STR.shareCopied);
  }

  /** 交给系统的分享面板；没有的（多数桌面浏览器）就复制链接 */
  private async sendShareLink() {
    const pet = this.sharePet;
    if (!pet) return;
    if (!navigator.share) return this.copyShareLink();
    try {
      await navigator.share({ title: pet.name, text: STR.shareText(pet.name), url: this.shareUrl(pet) });
    } catch (error) {
      // 访客自己关掉了面板不算失败
      if ((error as DOMException)?.name !== 'AbortError') await this.copyShareLink();
    }
  }

  /** 存一张图：它的纪念角，加上名字和来这里的地址 */
  private async saveShareImage() {
    const pet = this.sharePet;
    if (!pet) return;
    const button = $<HTMLButtonElement>('share-image');
    button.disabled = true;
    try {
      // 画的是开着的这个纪念角；分享的不是眼前这只时，不拿眼前的画面充数
      const scene = this.pet === pet ? (this.hooks.onCapture?.() ?? null) : null;
      const blob = await makeShareCard(pet, scene, location.host);
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `${pet.name.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '') || 'memorial'}.png`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(link.href), 10_000);
      this.toast(STR.shareImageSaved);
    } catch {
      this.toast(STR.shareImageFailed);
    } finally {
      button.disabled = false;
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

  openMemorialForm() {
    this.editorReturnFocus = document.activeElement as HTMLElement | null;
    this.memorialEditor.openCreate();
    this.openModal('modal-memorial', 'memorial-name');
  }

  private openMemorialEditor(pet: Pet) {
    this.editorReturnFocus = document.activeElement as HTMLElement | null;
    this.memorialEditor.openEdit(pet);
    this.openModal('modal-memorial', 'memorial-name');
  }
}
