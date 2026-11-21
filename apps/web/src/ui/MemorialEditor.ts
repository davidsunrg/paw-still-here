import { placementToSlot, type PetDto } from '@paw/shared';
import type { Pet } from '../data/pets';
import { STR } from '../i18n';
import { ApiError } from '../api/client';
import { createMemorialPet, deleteMemorialPet, updateMemorialPet, uploadMemorialImage } from '../api/memorial-actions';
import {
  emptyMemorialForm,
  memorialFormFromPet,
  memorialFormToInput,
  moveGalleryPhoto,
  validateMemorialForm,
  type EditorPhoto,
  type MemorialFormState,
} from './memorial-form-state';

type EditorHooks = {
  onSaved(pet: PetDto, mode: 'create' | 'edit'): void | Promise<void>;
  onDeleted(slot: number): void | Promise<void>;
};

/** 独立的宠物创建 / 编辑器；大 UI 类只负责弹窗入口和保存后的场景动作 */
export class MemorialEditor {
  private state: MemorialFormState = emptyMemorialForm();
  private mode: 'create' | 'edit' = 'create';
  private petId: string | null = null;
  private petSlot = 0;
  private busy = false;
  /** 选图后立刻开始的上传；提交时先等它们结束 */
  private inflight = new Set<Promise<void>>();
  private form: HTMLFormElement;
  private mainInput: HTMLInputElement;
  private galleryInput: HTMLInputElement;

  constructor(private root: HTMLElement, private hooks: EditorHooks) {
    const t = STR.memorialEditor;
    root.innerHTML = `
      <button class="close" data-close aria-label="close">×</button>
      <h2 id="memorial-editor-title"></h2>
      <p class="lore" id="memorial-editor-subtitle"></p>
      <form id="memorial-form" class="memorial-form">
        <div class="memorial-primary">
          <div class="memorial-main-photo">
            <span class="memorial-photo-label">${t.photoLabel}</span>
            <button type="button" class="memorial-photo-pick" id="memorial-main-pick" aria-required="true">
              <img id="memorial-main-preview" alt="" />
              <span class="memorial-photo-icon" id="memorial-main-icon" aria-hidden="true">📷</span>
              <span id="memorial-main-placeholder">${t.choosePhoto}</span>
            </button>
            <input id="memorial-main-input" type="file" accept="image/*" hidden />
            <small id="memorial-main-status" class="memorial-photo-status" aria-live="polite"></small>
            <small id="memorial-main-hint">${t.mainRequiredHint}</small>
          </div>
          <div class="memorial-fields">
            <label for="memorial-name">${t.name}</label>
            <input id="memorial-name" autocomplete="off" maxlength="80" required />
            <label for="memorial-species">${t.species}</label>
            <select id="memorial-species">
              <option value="dog">Dog</option><option value="cat">Cat</option><option value="rabbit">Rabbit</option>
              <option value="hamster">Hamster</option><option value="bird">Bird</option>
            </select>
          </div>
        </div>
        <button type="button" class="memorial-more" id="memorial-more"></button>
        <div id="memorial-details" class="memorial-details" hidden>
          <label for="memorial-breed">${t.breed}</label>
          <input id="memorial-breed" autocomplete="off" maxlength="80" />
          <div class="memorial-dates">
            <label>${t.birth}<input id="memorial-birth" type="date" /></label>
            <label>${t.passed}<input id="memorial-passed" type="date" /></label>
          </div>
          <label for="memorial-message">${t.message}</label>
          <textarea id="memorial-message" rows="4" maxlength="2000" placeholder="${t.messagePlaceholder}"></textarea>
          <div class="memorial-album-head">
            <label>${t.album}</label>
            <button type="button" class="secondary" id="memorial-gallery-add">${t.addPhotos}</button>
            <input id="memorial-gallery-input" type="file" accept="image/*" multiple hidden />
          </div>
          <ul id="memorial-gallery" class="memorial-gallery"></ul>
        </div>
        <p id="memorial-progress" class="memorial-progress" aria-live="polite"></p>
        <p id="memorial-error" class="memorial-error" aria-live="assertive"></p>
        <button type="submit" class="primary memorial-save" id="memorial-save"></button>
        <p id="memorial-edit-note" class="memorial-note"></p>
      </form>
      <div id="memorial-delete-zone" class="memorial-delete-zone" hidden>
        <button type="button" class="danger" id="memorial-delete-start">${t.delete}</button>
        <div id="memorial-delete-confirm" class="memorial-delete-confirm" hidden>
          <p id="memorial-delete-text"></p>
          <div><button type="button" id="memorial-delete-cancel">${t.deleteCancel}</button>
          <button type="button" class="danger" id="memorial-delete-confirm-button">${t.deleteConfirmButton}</button></div>
        </div>
      </div>`;

    this.form = root.querySelector<HTMLFormElement>('#memorial-form')!;
    this.mainInput = root.querySelector<HTMLInputElement>('#memorial-main-input')!;
    this.galleryInput = root.querySelector<HTMLInputElement>('#memorial-gallery-input')!;
    this.bind();
    this.render();
  }

