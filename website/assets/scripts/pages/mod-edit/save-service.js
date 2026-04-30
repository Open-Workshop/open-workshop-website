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
    const conflictsEditorId = String(settings.conflictsEditorId || 'mod-conflicts-editor');

    let saveInProgress = false;
    let deleteInProgress = false;
    let unloadGuard = null;
    const progressRoot = runtime.resolveElement(settings.progressRoot || '[data-save-progress-root]');
    const saveProgress = window.OWUI && typeof window.OWUI.createSaveProgress === 'function'
      ? window.OWUI.createSaveProgress(progressRoot)
      : null;

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
      const conflicts = getPickerChanges(conflictsEditorId);

      return {
        base,
        tags,
        dependencies,
        conflicts,
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
          dependencies.remove.length > 0 ||
          conflicts.add.length > 0 ||
          conflicts.remove.length > 0,
        };
    }

    function buildSavePlan(changes) {
      const steps = [];
      const baseChanged = Object.values(changes.base || {}).some(function (item) {
        return Boolean(item && item.changed);
      });
      const authorsChanged = Boolean(changes.authors && (
        changes.authors.add.length > 0 ||
        changes.authors.remove.length > 0 ||
        Boolean(changes.authors.ownerChanged) ||
        Number(changes.authors.currentOwnerId || 0) !== Number(changes.authors.initialOwnerId || 0)
      ));
      const mediaChanged = Boolean(
        changes.media &&
        (
          changes.media.new.length > 0 ||
          changes.media.changed.length > 0 ||
          changes.media.deleted.length > 0
        ),
      );
      const tagsChanged = Boolean(changes.tags && (changes.tags.add.length > 0 || changes.tags.remove.length > 0));
      const dependenciesChanged = Boolean(
        changes.dependencies &&
        (changes.dependencies.add.length > 0 || changes.dependencies.remove.length > 0),
      );
      const conflictsChanged = Boolean(
        changes.conflicts &&
        (changes.conflicts.add.length > 0 || changes.conflicts.remove.length > 0),
      );

      if (baseChanged) {
        steps.push({ key: 'base', label: 'Сохраняем основные поля' });
      }
      if (authorsChanged) {
        steps.push({ key: 'authors', label: 'Обновляем авторов' });
      }
      if (mediaChanged) {
        steps.push({ key: 'media', label: 'Обновляем изображения' });
      }
      if (tagsChanged) {
        steps.push({ key: 'tags', label: 'Синхронизируем теги' });
      }
      if (dependenciesChanged) {
        steps.push({ key: 'dependencies', label: 'Синхронизируем зависимости' });
      }
      if (conflictsChanged) {
        steps.push({ key: 'conflicts', label: 'Синхронизируем конфликты' });
      }

      steps.push({ key: 'finish', label: 'Завершаем сохранение' });
      steps.push({ key: 'reloading', label: 'Перезагружаем страницу' });
      return steps;
    }

    function waitForReloadPaint() {
      return new Promise(function (resolve) {
        window.requestAnimationFrame(function () {
          window.requestAnimationFrame(resolve);
        });
      });
    }

    function getMediaOperationLabel(entry) {
      if (!entry) return 'Обновляем изображения';
      if (entry.kind === 'deleted') return 'Удаляем изображение';
      if (entry.kind === 'changed') return 'Обновляем изображение';
      if (entry.item && entry.item.file) return 'Загружаем изображение';
      if (entry.item && entry.item.url) return 'Сохраняем ссылку';
      return 'Обновляем изображение';
    }

    function hasUnsavedChanges() {
      if (saveInProgress || deleteInProgress) {
        return true;
      }

      return collectChanges().hasChanges;
    }

    if (typeof runtime.bindBeforeUnload === 'function') {
      unloadGuard = runtime.bindBeforeUnload(hasUnsavedChanges);
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

    async function syncConflicts(changes) {
      for (const id of changes.add) {
        await api.updateConflict(id, true);
      }
      for (const id of changes.remove) {
        await api.updateConflict(id, false);
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

    async function syncMedia(changes, progress) {
      const operations = [];

      changes.new.forEach(function (item) {
        operations.push({ kind: 'new', item });
      });
      changes.changed.forEach(function (item) {
        operations.push({ kind: 'changed', item });
      });
      changes.deleted.forEach(function (id) {
        operations.push({ kind: 'deleted', id });
      });

      const total = operations.length;
      let index = 0;

      for (const entry of operations) {
        index += 1;
        if (progress && typeof progress.setStep === 'function') {
          progress.setStep('media', 'active', `${getMediaOperationLabel(entry)} ${index}/${total}`);
        }

        if (entry.kind === 'new') {
          if (entry.item.file) {
            await api.uploadNewResourceFile(entry.item, progress);
          } else {
            await api.addResourceUrl(entry.item);
          }
          continue;
        }

        if (entry.kind === 'changed') {
          await api.editResource(entry.item);
          continue;
        }

        await api.deleteResource(entry.id);
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

      const savePlan = buildSavePlan(changes);
      const hasStep = function (stepKey) {
        return savePlan.some(function (step) {
          return step.key === stepKey;
        });
      };

      saveInProgress = true;
      runtime.setButtonBusy(saveButton, true);

      if (saveProgress) {
        saveProgress.start({
          title: 'Сохраняем мод',
          message: 'Не закрывайте страницу до завершения сохранения.',
          steps: savePlan,
        });
      }

      let saveCompleted = false;

      try {
        if (hasStep('base')) {
          if (saveProgress) {
            saveProgress.setStep('base', 'active');
          }
          await api.updateMod(buildPatchPayload(changes.base));
        }

        if (hasStep('authors')) {
          if (saveProgress) {
            saveProgress.setStep('authors', 'active');
          }
          await syncAuthors(changes.authors);
        }

        if (hasStep('media')) {
          if (saveProgress) {
            saveProgress.setStep('media', 'active');
          }
          await syncMedia(changes.media, saveProgress);
        }

        if (hasStep('tags')) {
          if (saveProgress) {
            saveProgress.setStep('tags', 'active');
          }
          await syncTags(changes.tags);
        }

        if (hasStep('dependencies')) {
          if (saveProgress) {
            saveProgress.setStep('dependencies', 'active');
          }
          await syncDependencies(changes.dependencies);
        }

        if (hasStep('conflicts')) {
          if (saveProgress) {
            saveProgress.setStep('conflicts', 'active');
          }
          await syncConflicts(changes.conflicts);
        }

        if (saveProgress) {
          saveProgress.setStep('finish', 'active', 'Подготовка к перезагрузке...');
          saveProgress.setStep('finish', 'complete', 'Изменения сохранены');
          saveProgress.setStep('reloading', 'active', 'Перезагружаем страницу...');
          saveProgress.setProgress(100);
        }

        runtime.showToast('Готово', 'Изменения сохранены', 'success');
        saveCompleted = true;
        await waitForReloadPaint();
        if (unloadGuard) {
          unloadGuard.suppressOnce();
        }
        window.location.reload();
      } catch (error) {
        if (saveProgress) {
          saveProgress.fail(error && error.message ? error.message : 'Не удалось сохранить изменения мода');
        }
        runtime.showError(error, { fallbackText: 'Не удалось сохранить изменения мода' });
      } finally {
        saveInProgress = false;
        runtime.setButtonBusy(saveButton, false);
        if (!saveCompleted && saveProgress) {
          saveProgress.close();
        }
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
        if (unloadGuard) {
          unloadGuard.suppressOnce();
        }
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
