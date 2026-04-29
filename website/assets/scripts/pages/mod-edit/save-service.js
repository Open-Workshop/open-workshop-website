/* eslint-env browser */

(function () {
  const runtime = window.OWEditRuntime;
  if (!runtime) return;

  runtime.define('mod-edit-save-service', function createModEditSaveService(options) {
    const settings = options || {};
    const api = settings.api;
    const saveButton = runtime.resolveElement(settings.saveButton);
    const deleteButton = runtime.resolveElement(settings.deleteButton);
    const deleteConfirmInput = runtime.resolveElement(settings.deleteConfirmInput);
    const titleInput = runtime.resolveElement(settings.titleInput);
    const publicButton = runtime.resolveElement(settings.publicButton);
    const adultCheckbox = runtime.resolveElement(settings.adultCheckbox);
    const fullDescriptionRoot = runtime.resolveElement(settings.fullDescriptionRoot);
    const catalogDescriptionRoot = runtime.resolveElement(settings.catalogDescriptionRoot);
    const mediaManager = settings.mediaManager || null;
    const authorsManager = settings.authorsManager || null;
    const tagsEditorId = String(settings.tagsEditorId || 'mod-tags-editor');
    const dependenciesEditorId = String(settings.dependenciesEditorId || 'mod-dependencies-editor');

    let saveInProgress = false;
    let deleteInProgress = false;

    function getPickerChanges(editorId) {
      const editor = window.OWPickerEditors ? window.OWPickerEditors.get(editorId) : null;
      if (!editor) {
        return { add: [], remove: [] };
      }

      const state = editor.getState();
      return {
        add: state.unsavedVisible.map(function (item) {
          return item.id;
        }),
        remove: state.savedHidden.map(function (item) {
          return item.id;
        }),
      };
    }

    function collectBaseChanges() {
      const adultStartValue = adultCheckbox instanceof HTMLInputElement && adultCheckbox.hasAttribute('startdata')
        ? String(adultCheckbox.getAttribute('startdata') || '')
        : '';
      const adultCurrentValue = adultCheckbox instanceof HTMLInputElement && adultCheckbox.checked ? 'checked' : '';

      return {
        name: runtime.diffValue(
          runtime.getTextValue(titleInput),
          runtime.getStartValue(titleInput),
        ),
        short_description: runtime.diffValue(
          runtime.getEditorValue(catalogDescriptionRoot),
          runtime.getEditorStartValue(catalogDescriptionRoot),
        ),
        description: runtime.diffValue(
          runtime.getEditorValue(fullDescriptionRoot),
          runtime.getEditorStartValue(fullDescriptionRoot),
        ),
        public: runtime.diffValue(
          runtime.getAttributeValue(publicButton, 'public-mode'),
          runtime.getStartValue(publicButton),
        ),
        adult: runtime.diffValue(adultCurrentValue, adultStartValue),
      };
    }

    function buildPatchPayload(changes) {
      const payload = {};
      Object.entries(changes).forEach(function (entry) {
        const key = entry[0];
        const value = entry[1];
        if (value.changed) {
          if (key === 'public') {
            payload[key] = Number(value.value);
          } else if (key === 'adult') {
            payload[key] = value.value === 'checked';
          } else {
            payload[key] = value.value;
          }
        }
      });
      return payload;
    }

    function collectChanges() {
      const base = collectBaseChanges();
      const mediaState = mediaManager && typeof mediaManager.getState === 'function'
        ? mediaManager.getState()
        : { changes: { new: [], changed: [], deleted: [] }, hasInvalidUrls: false };
      const authorsState = authorsManager && typeof authorsManager.getState === 'function'
        ? authorsManager.getState()
        : {
          changes: { add: [], remove: [], initialOwnerId: 0, currentOwnerId: 0, ownerChanged: false },
          hasChanges: false,
          hasInvalidState: false,
        };
      const tags = getPickerChanges(tagsEditorId);
      const dependencies = getPickerChanges(dependenciesEditorId);

      return {
        base,
        tags,
        dependencies,
        media: mediaState.changes,
        authors: authorsState.changes,
        hasInvalidMedia: Boolean(mediaState.hasInvalidUrls),
        hasInvalidAuthors: Boolean(authorsState.hasInvalidState),
        hasChanges:
          Object.values(base).some(function (item) { return item.changed; }) ||
          authorsState.hasChanges ||
          mediaState.changes.new.length > 0 ||
          mediaState.changes.changed.length > 0 ||
          mediaState.changes.deleted.length > 0 ||
          tags.add.length > 0 ||
          tags.remove.length > 0 ||
          dependencies.add.length > 0 ||
          dependencies.remove.length > 0,
      };
    }

    async function syncTags(changes) {
      for (const id of changes.add) {
        await api.updateTag(id, true);
      }
      for (const id of changes.remove) {
        await api.updateTag(id, false);
      }
    }

    async function syncDependencies(changes) {
      for (const id of changes.add) {
        await api.updateDependency(id, true);
      }
      for (const id of changes.remove) {
        await api.updateDependency(id, false);
      }
    }

    async function syncAuthors(changes) {
      if (!changes) return;

      const addMap = new Map();
      const removeQueue = [];

      changes.add.forEach(function (item) {
        addMap.set(String(item.id), item);
      });
      changes.remove.forEach(function (item) {
        removeQueue.push(item);
      });

      const currentOwnerId = Number(changes.currentOwnerId || 0);
      const initialOwnerId = Number(changes.initialOwnerId || 0);

      if (currentOwnerId > 0 && currentOwnerId !== initialOwnerId) {
        await api.upsertAuthor(currentOwnerId, true);
        addMap.delete(String(currentOwnerId));
      }

      for (const item of addMap.values()) {
        await api.upsertAuthor(item.id, item.owner);
      }

      for (const item of removeQueue) {
        await api.deleteAuthor(item.id);
      }
    }

    async function syncMedia(changes) {
      for (const item of changes.new) {
        if (item.file) {
          await api.uploadNewResourceFile(item);
        } else {
          await api.addResourceUrl(item);
        }
      }

      for (const item of changes.changed) {
        await api.editResource(item);
      }

      for (const id of changes.deleted) {
        await api.deleteResource(id);
      }
    }

    async function save() {
      if (saveInProgress) return;

      const changes = collectChanges();
      if (!changes.hasChanges) {
        runtime.showToast('Нечего сохранять', 'Нет изменений', 'info');
        return;
      }

      if (changes.hasInvalidMedia) {
        runtime.showToast('Проверьте ссылки', 'Исправьте некорректные URL изображений перед сохранением', 'warning');
        return;
      }
      if (changes.hasInvalidAuthors) {
        runtime.showToast('Проверьте авторов', 'У мода должен остаться хотя бы один автор и один владелец', 'warning');
        return;
      }

      saveInProgress = true;
      runtime.setButtonBusy(saveButton, true);

      try {
        await api.updateMod(buildPatchPayload(changes.base));
        await syncAuthors(changes.authors);
        await syncMedia(changes.media);
        await syncTags(changes.tags);
        await syncDependencies(changes.dependencies);

        runtime.showToast('Готово', 'Изменения сохранены', 'success');
        window.location.reload();
      } catch (error) {
        runtime.showError(error, { fallbackText: 'Не удалось сохранить изменения мода' });
      } finally {
        saveInProgress = false;
        runtime.setButtonBusy(saveButton, false);
      }
    }

    function syncDeleteButton() {
      if (!(deleteConfirmInput instanceof HTMLInputElement) || !deleteButton || deleteInProgress) return;
      deleteButton.disabled = !deleteConfirmInput.checked;
    }

    async function deleteMod() {
      if (deleteInProgress) return;
      if (deleteConfirmInput instanceof HTMLInputElement && !deleteConfirmInput.checked) return;
      if (!window.confirm('Удалить мод без возможности восстановления?')) return;

      deleteInProgress = true;
      runtime.setButtonBusy(deleteButton, true);

      try {
        await api.deleteMod();
        runtime.showToast('Удалено', 'Мод удален', 'success');
        window.location.href = '/';
      } catch (error) {
        runtime.showError(error, { fallbackText: 'Не удалось удалить мод' });
      } finally {
        deleteInProgress = false;
        runtime.setButtonBusy(deleteButton, false);
        syncDeleteButton();
      }
    }

    if (deleteConfirmInput instanceof HTMLInputElement) {
      deleteConfirmInput.addEventListener('change', syncDeleteButton);
      syncDeleteButton();
    }

    return {
      collectChanges,
      save,
      deleteMod,
      isSaving: function () {
        return saveInProgress;
      },
      isDeleting: function () {
        return deleteInProgress;
      },
    };
  });
})();