  openCreate() {
    this.resetObjectUrls();
    this.mode = 'create';
    this.petId = null;
    this.state = emptyMemorialForm();
    this.root.querySelector<HTMLElement>('#memorial-details')!.hidden = true;
    this.root.querySelector<HTMLElement>('#memorial-delete-zone')!.hidden = true;
    this.render();
  }

  openEdit(pet: Pet) {
    this.resetObjectUrls();
    this.mode = 'edit';
    this.petId = pet.id;
    this.petSlot = placementToSlot(pet.section, pet.cell) ?? 0;
    this.state = memorialFormFromPet(pet);
    this.root.querySelector<HTMLElement>('#memorial-details')!.hidden = false;
    this.root.querySelector<HTMLElement>('#memorial-delete-zone')!.hidden = false;
    this.root.querySelector<HTMLElement>('#memorial-delete-confirm')!.hidden = true;
    this.render();
  }

  private bind() {
    const q = <T extends HTMLElement>(selector: string) => this.root.querySelector<T>(selector)!;
    q('#memorial-main-pick').addEventListener('click', () => this.mainInput.click());
    this.mainInput.addEventListener('change', () => {
      const file = this.mainInput.files?.[0];
      if (!file) return;
      if (this.state.main?.objectUrl) URL.revokeObjectURL(this.state.main.objectUrl);
      const objectUrl = URL.createObjectURL(file);
      const photo: EditorPhoto = { key: 'main', url: objectUrl, objectUrl, file, status: 'pending' };
      this.state.main = photo;
      this.mainInput.value = '';
      this.renderMain();
      // 选完就传，别等到提交才有反应
      void this.startUpload(photo);
    });

    const text = (selector: string, key: 'name' | 'breed' | 'birthDate' | 'passedDate' | 'message') => {
      q(selector).addEventListener('input', (event) => {
        this.state[key] = (event.target as HTMLInputElement | HTMLTextAreaElement).value;
      });
    };
    text('#memorial-name', 'name');
    text('#memorial-breed', 'breed');
    text('#memorial-birth', 'birthDate');
    text('#memorial-passed', 'passedDate');
    text('#memorial-message', 'message');
    q('#memorial-species').addEventListener('change', (event) => {
      this.state.species = (event.target as HTMLSelectElement).value as MemorialFormState['species'];
    });
    q('#memorial-more').addEventListener('click', () => {
      const details = q('#memorial-details');
      details.hidden = !details.hidden;
      this.renderMore();
    });
    q('#memorial-gallery-add').addEventListener('click', () => this.galleryInput.click());
    this.galleryInput.addEventListener('change', () => {
      const added: EditorPhoto[] = [];
      for (const file of [...(this.galleryInput.files ?? [])]) {
        const objectUrl = URL.createObjectURL(file);
        added.push({ key: crypto.randomUUID(), url: objectUrl, objectUrl, file, status: 'pending' });
      }
      this.state.gallery.push(...added);
      this.galleryInput.value = '';
      this.root.querySelector<HTMLElement>('#memorial-details')!.hidden = false;
      this.renderMore();
      this.renderGallery();
      for (const photo of added) void this.startUpload(photo);
    });

    this.form.addEventListener('submit', (event) => {
      event.preventDefault();
      void this.submit();
    });
    q('#memorial-delete-start').addEventListener('click', () => {
      const petName = this.state.name.trim();
      q('#memorial-delete-text').textContent = STR.memorialEditor.deleteConfirm(petName);
      q('#memorial-delete-confirm').hidden = false;
    });
    q('#memorial-delete-cancel').addEventListener('click', () => {
      q('#memorial-delete-confirm').hidden = true;
    });
    q('#memorial-delete-confirm-button').addEventListener('click', () => void this.remove());
  }

