import { PETS, type Pet } from '../data/pets';
import { store, type Message, type OfferKind, type RiteKind } from '../data/store';
import { STR } from '../strings';

export type TeleportTarget = 'gate' | 'river' | 'fire' | 'hall' | 'memorial';

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
  /** 访客往格子里放了一件礼物或一封信（数据已保存） */
  onOffering(pet: Pet, kind: OfferKind): void;
  /** 在单宠物视角里切换到旁边的宠物：-1 上一只，1 下一只 */
  onStep(dir: -1 | 1): void;
  /** 在单宠物视角里选择为它放河灯 / 烧信：把访客带到码头 / 篝火旁 */
  onRite(kind: RiteKind, pet: Pet): void;
  /** 访客在码头放下了一盏写着这只宠物名字的河灯 */
  onRiverLantern(pet: Pet): void;
  /** 访客把写给这只宠物的信投进了篝火（信的内容不保存，所以这里不传） */
  onBurnLetter(pet: Pet): void;
  onGuide(pet: Pet): void;
  onGoto(pet: Pet): void;
  /** 有面板打开时需要暂停走动 */
  onBlockingChange(blocked: boolean): void;
}

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

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
  private ritePet: Record<RiteKind, Pet | null> = { river: null, fire: null };
  private tooltip = $('tooltip');

  constructor(private hooks: UIHooks) {
    document.body.classList.toggle('touch', this.isTouch);

    // 静态文案
    document.querySelectorAll<HTMLElement>('[data-t]').forEach((el) => {
      const v = (STR as Record<string, unknown>)[el.dataset.t!];
      if (typeof v === 'string') el.textContent = v;
    });
    $<HTMLTextAreaElement>('letter-input').placeholder = STR.letterPlaceholder;
    $<HTMLInputElement>('lantern-input').placeholder = STR.lanternPlaceholder;
    $<HTMLInputElement>('guestbook-input').placeholder = STR.guestbookPlaceholder;
    $<HTMLInputElement>('search-input').placeholder = STR.searchPlaceholder;
    $<HTMLInputElement>('river-search').placeholder = STR.riverPlaceholder;
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
    $('btn-lantern').addEventListener('click', () => this.openModal('modal-lantern', 'lantern-input'));
    $('btn-search').addEventListener('click', () => this.openSearch());

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
      const el = e.target as HTMLElement | null;
      const typing = el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA');
      if (!this.pet || this.modalOpen || typing) return;
      if (e.key === 'ArrowLeft') hooks.onStep(-1);
      else if (e.key === 'ArrowRight') hooks.onStep(1);
    });

    // 单宠物视角
    $('detail-close').addEventListener('click', () => this.closeDetail());
    $('shrine-prev').setAttribute('aria-label', STR.shrinePrev);
    $('shrine-next').setAttribute('aria-label', STR.shrineNext);
    $('shrine-prev').addEventListener('click', () => hooks.onStep(-1));
    $('shrine-next').addEventListener('click', () => hooks.onStep(1));
    document.querySelectorAll<HTMLElement>('[data-offer]').forEach((b) =>
      b.addEventListener('click', () => this.offer(b.dataset.offer as OfferKind)),
    );
    $('letter-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const input = $<HTMLTextAreaElement>('letter-input');
      const text = input.value.trim();
      const pet = this.pet;
      if (!text || !pet) return;
      store.addLetter(pet, text);
      input.value = '';
      // 收起弹窗，让访客看到信落在台面上
      this.closeModals();
      this.renderCounts();
      hooks.onOffering(pet, 'letter');
      this.toast(STR.giftToast.letter(pet.name));
    });

    // 河灯与烧信
    for (const kind of ['river', 'fire'] as const) {
      $(`btn-rite-${kind}`).addEventListener('click', () => {
        if (this.pet) hooks.onRite(kind, this.pet);
      });
      $(`${kind}-search`).addEventListener('input', () => this.renderRitePicker(kind));
      $(`${kind}-change`).addEventListener('click', () => this.chooseRitePet(kind, null));
    }
    $('river-go').addEventListener('click', () => {
      const pet = this.ritePet.river;
      if (!pet) return;
      this.closeModals();
      hooks.onRiverLantern(pet);
      this.toast(STR.riverToast(pet.name));
    });
    $('fire-input').addEventListener('input', () => this.updateRiteGo('fire'));
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
      const text = input.value.trim() || STR.lanternDefault;
      input.value = '';
      this.closeModals();
      hooks.onLantern(text);
      this.toast(STR.lanternToast);
    });

    // 留言簿
    $('guestbook-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const input = $<HTMLInputElement>('guestbook-input');
      const text = input.value.trim();
      if (!text) return;
      store.addGuestbook(text);
      input.value = '';
      this.renderGuestbook();
      this.toast(STR.commentToast);
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

  private notify() {
    this.hooks.onBlockingChange(this.detailOpen || this.modalOpen);
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
    $('detail-meta').textContent = [pet.species, pet.breed, STR.detailLocation(pet.cabinet, pet.slot + 1)]
      .filter(Boolean)
      .join(' · ');
    $('detail-dates').textContent = `${pet.birthDate ?? '?'} — ${pet.passedDate}`;
    $('detail-message').textContent = pet.message;
    this.renderCounts();
    $('detail').classList.add('open');
    $('detail').scrollTop = 0;
    document.body.classList.add('in-shrine');
    // 操作提示只在第一次打开格子时出现
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

  /** 打开这只宠物的信：可以读已有的信，也可以再写一封 */
  openLetters(write = false) {
    if (!this.pet) return;
    $('letter-title').textContent = STR.letterTitle(this.pet.name);
    this.renderMessages($('letter-list'), store.letters(this.pet), STR.letterEmpty);
    this.openModal('modal-letter', write ? 'letter-input' : undefined);
    $('letter-list').scrollTop = 0;
  }

  private offer(kind: OfferKind) {
    const pet = this.pet;
    if (!pet) return;
    if (kind === 'letter') {
      this.openLetters(true);
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

  private renderMessages(list: HTMLElement, items: Array<Message & { petName?: string }>, empty: string) {
    list.replaceChildren();
    if (!items.length) {
      const li = document.createElement('li');
      li.className = 'empty';
      li.textContent = empty;
      list.append(li);
      return;
    }
    for (const m of items) {
      const li = document.createElement('li');
      li.textContent = m.text;
      const meta = [m.petName ? `致 ${m.petName}` : '', timeLabel(m.time)].filter(Boolean).join(' · ');
      if (meta) {
        const small = document.createElement('small');
        small.textContent = meta;
        li.append(small);
      }
      list.append(li);
    }
  }

  // ---------- 留言簿 ----------

  openGuestbook() {
    this.renderGuestbook();
    this.openModal('modal-guestbook');
  }

  private renderGuestbook() {
    this.renderMessages($('guestbook-list'), store.recent(), '');
  }

  // ---------- 搜索 ----------

  openSearch() {
    $<HTMLInputElement>('search-input').value = '';
    this.renderSearch();
    this.openModal('modal-search', 'search-input');
  }

  private renderSearch() {
    const q = $<HTMLInputElement>('search-input').value.trim().toLowerCase();
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
   * 打开放河灯 / 烧信的弹窗。两个弹窗的结构相同：先选一只宠物，再确认。
   * 从单宠物视角过来时已经选好了宠物。
   */
  openRite(kind: RiteKind, pet: Pet | null = null) {
    $<HTMLInputElement>(`${kind}-search`).value = '';
    if (kind === 'fire') $<HTMLTextAreaElement>('fire-input').value = '';
    this.chooseRitePet(kind, pet);
    this.openModal(`modal-${kind}`, pet ? (kind === 'fire' ? 'fire-input' : undefined) : `${kind}-search`);
  }

  private chooseRitePet(kind: RiteKind, pet: Pet | null) {
    this.ritePet[kind] = pet;
    $(`${kind}-chosen`).classList.toggle('hidden', !pet);
    $(`${kind}-picker`).classList.toggle('hidden', !!pet);
    if (pet) $(`${kind}-chosen-name`).textContent = (kind === 'river' ? STR.riverFor : STR.fireFor)(pet.name);
    else this.renderRitePicker(kind);
    this.updateRiteGo(kind);
  }

  /** 选好了宠物（烧信还要写了内容）才能确认 */
  private updateRiteGo(kind: RiteKind) {
    const written = kind === 'river' || $<HTMLTextAreaElement>('fire-input').value.trim().length > 0;
    $<HTMLButtonElement>(`${kind}-go`).disabled = !this.ritePet[kind] || !written;
  }

  private renderRitePicker(kind: RiteKind) {
    const q = $<HTMLInputElement>(`${kind}-search`).value.trim().toLowerCase();
    const list = $(`${kind}-results`);
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
      const pick = document.createElement('button');
      pick.className = 'primary';
      pick.textContent = STR.riverPick;
      pick.addEventListener('click', () => this.chooseRitePet(kind, p));
      li.append(this.petInfo(p), pick);
      list.append(li);
    }
  }

  private findPets(q: string) {
    return PETS.filter(
      (p) =>
        !q ||
        p.name.toLowerCase().includes(q) ||
        p.species.includes(q) ||
        (p.breed ?? '').toLowerCase().includes(q) ||
        p.cabinet.toLowerCase() === q,
    ).slice(0, 30);
  }

  private petInfo(p: Pet) {
    const info = document.createElement('div');
    info.className = 'info';
    const b = document.createElement('b');
    b.textContent = p.name;
    const small = document.createElement('small');
    small.textContent = `${p.breed ?? p.species} · ${STR.detailLocation(p.cabinet, p.slot + 1)}`;
    info.append(b, small);
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
