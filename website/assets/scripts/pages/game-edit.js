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

  function getPickerChanges(editorId) {
    const editor = getPickerEditor(editorId);
    if (!editor) {
      return { add: [], remove: [], create: [] };
    }

    const state = editor.getState();
    return {
      add: parseNumericIds(state.unsavedVisible),
      remove: parseNumericIds(state.savedHidden),
      create: state.pendingVisible.map(function (item) {
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

  function initCatalogPreview() {
    if (!editRuntime) return null;

    const createPreview = editRuntime.requireFactory('game-edit-catalog-preview');
    const preview = createPreview({
      root: root.querySelector('.game-edit__catalog-cards'),
      titleInput: root.querySelector('#game-name'),
      descriptionRoot: root.querySelector('#game-short-desc-panel'),
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

  async function createNamedEntities(endpoint, fieldName, items, finalizeCallback) {
    const createdIds = [];

    for (const item of items) {
      const entityName = normalizeEntityName(item.name);
      if (entityName === '') continue;

      const response = await sendJson(endpoint, { [fieldName]: entityName });
      const createdId = parseCreatedEntityId(response.data, entityName);

      finalizeCallback(item.tempId, createdId);
      createdIds.push(createdId);
    }

    return createdIds;
  }

  function collectBaseChanges() {
    const nameValue = getTextValue('#game-name');
    const typeValue = getTextValue('#game-type');
    const shortDescValue = getEditorValue('#game-short-desc-panel');
    const descValue = getEditorValue('#game-full-desc-panel');
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

    if (shortDescValue !== getEditorStartValue('#game-short-desc-panel')) {
      changed = true;
    }

    if (descValue !== getEditorStartValue('#game-full-desc-panel')) {
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
        ...(shortDescValue !== getEditorStartValue('#game-short-desc-panel') ? { short_description: shortDescValue } : {}),
        ...(descValue !== getEditorStartValue('#game-full-desc-panel') ? { description: descValue } : {}),
        ...(sourcePairChanged ? { source: sourceValue, source_id: Number(sourceIdValue) } : {}),
      },
    };
  }

  async function syncAssociations(endpoint, ids, idField, mode) {
    for (const relationId of ids) {
      const pathParams = { game_id: String(gameId) };
      pathParams[idField] = String(relationId);
      const action = mode ? 'add' : 'delete';
      const assocEndpoint = {
        ...endpoint,
        path: endpoint.path.replace('_association', `_${action}`),
      };
      await sendJson(assocEndpoint, {}, pathParams);
    }
  }

  async function syncMedia(changes) {
    if (!resourceApi || !changes) return;

    for (const item of changes.new) {
      if (item.file) {
        await resourceApi.uploadNewResourceFile(item);
      } else if (item.url) {
        await resourceApi.addResourceUrl(item);
      }
    }

    for (const item of changes.changed) {
      await resourceApi.editResource(item);
    }

    for (const id of changes.deleted) {
      await resourceApi.deleteResource(id);
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
      window.location.href = '/?sgame=yes';
    } catch (error) {
      showToast('Ошибка', error.message || String(error), 'danger');
      deleteInProgress = false;
      toggleDeleteGameButton();
    }
  }

  async function saveGameChanges() {
    if (saveInProgress) return;

    try {
      const base = collectBaseChanges();
      const mediaState = mediaManager && typeof mediaManager.getState === 'function'
        ? mediaManager.getState()
        : { changes: { new: [], changed: [], deleted: [] }, hasInvalidUrls: false };
      const tags = getPickerChanges(tagsEditorId);
      const genres = getPickerChanges(genresEditorId);
      const tagsEditor = getPickerEditor(tagsEditorId);
      const genresEditor = getPickerEditor(genresEditorId);
      const createdTagDefinitions = Array.isArray(tags.create) ? tags.create : [];
      const createdGenreDefinitions = Array.isArray(genres.create) ? genres.create : [];
      const hasChanges =
        base.changed ||
        mediaState.changes.new.length > 0 ||
        mediaState.changes.changed.length > 0 ||
        mediaState.changes.deleted.length > 0 ||
        tags.add.length > 0 ||
        tags.remove.length > 0 ||
        createdTagDefinitions.length > 0 ||
        genres.add.length > 0 ||
        genres.remove.length > 0 ||
        createdGenreDefinitions.length > 0;

      if (!hasChanges) {
        showToast('Нечего сохранять', 'Нет изменений', 'info');
        return;
      }

      if (mediaState.hasInvalidUrls) {
        showToast('Проверьте изображения', 'Исправьте некорректные данные ресурсов перед сохранением', 'warning');
        return;
      }

      saveInProgress = true;
      setButtonBusy(saveButton, true);

      if (base.changed) {
        await sendJson(apiPaths.game.edit, base.payload);
      }

      await syncMedia(mediaState.changes);

      const createdTagIds = createdTagDefinitions.length > 0
        ? await createNamedEntities(apiPaths.tag.add, 'name', createdTagDefinitions, function (tempId, realId) {
          if (tagsEditor) {
            tagsEditor.finalizeCreated(tempId, realId);
          }
        })
        : [];

      const tagIdsToAdd = tags.add.concat(createdTagIds);
      if (tagIdsToAdd.length > 0) {
        await syncAssociations(apiPaths.game.tag_association, tagIdsToAdd, 'tag_id', true);
      }

      if (tags.remove.length > 0) {
        await syncAssociations(apiPaths.game.tag_association, tags.remove, 'tag_id', false);
      }

      const createdGenreIds = createdGenreDefinitions.length > 0
        ? await createNamedEntities(apiPaths.genre.add, 'name', createdGenreDefinitions, function (tempId, realId) {
          if (genresEditor) {
            genresEditor.finalizeCreated(tempId, realId);
          }
        })
        : [];

      const genreIdsToAdd = genres.add.concat(createdGenreIds);
      if (genreIdsToAdd.length > 0) {
        await syncAssociations(apiPaths.game.genre_association, genreIdsToAdd, 'genre_id', true);
      }

      if (genres.remove.length > 0) {
        await syncAssociations(apiPaths.game.genre_association, genres.remove, 'genre_id', false);
      }

      showToast('Готово', 'Изменения игры сохранены', 'success');
      window.location.reload();
    } catch (error) {
      showToast('Ошибка', error.message || String(error), 'danger');
      saveInProgress = false;
      setButtonBusy(saveButton, false);
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

  if (editRuntime) {
    editRuntime.initPage(root, { fadeInDelay: 250 });
    editRuntime.bindPager(document.querySelector('#start-page-button'));
  }

  initCatalogPreview();

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