  private render() {
    const t = STR.memorialEditor;
    this.root.querySelector('#memorial-editor-title')!.textContent = this.mode === 'create' ? t.title : t.editTitle(this.state.name);
    this.root.querySelector('#memorial-editor-subtitle')!.textContent = this.mode === 'create' ? t.subtitle : t.editSubtitle;
    this.root.querySelector('#memorial-edit-note')!.textContent = this.mode === 'create' ? t.editHint : '';
    this.setText('#memorial-name', this.state.name);
    this.setText('#memorial-breed', this.state.breed);
    this.setText('#memorial-birth', this.state.birthDate);
    this.setText('#memorial-passed', this.state.passedDate);
    this.setText('#memorial-message', this.state.message);
    (this.root.querySelector<HTMLSelectElement>('#memorial-species')!).value = this.state.species;
    this.root.querySelector<HTMLButtonElement>('#memorial-save')!.textContent = this.mode === 'create' ? t.saveCreate : t.saveEdit;
    this.root.querySelector('#memorial-error')!.textContent = '';
    this.root.querySelector('#memorial-progress')!.textContent = '';
    this.renderMore();
    this.renderMain();
    this.renderGallery();
  }

  private setText(selector: string, value: string) {
    this.root.querySelector<HTMLInputElement | HTMLTextAreaElement>(selector)!.value = value;
  }

  private renderMore() {
    const hidden = this.root.querySelector<HTMLElement>('#memorial-details')!.hidden;
    this.root.querySelector('#memorial-more')!.textContent = hidden ? STR.memorialEditor.more : STR.memorialEditor.less;
  }

  private renderMain() {
    const t = STR.memorialEditor;
    const main = this.state.main;
    const image = this.root.querySelector<HTMLImageElement>('#memorial-main-preview')!;
    image.hidden = !main;
    if (main) image.src = main.url;
    else image.removeAttribute('src');
    this.root.querySelector('#memorial-main-icon')!.classList.toggle('hidden', !!main);
    this.root.querySelector('#memorial-main-placeholder')!.textContent = main ? t.changePhoto : t.choosePhoto;
    const status = this.root.querySelector<HTMLElement>('#memorial-main-status')!;
    status.textContent = main ? t.status[main.status] : '';
    status.classList.toggle('error', main?.status === 'error');
  }

  /** 选好照片就上传；失败时保留文件，提交时会再试一次 */
  private startUpload(photo: EditorPhoto) {
    const task = this.runUpload(photo);
    this.inflight.add(task);
    void task.finally(() => {
      this.inflight.delete(task);
      this.renderMain();
      this.renderGallery();
    });
  }

  private async runUpload(photo: EditorPhoto) {
    if (!photo.file) return;
    photo.status = 'uploading';
    this.renderMain();
    this.renderGallery();
    try {
      const result = await uploadMemorialImage(photo.file);
      if (photo.objectUrl) URL.revokeObjectURL(photo.objectUrl);
      delete photo.objectUrl;
      delete photo.file;
      photo.uploadId = result.uploadId;
      photo.url = result.publicUrl;
      photo.status = 'completed';
    } catch {
      photo.status = 'error';
    }
  }

  private renderGallery() {
    const t = STR.memorialEditor;
    const list = this.root.querySelector<HTMLUListElement>('#memorial-gallery')!;
    list.replaceChildren();
    this.state.gallery.forEach((photo, index) => {
      const item = document.createElement('li');
      item.className = `memorial-gallery-item ${photo.status === 'error' ? 'has-error' : ''}`;
      const image = document.createElement('img');
      image.src = photo.url;
      image.alt = '';
      const status = document.createElement('small');
      status.textContent = t.status[photo.status];
      const actions = document.createElement('div');
      actions.className = 'memorial-gallery-actions';
      const button = (label: string, title: string, run: () => void, disabled = false) => {
        const element = document.createElement('button');
        element.type = 'button';
        element.textContent = label;
        element.title = title;
        element.setAttribute('aria-label', title);
        element.disabled = this.busy || disabled;
        element.addEventListener('click', run);
        actions.append(element);
      };
      button('←', t.moveUp, () => {
        this.state = moveGalleryPhoto(this.state, index, -1);
        this.renderGallery();
      }, index === 0);
      button('→', t.moveDown, () => {
        this.state = moveGalleryPhoto(this.state, index, 1);
        this.renderGallery();
      }, index === this.state.gallery.length - 1);
      button('×', t.removePhoto, () => {
        const [removed] = this.state.gallery.splice(index, 1);
        if (removed?.objectUrl) URL.revokeObjectURL(removed.objectUrl);
        this.renderGallery();
      });
      item.append(image, status, actions);
      list.append(item);
    });
  }

