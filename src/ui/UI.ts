import { PETS, type Pet } from '../data/pets';
import { store, type Message } from '../data/store';
import { STR } from '../strings';
import { portraitDataURL } from '../world/textures';

export type TeleportTarget = 'gate' | 'hall' | 'memorial';

export interface UIHooks {
  onEnter(): void;
  onTeleport(target: TeleportTarget): void;
  onLantern(text: string): void;
  /** 返回切换后的静音状态 */
  onToggleSound(): boolean;
  /** 返回切换后的画质 */
  onToggleQuality(): 'high' | 'low';
  onDetailClosed(): void;
  onOffering(pet: Pet, kind: 'flower' | 'candle'): void;
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
  private tooltip = $('tooltip');

  constructor(private hooks: UIHooks) {
    document.body.classList.toggle('touch', this.isTouch);

    // 静态文案
    document.querySelectorAll<HTMLElement>('[data-t]').forEach((el) => {
      const v = (STR as Record<string, unknown>)[el.dataset.t!];
      if (typeof v === 'string') el.textContent = v;
    });
    $<HTMLInputElement>('detail-input').placeholder = STR.detailPlaceholder;
    $<HTMLInputElement>('lantern-input').placeholder = STR.lanternPlaceholder;
    $<HTMLInputElement>('guestbook-input').placeholder = STR.guestbookPlaceholder;
    $<HTMLInputElement>('search-input').placeholder = STR.searchPlaceholder;
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
      if (e.key === 'Escape') this.closeAll();
    });

    // 详情面板
    $('detail-close').addEventListener('click', () => this.closeDetail());
    $('btn-flower').addEventListener('click', () => this.offer('flower'));
    $('btn-candle').addEventListener('click', () => this.offer('candle'));
    $('detail-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const input = $<HTMLInputElement>('detail-input');
      const text = input.value.trim();
      if (!text || !this.pet) return;
      store.addComment(this.pet, text);
      input.value = '';
      this.renderComments();
      this.toast(STR.commentToast);
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

  /** 详情面板在桌面端占据的宽度，用来把画面主体让到左边 */
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
    $<HTMLImageElement>('detail-photo').src = pet.photoUrl ?? portraitDataURL(pet);
    $('detail-name').textContent = pet.name;
    $('detail-meta').textContent = [pet.species, pet.breed, STR.detailLocation(pet.cabinet, pet.slot + 1)]
      .filter(Boolean)
      .join(' · ');
    $('detail-dates').textContent = `${pet.birthDate ?? '?'} — ${pet.passedDate}`;
    $('detail-message').textContent = pet.message;
    this.renderStats();
    this.renderComments();
    $('detail').classList.add('open');
    $('detail').scrollTop = 0;
    this.notify();
  }

  closeDetail() {
    if (!this.pet) return;
    this.pet = null;
    $('detail').classList.remove('open');
    (document.activeElement as HTMLElement | null)?.blur?.();
    this.hooks.onDetailClosed();
    this.notify();
  }

  private offer(kind: 'flower' | 'candle') {
    if (!this.pet) return;
    if (kind === 'flower') store.addFlower(this.pet);
    else store.addCandle(this.pet);
    this.renderStats();
    this.hooks.onOffering(this.pet, kind);
    this.toast(kind === 'flower' ? STR.flowerToast(this.pet.name) : STR.candleToast(this.pet.name));
  }

  private renderStats() {
    if (!this.pet) return;
    const s = store.stats(this.pet);
    $('count-flower').textContent = String(s.flowers);
    $('count-candle').textContent = String(s.candles);
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

  private renderComments() {
    if (this.pet) this.renderMessages($('detail-comments'), store.comments(this.pet), STR.detailNoComments);
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
    const found = PETS.filter(
      (p) =>
        !q ||
        p.name.toLowerCase().includes(q) ||
        p.species.includes(q) ||
        (p.breed ?? '').toLowerCase().includes(q) ||
        p.cabinet.toLowerCase() === q,
    ).slice(0, 30);
    if (!found.length) {
      const li = document.createElement('li');
      li.className = 'empty';
      li.textContent = STR.searchEmpty;
      list.append(li);
      return;
    }
    for (const p of found) {
      const li = document.createElement('li');
      const info = document.createElement('div');
      info.className = 'info';
      const b = document.createElement('b');
      b.textContent = p.name;
      const small = document.createElement('small');
      small.textContent = `${p.breed ?? p.species} · ${STR.detailLocation(p.cabinet, p.slot + 1)}`;
      info.append(b, small);
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

  // ---------- 触屏摇杆 ----------

  bindJoystick(onMove: (x: number, y: number) => void) {
    const base = $('joystick');
    const stick = $('stick');
    let id = -1;
    const set = (e: PointerEvent) => {
      const r = base.getBoundingClientRect();
      let x = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
      let y = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
      const len = Math.hypot(x, y);
      if (len > 1) {
        x /= len;
        y /= len;
      }
      stick.style.transform = `translate(${x * 34}px, ${y * 34}px)`;
      onMove(x, -y);
    };
    base.addEventListener('pointerdown', (e) => {
      id = e.pointerId;
      base.setPointerCapture(id);
      set(e);
    });
    base.addEventListener('pointermove', (e) => {
      if (e.pointerId === id) set(e);
    });
    const end = (e: PointerEvent) => {
      if (e.pointerId !== id) return;
      id = -1;
      stick.style.transform = '';
      onMove(0, 0);
    };
    base.addEventListener('pointerup', end);
    base.addEventListener('pointercancel', end);
  }
}
