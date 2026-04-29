/* eslint-env browser */

(function () {
  const root = document.getElementById('main-game-edit');
  if (!root) return;

  const editRuntime = window.OWEditRuntime;
  const apiPaths = window.OWCore.getApiPaths();
  const gameId = Number(root.dataset.gameId || 0);
  const saveButton = document.getElementById('save-game-button');
  const deleteButton = document.getElementById('delete-game-button');
  const tagsEditorId = 'game-tags-editor';
  const genresEditorId = 'game-genres-editor';

  let saveInProgress = false;
  let deleteInProgress = false;
  let unloadGuard = null;
  const saveProgress = window.OWUI && typeof window.OWUI.createSaveProgress === 'function'
    ? window.OWUI.createSaveProgress(document.querySelector('[data-save-progress-root]'))
    : null;

  function showToast(title, text, theme) {
    if (editRuntime) {
      editRuntime.showToast(title, text, theme);
      return;
    }

    new Toast({ title, text, theme, autohide: true, interval: 5000 });
  }

  function setButtonBusy(button, busy) {
    if (editRuntime) {
      editRuntime.setButtonBusy(button, busy);
      return;
    }

    if (button) {
      button.disabled = busy;
      button.classList.toggle('disabled', busy);
    }
  }

  function getTextValue(selector) {
    return editRuntime ? editRuntime.getTextValue(selector) : '';
  }

  function getStartValue(selector) {
    return editRuntime ? editRuntime.getStartValue(selector) : '';
  }

  function getEditorValue(panelSelector) {
    return editRuntime ? editRuntime.getEditorValue(panelSelector) : '';
  }

  function getEditorStartValue(panelSelector) {
    return editRuntime ? editRuntime.getEditorStartValue(panelSelector) : '';
  }

  function parseResponseMessage(text, fallback) {
    return editRuntime ? editRuntime.parseResponseMessage(text, fallback) : fallback;
  }

  function normalizeEntityName(value) {
    return String(value || '').trim().replace(/\s+/g, ' ');
  }

  function parseNumericIds(items) {
    return items
      .map(function (item) {
        return Number(item.id);
      })
      .filter(Number.isFinite);
  }

  function getPickerEditor(editorId) {
    return window.OWPickerEditors ? window.OWPickerEditors.get(editorId) : null;
  }

  function emptyPickerState() {
    return {
      savedHidden: [],
      unsavedVisible: [],
      pendingVisible: [],
    };
  }

  function clonePickerItems(items) {
    return Array.isArray(items)
      ? items.map(function (item) {
        return {
          id: String(item && item.id !== undefined ? item.id : ''),
          name: String(item && item.name !== undefined ? item.name : ''),
        };
      }).filter(function (item) {
        return item.id !== '';
      })
      : [];
  }

  function clonePickerState(state) {
    if (!state || typeof state !== 'object') {
      return emptyPickerState();
    }

    return {
      savedHidden: clonePickerItems(state.savedHidden),
      unsavedVisible: clonePickerItems(state.unsavedVisible),
      pendingVisible: clonePickerItems(state.pendingVisible),
    };
  }

  function readPickerState(editorId) {
    const editor = getPickerEditor(editorId);
    if (!editor || typeof editor.getState !== 'function') {
      return emptyPickerState();
    }

    return clonePickerState(editor.getState());
  }

  function getPickerChangesFromState(state) {
    const currentState = state || emptyPickerState();
    return {
      add: parseNumericIds(currentState.unsavedVisible),
      remove: parseNumericIds(currentState.savedHidden),
      create: currentState.pendingVisible.map(function (item) {
        return {
          tempId: item.id,
          name: item.name,
        };
      }),
    };
  }

  function parseCreatedEntityId(text, entityLabel) {
    if (!text) {
      throw new Error('API не вернул ID для "' + entityLabel + '"');
    }

    if (typeof text === 'object') {
      if (typeof text.id === 'number' && Number.isFinite(text.id)) {
        return text.id;
      }
    }

    try {
      const parsed = JSON.parse(text);
      if (typeof parsed === 'number' && Number.isFinite(parsed)) {
        return parsed;
      }
      if (typeof parsed === 'string' && /^\d+$/.test(parsed)) {
        return Number(parsed);
      }
      if (parsed && typeof parsed.id === 'number') {
        return parsed.id;
      }
    } catch (error) {
      const numericMatch = String(text).match(/\d+/);
      if (numericMatch) {
        return Number(numericMatch[0]);
      }
    }

    throw new Error('Не удалось разобрать ID для "' + entityLabel + '"');
  }

  let tagsPickerState = readPickerState(tagsEditorId);
  let genresPickerState = readPickerState(genresEditorId);

  function bindPickerState(editorId, setState) {
    const editorRoot = document.getElementById(editorId);
    if (!(editorRoot instanceof Element)) return;

    editorRoot.addEventListener('ow:picker-selection-change', function (event) {
      if (!event.detail || event.detail.key !== editorId || !event.detail.state) return;
      const nextState = clonePickerState(event.detail.state);
      setState(nextState);
    });
  }

  function initCatalogPreview() {
    if (!editRuntime) return null;

    const createPreview = editRuntime.requireFactory('game-edit-catalog-preview');
    const preview = createPreview({
      root: root.querySelector('.game-edit__catalog-cards'),
      titleInput: root.querySelector('#game-name'),
      descriptionRoot: root.querySelector('#game-short-desc-editor'),
      mediaManager,
      gameId,
    });

    if (preview && typeof preview.bind === 'function') {
      preview.bind();
    }

    return preview;
  }

  async function sendJson(endpoint, data, pathParams) {
    const url = pathParams
      ? window.OWCore.formatPath(endpoint.path, pathParams)
      : endpoint.path;
    const response = await window.OWCore.request(window.OWCore.apiUrl(url), {
      method: endpoint.method,
      data,
      credentials: 'include',
      parseAs: 'json',
    });

    if (response.ok) {
      return response;
    }

    const payload = response.data;
    const errorText = payload && typeof payload === 'object'
      ? (payload.detail || payload.message || payload.error || payload.title || '')
      : String(payload || '');
    throw new Error(parseResponseMessage(errorText, `Ошибка (${response.status})`));
  }

  async function createNamedEntities(endpoint, fieldName, items, finalizeCallback, progress, stepKey, label) {
    const createdIds = [];
    const normalizedItems = Array.isArray(items)
      ? items.map(function (item) {
        return {
          tempId: item.tempId,
          name: normalizeEntityName(item.name),
        };
      }).filter(function (item) {
        return item.name !== '';
      })
      : [];
    const total = normalizedItems.length;
    let index = 0;

    for (const item of normalizedItems) {
      index += 1;
      if (progress && typeof progress.setStep === 'function' && stepKey) {
        progress.setStep(stepKey, 'active', `${label} ${index}/${total}`);
      }

      const response = await sendJson(endpoint, { [fieldName]: item.name });
      const createdId = parseCreatedEntityId(response.data, item.name);

      finalizeCallback(item.tempId, createdId);
      createdIds.push(createdId);
    }

    return createdIds;
  }

  function collectBaseChanges() {
    const nameValue = getTextValue('#game-name');
    const typeValue = getTextValue('#game-type');
    const shortDescValue = getEditorValue('#game-short-desc-editor');
    const descValue = getEditorValue('#game-full-desc-editor');
    const sourceValue = getTextValue('#game-source').trim();
    const sourceIdValue = getTextValue('#game-source-id').trim();
    const startSourceValue = getStartValue('#game-source').trim();
    const startSourceIdValue = getStartValue('#game-source-id').trim();

    let changed = false;

      if (nameValue.trim() === '') {
      throw new Error('Название игры не может быть пустым');
    }

    if (nameValue !== getStartValue('#game-name')) {
      changed = true;
    }

    if (typeValue !== getStartValue('#game-type')) {
      changed = true;
    }

    if (shortDescValue !== getEditorStartValue('#game-short-desc-editor')) {
      changed = true;
    }

    if (descValue !== getEditorStartValue('#game-full-desc-editor')) {
      changed = true;
    }

    const sourcePairChanged = sourceValue !== startSourceValue || sourceIdValue !== startSourceIdValue;

    if (sourcePairChanged) {
      if (sourceValue === '' && sourceIdValue === '') {
        throw new Error('Очистка source/source_id через эту форму пока не поддержана');
      }

      if (sourceValue === '' || sourceIdValue === '') {
        throw new Error('Поля source и source_id нужно заполнять вместе');
      }

      if (!/^\d+$/.test(sourceIdValue)) {
        throw new Error('source_id должен быть целым числом');
      }

      changed = true;
    }

    return {
      changed,
      payload: {
        ...(nameValue !== getStartValue('#game-name') ? { name: nameValue } : {}),
        ...(typeValue !== getStartValue('#game-type') ? { type: typeValue } : {}),
        ...(shortDescValue !== getEditorStartValue('#game-short-desc-editor') ? { short_description: shortDescValue } : {}),
        ...(descValue !== getEditorStartValue('#game-full-desc-editor') ? { description: descValue } : {}),
        ...(sourcePairChanged ? { source: sourceValue, source_id: Number(sourceIdValue) } : {}),
      },
    };
  }

  function collectGameChanges() {
    const base = collectBaseChanges();
    const mediaState = mediaManager && typeof mediaManager.getState === 'function'
      ? mediaManager.getState()
      : { changes: { new: [], changed: [], deleted: [] }, hasInvalidUrls: false };
    const tags = getPickerChangesFromState(tagsPickerState);
    const genres = getPickerChangesFromState(genresPickerState);
    const tagsEditor = getPickerEditor(tagsEditorId);
    const genresEditor = getPickerEditor(genresEditorId);
    const createdTagDefinitions = Array.isArray(tags.create) ? tags.create : [];
    const createdGenreDefinitions = Array.isArray(genres.create) ? genres.create : [];

    return {
      base,
      mediaState,
      tags,
      genres,
      tagsEditor,
      genresEditor,
      createdTagDefinitions,
      createdGenreDefinitions,
      hasChanges:
        base.changed ||
        mediaState.changes.new.length > 0 ||
        mediaState.changes.changed.length > 0 ||
        mediaState.changes.deleted.length > 0 ||
        tags.add.length > 0 ||
        tags.remove.length > 0 ||
        createdTagDefinitions.length > 0 ||
        genres.add.length > 0 ||
        genres.remove.length > 0 ||
        createdGenreDefinitions.length > 0,
    };
  }

  function buildSavePlan(changes) {
    const steps = [];
    const baseChanged = Boolean(changes.base && changes.base.changed);
    const mediaChanged = Boolean(
      changes.mediaState &&
      changes.mediaState.changes &&
      (
        changes.mediaState.changes.new.length > 0 ||
        changes.mediaState.changes.changed.length > 0 ||
        changes.mediaState.changes.deleted.length > 0
      ),
    );
    const tagCreateChanged = Array.isArray(changes.createdTagDefinitions) && changes.createdTagDefinitions.length > 0;
    const tagsChanged = Boolean(
      changes.tags &&
      (
        changes.tags.add.length > 0 ||
        changes.tags.remove.length > 0 ||
        tagCreateChanged
      ),
    );
    const genreCreateChanged = Array.isArray(changes.createdGenreDefinitions) && changes.createdGenreDefinitions.length > 0;
    const genresChanged = Boolean(
      changes.genres &&
      (
        changes.genres.add.length > 0 ||
        changes.genres.remove.length > 0 ||
        genreCreateChanged
      ),
    );

    if (baseChanged) {
      steps.push({ key: 'base', label: 'Сохраняем основные поля' });
    }
    if (mediaChanged) {
      steps.push({ key: 'media', label: 'Обновляем изображения' });
    }
    if (tagCreateChanged) {
      steps.push({ key: 'tag-create', label: 'Создаем теги' });
    }
    if (tagsChanged) {
      steps.push({ key: 'tags', label: 'Синхронизируем теги' });
    }
    if (genreCreateChanged) {
      steps.push({ key: 'genre-create', label: 'Создаем жанры' });
    }
    if (genresChanged) {
      steps.push({ key: 'genres', label: 'Синхронизируем жанры' });
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
    return 'Обновляем изображения';
  }

  function hasUnsavedChanges() {
    if (saveInProgress || deleteInProgress) {
      return true;
    }

    try {
      return collectGameChanges().hasChanges;
    } catch (error) {
      return true;
    }
  }

  async function syncAssociations(endpoint, ids, idField, progress, stepKey, label) {
    const total = Array.isArray(ids) ? ids.length : 0;
    let index = 0;

    for (const relationId of ids) {
      index += 1;
      if (progress && typeof progress.setStep === 'function' && stepKey) {
        progress.setStep(stepKey, 'active', `${label} ${index}/${total}`);
      }

      const pathParams = { game_id: String(gameId) };
      pathParams[idField] = String(relationId);
      await sendJson(endpoint, {}, pathParams);
    }
  }

  async function syncMedia(changes, progress) {
    if (!resourceApi || !changes) return;

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
          await resourceApi.uploadNewResourceFile(entry.item, progress);
        } else if (entry.item.url) {
          await resourceApi.addResourceUrl(entry.item);
        }
        continue;
      }

      if (entry.kind === 'changed') {
        await resourceApi.editResource(entry.item);
        continue;
      }

      await resourceApi.deleteResource(entry.id);
    }
  }

  function toggleDeleteGameButton() {
    const confirmInput = document.getElementById('delete-game-confirm');
    if (!confirmInput || !deleteButton || deleteInProgress) return;
    deleteButton.disabled = !confirmInput.checked;
  }

  async function deleteGame() {
    const confirmInput = document.getElementById('delete-game-confirm');
    if (!confirmInput || !confirmInput.checked || deleteInProgress) return;
    if (!confirm('Удалить игру без возможности восстановления?')) return;

    deleteInProgress = true;
    setButtonBusy(deleteButton, true);

    try {
      await sendJson(apiPaths.game.delete, {}, { game_id: String(gameId) });
      showToast('Удалено', 'Игра удалена', 'success');
      if (unloadGuard) {
        unloadGuard.suppressOnce();
      }
      window.location.href = '/?sgame=yes';
    } catch (error) {
      showToast('Ошибка', error.message || String(error), 'danger');
      deleteInProgress = false;
      toggleDeleteGameButton();
    }
  }

  async function saveGameChanges() {
    if (saveInProgress) return;

    let saveCompleted = false;

    try {
      const changes = collectGameChanges();
      const base = changes.base;
      const savePlan = buildSavePlan(changes);
      const hasStep = function (stepKey) {
        return savePlan.some(function (step) {
          return step.key === stepKey;
        });
      };

      if (!changes.hasChanges) {
        showToast('Нечего сохранять', 'Нет изменений', 'info');
        return;
      }

      if (changes.mediaState.hasInvalidUrls) {
        showToast('Проверьте изображения', 'Исправьте некорректные данные ресурсов перед сохранением', 'warning');
        return;
      }

      saveInProgress = true;
      setButtonBusy(saveButton, true);

      if (saveProgress) {
        saveProgress.start({
          title: 'Сохраняем игру',
          message: 'Не закрывайте страницу до завершения сохранения.',
          steps: savePlan,
        });
      }

      if (hasStep('base')) {
        if (saveProgress) {
          saveProgress.setStep('base', 'active');
        }
        await sendJson(apiPaths.game.edit, base.payload, { game_id: String(gameId) });
      }

      if (hasStep('media')) {
        if (saveProgress) {
          saveProgress.setStep('media', 'active');
        }
        await syncMedia(changes.mediaState.changes, saveProgress);
      }

      let createdTagIds = [];
      if (hasStep('tag-create')) {
        if (saveProgress) {
          saveProgress.setStep('tag-create', 'active');
        }
        createdTagIds = changes.createdTagDefinitions.length > 0
          ? await createNamedEntities(
            apiPaths.tag.add,
            'name',
            changes.createdTagDefinitions,
            function (tempId, realId) {
              if (changes.tagsEditor) {
                changes.tagsEditor.finalizeCreated(tempId, realId);
              }
            },
            saveProgress,
            'tag-create',
            'Создаем теги',
          )
          : [];
      }

      const tagIdsToAdd = changes.tags.add.concat(createdTagIds);
      if (hasStep('tags')) {
        if (saveProgress) {
          saveProgress.setStep('tags', 'active');
        }
        if (tagIdsToAdd.length > 0) {
          await syncAssociations(apiPaths.game.tags_add, tagIdsToAdd, 'tag_id', saveProgress, 'tags', 'Привязываем теги');
        }
        if (changes.tags.remove.length > 0) {
          await syncAssociations(apiPaths.game.tags_delete, changes.tags.remove, 'tag_id', saveProgress, 'tags', 'Удаляем теги');
        }
      }

      let createdGenreIds = [];
      if (hasStep('genre-create')) {
        if (saveProgress) {
          saveProgress.setStep('genre-create', 'active');
        }
        createdGenreIds = changes.createdGenreDefinitions.length > 0
          ? await createNamedEntities(
            apiPaths.genre.add,
            'name',
            changes.createdGenreDefinitions,
            function (tempId, realId) {
              if (changes.genresEditor) {
                changes.genresEditor.finalizeCreated(tempId, realId);
              }
            },
            saveProgress,
            'genre-create',
            'Создаем жанры',
          )
          : [];
      }

      const genreIdsToAdd = changes.genres.add.concat(createdGenreIds);
      if (hasStep('genres')) {
        if (saveProgress) {
          saveProgress.setStep('genres', 'active');
        }
        if (genreIdsToAdd.length > 0) {
          await syncAssociations(apiPaths.game.genres_add, genreIdsToAdd, 'genre_id', saveProgress, 'genres', 'Привязываем жанры');
        }
        if (changes.genres.remove.length > 0) {
          await syncAssociations(apiPaths.game.genres_delete, changes.genres.remove, 'genre_id', saveProgress, 'genres', 'Удаляем жанры');
        }
      }

      if (saveProgress) {
        saveProgress.setStep('finish', 'active', 'Подготовка к перезагрузке...');
        saveProgress.setStep('finish', 'complete', 'Изменения сохранены');
        saveProgress.setStep('reloading', 'active', 'Перезагружаем страницу...');
        saveProgress.setProgress(100);
      }

      showToast('Готово', 'Изменения игры сохранены', 'success');
      saveCompleted = true;
      await waitForReloadPaint();
      if (unloadGuard) {
        unloadGuard.suppressOnce();
      }
      window.location.reload();
    } catch (error) {
      if (saveProgress) {
        saveProgress.fail(error && error.message ? error.message : 'Не удалось сохранить изменения игры');
      }
      showToast('Ошибка', error.message || String(error), 'danger');
    } finally {
      saveInProgress = false;
      setButtonBusy(saveButton, false);
      if (saveProgress && !saveCompleted) {
        saveProgress.close();
      }
    }
  }

  const resourceApi = editRuntime
    ? editRuntime.requireFactory('mod-edit-api')({
      apiPaths,
      entityId: gameId,
      resourceOwnerType: 'games',
    })
    : null;

  const mediaManager = editRuntime
    ? editRuntime.requireFactory('mod-edit-media-manager')({
      root: root.querySelector('#media-manager'),
    })
    : null;

  if (editRuntime && typeof editRuntime.bindBeforeUnload === 'function') {
    unloadGuard = editRuntime.bindBeforeUnload(hasUnsavedChanges);
  }

  if (editRuntime) {
    editRuntime.initPage(root, { fadeInDelay: 250 });
    editRuntime.bindPager(document.querySelector('#start-page-button'));
  }

  initCatalogPreview();
  bindPickerState(tagsEditorId, function (state) {
    tagsPickerState = state;
  });
  bindPickerState(genresEditorId, function (state) {
    genresPickerState = state;
  });

  root.addEventListener('click', function (event) {
    const actionNode = event.target instanceof Element ? event.target.closest('[data-action]') : null;
    if (!actionNode) return;

    const action = actionNode.dataset.action;
    if (action === 'game-save') {
      saveGameChanges();
      return;
    }
    if (action === 'game-delete') {
      deleteGame();
    }
  });

  root.addEventListener('change', function (event) {
    const target = event.target;
    if (!(target instanceof Element)) return;

    if (target.matches('[data-action="game-delete-toggle"]')) {
      toggleDeleteGameButton();
    }
  });

  toggleDeleteGameButton();
})();
