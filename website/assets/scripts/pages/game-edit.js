/* eslint-env browser */

(function () {
  const root = document.getElementById('main-game-edit');
  if (!root) return;

  const apiPaths = window.OWCore.getApiPaths();
  const gameId = Number(root.dataset.gameId || 0);
  const saveButton = document.getElementById('save-game-button');
  const deleteButton = document.getElementById('delete-game-button');
  const tagsEditorId = 'game-tags-editor';
  const genresEditorId = 'game-genres-editor';

  let saveInProgress = false;
  let deleteInProgress = false;

  function showToast(title, text, theme) {
    new Toast({
      title,
      text,
      theme,
      autohide: true,
      interval: 5000,
    });
  }

  function setButtonBusy(button, busy) {
    if (!button) return;
    button.disabled = busy;
    button.classList.toggle('disabled', busy);
  }

  function getTextValue(selector) {
    const node = document.querySelector(selector);
    return node ? String(node.value || '') : '';
  }

  function getStartValue(selector) {
    const node = document.querySelector(selector);
    return node ? String(node.getAttribute('startdata') || '') : '';
  }

  function getEditorValue(panelSelector) {
    const descRoot = document.querySelector(panelSelector + ' .desc-edit');
    if (window.OWDescEditors) {
      return String(window.OWDescEditors.getValue(descRoot) || '');
    }
    return '';
  }

  function getEditorStartValue(panelSelector) {
    const descRoot = document.querySelector(panelSelector + ' .desc-edit');
    if (window.OWDescEditors) {
      return String(window.OWDescEditors.getStartValue(descRoot) || '');
    }
    return '';
  }

  function parseResponseMessage(text, fallback) {
    if (!text) return fallback;

    try {
      const parsed = JSON.parse(text);
      if (typeof parsed === 'string') return parsed;
      if (parsed && typeof parsed.detail === 'string') return parsed.detail;
      if (parsed && typeof parsed.message === 'string') return parsed.message;
    } catch (error) {
      return text.replace(/^"(.*)"$/, '$1');
    }

    return fallback;
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
      if (parsed && typeof parsed.result === 'number') {
        return parsed.result;
      }
    } catch (error) {
      const numericMatch = String(text).match(/\d+/);
      if (numericMatch) {
        return Number(numericMatch[0]);
      }
    }

    throw new Error('Не удалось разобрать ID для "' + entityLabel + '"');
  }

  async function sendForm(endpoint, params) {
    const response = await fetch(window.OWCore.apiUrl(endpoint.path), {
      method: endpoint.method,
      credentials: 'include',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        Accept: 'application/json, text/plain, */*',
      },
      body: params.toString(),
    });

    if (response.ok) {
      return response;
    }

    const responseText = await response.text().catch(function () { return ''; });
    throw new Error(parseResponseMessage(responseText, `Ошибка (${response.status})`));
  }

  async function createNamedEntities(endpoint, fieldName, items, finalizeCallback) {
    const createdIds = [];

    for (const item of items) {
      const entityName = normalizeEntityName(item.name);
      if (entityName === '') continue;

      const params = new URLSearchParams();
      params.set(fieldName, entityName);

      const response = await sendForm(endpoint, params);
      const responseText = await response.text().catch(function () { return ''; });
      const createdId = parseCreatedEntityId(responseText, entityName);

      finalizeCallback(item.tempId, createdId);
      createdIds.push(createdId);
    }

    return createdIds;
  }

  function collectBaseChanges() {
    const params = new URLSearchParams();
    params.set('game_id', String(gameId));

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
      params.set('game_name', nameValue);
      changed = true;
    }

    if (typeValue !== getStartValue('#game-type')) {
      params.set('game_type', typeValue);
      changed = true;
    }

    if (shortDescValue !== getEditorStartValue('#game-short-desc-panel')) {
      params.set('game_short_desc', shortDescValue);
      changed = true;
    }

    if (descValue !== getEditorStartValue('#game-full-desc-panel')) {
      params.set('game_desc', descValue);
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

      params.set('game_source', sourceValue);
      params.set('game_source_id', sourceIdValue);
      changed = true;
    }

    return { changed, params };
  }

  async function syncAssociations(endpoint, ids, idField, mode) {
    for (const relationId of ids) {
      const params = new URLSearchParams();
      params.set('game_id', String(gameId));
      params.set('mode', mode ? 'true' : 'false');
      params.set(idField, String(relationId));
      await sendForm(endpoint, params);
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
      const params = new URLSearchParams();
      params.set('game_id', String(gameId));
      await sendForm(apiPaths.game.delete, params);
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
      const tags = getPickerChanges(tagsEditorId);
      const genres = getPickerChanges(genresEditorId);
      const tagsEditor = getPickerEditor(tagsEditorId);
      const genresEditor = getPickerEditor(genresEditorId);
      const createdTagDefinitions = Array.isArray(tags.create) ? tags.create : [];
      const createdGenreDefinitions = Array.isArray(genres.create) ? genres.create : [];
      const hasChanges =
        base.changed ||
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

      saveInProgress = true;
      setButtonBusy(saveButton, true);

      if (base.changed) {
        await sendForm(apiPaths.game.edit, base.params);
      }

      const createdTagIds = createdTagDefinitions.length > 0
        ? await createNamedEntities(apiPaths.tag.add, 'tag_name', createdTagDefinitions, function (tempId, realId) {
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
        ? await createNamedEntities(apiPaths.genre.add, 'genre_name', createdGenreDefinitions, function (tempId, realId) {
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

  window.setTimeout(function () {
    root.style.opacity = 1;
  }, 250);

  const startButton = document.querySelector('#start-page-button');
  if (startButton && window.Pager) {
    Pager.updateSelect.call(startButton);
    window.addEventListener('popstate', function () {
      Pager.updateSelect.call(startButton);
    });
  }

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