  private async submit() {
    if (this.busy) return;
    const invalid = validateMemorialForm(this.state);
    if (invalid) {
      this.showError(invalid);
      if (invalid === 'name_required') this.root.querySelector<HTMLInputElement>('#memorial-name')!.focus();
      if (invalid === 'image_required') this.root.querySelector<HTMLButtonElement>('#memorial-main-pick')!.focus();
      return;
    }
    this.setBusy(true);
    this.root.querySelector('#memorial-error')!.textContent = '';
    try {
      await this.uploadPendingPhotos();
      this.root.querySelector('#memorial-progress')!.textContent = STR.memorialEditor.saving;
      const input = memorialFormToInput(this.state, this.mode === 'edit');
      const dto = this.mode === 'create' ? await createMemorialPet(input) : await updateMemorialPet(this.petId!, input);
      await this.hooks.onSaved(dto, this.mode);
    } catch (error) {
      this.showError(error instanceof ApiError ? error.code : 'save_failed');
    } finally {
      this.setBusy(false);
    }
  }

  private async uploadPendingPhotos() {
    // 选图后立刻开始的上传可能还在进行：先等它们结束，失败的文件再补传一次
    if (this.inflight.size) await Promise.all([...this.inflight]);
    const pending = [this.state.main, ...this.state.gallery].filter((photo): photo is EditorPhoto => !!photo?.file);
    let completed = 0;
    for (const photo of pending) {
      photo.status = 'uploading';
      this.root.querySelector('#memorial-progress')!.textContent = STR.memorialEditor.uploading(completed, pending.length);
      this.renderGallery();
      try {
        const result = await uploadMemorialImage(photo.file!);
        if (photo.objectUrl) URL.revokeObjectURL(photo.objectUrl);
        delete photo.objectUrl;
        delete photo.file;
        photo.uploadId = result.uploadId;
        photo.url = result.publicUrl;
        photo.status = 'completed';
        completed++;
        this.root.querySelector('#memorial-progress')!.textContent = STR.memorialEditor.uploading(completed, pending.length);
        this.renderMain();
        this.renderGallery();
      } catch (error) {
        photo.status = 'error';
        this.renderGallery();
        throw error;
      }
    }
  }

  private async remove() {
    if (!this.petId || this.busy) return;
    this.setBusy(true);
    this.root.querySelector('#memorial-progress')!.textContent = STR.memorialEditor.deleting;
    try {
      await deleteMemorialPet(this.petId);
      await this.hooks.onDeleted(this.petSlot);
    } catch (error) {
      this.showError(error instanceof ApiError ? error.code : 'delete_failed');
    } finally {
      this.setBusy(false);
    }
  }

  private setBusy(on: boolean) {
    this.busy = on;
    this.form.setAttribute('aria-busy', String(on));
    this.root.querySelector<HTMLButtonElement>('#memorial-save')!.disabled = on;
    this.root.querySelector<HTMLButtonElement>('#memorial-gallery-add')!.disabled = on;
    this.root.querySelector<HTMLButtonElement>('#memorial-delete-confirm-button')!.disabled = on;
    this.renderGallery();
  }

  private showError(code: string) {
    const t = STR.memorialEditor;
    const text = {
      name_required: t.errorRequired,
      species_required: t.errorRequired,
      image_required: t.errorImageRequired,
      image_type: t.errorImageType,
      image_size: t.errorImageSize,
      gallery_full: t.errorGalleryFull,
      unauthorized: t.errorUnauthorized,
      forbidden: t.errorForbidden,
      upload_failed: t.errorUpload,
      object_missing: t.errorUpload,
      upload_not_completed: t.errorUpload,
      delete_failed: t.errorDelete,
    } as Record<string, string>;
    this.root.querySelector('#memorial-error')!.textContent = text[code] ?? t.errorGeneric;
    this.root.querySelector('#memorial-progress')!.textContent = '';
  }

  private resetObjectUrls() {
    for (const photo of [this.state.main, ...this.state.gallery]) {
      if (photo?.objectUrl) URL.revokeObjectURL(photo.objectUrl);
    }
  }
}
