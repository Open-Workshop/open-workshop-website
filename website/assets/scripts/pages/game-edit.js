/* eslint-env browser */

(function () {
  const root = document.getElementById('main-game-edit');
  if (!root) return;

  const apiPaths = window.OWCore.getApiPaths();
  const gameId = Number(root.dataset.gameId || 0);
  const genresPath = apiPaths.genre.list.path;
  const selectedGenresRoot = document.getElementById('game-genres-selected');
  const searchGenresRoot = document.getElementById('game-genres-search-list');
  const genresSearchInput = document.getElementById('search-update-input-genres');
  const saveButton = document.getElementById('save-game-button');
  const deleteButton = document.getElementById('delete-game-button');

  let saveInProgress = false;
  let deleteInProgress = false;
  let pendingGenreCreateCounter = 0;
  let genreSearchRequestCounter = 0;

  function showToast(title, text, theme = 'info') {
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
    const textarea = document.querySelector(panelSelector + ' textarea.editing');
    return textarea ? String(textarea.value || '') : '';
  }

  function getEditorStartValue(panelSelector) {
    const textarea = document.querySelector(panelSelector + ' textarea.editing');
    return textarea ? String(textarea.getAttribute('startdata') || '') : '';
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

  function getEntityNameKey(value) {
    return normalizeEntityName(value).toLocaleLowerCase('ru-RU');
  }

  function buildGenresUrl(params = {}) {
    const query = new URLSearchParams();

    Object.entries(params).forEach(([key, value]) => {
      query.set(key, String(value ?? ''));
    });

    const queryString = query.toString();
    return queryString === ''
      ? window.OWCore.apiUrl(genresPath)
      : `${window.OWCore.apiUrl(genresPath)}?${queryString}`;
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

    const responseText = await response.text().catch(() => '');
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
      const responseText = await response.text().catch(() => '');
      const createdId = parseCreatedEntityId(responseText, entityName);

      finalizeCallback(item.tempId, createdId);
      createdIds.push(createdId);
    }

    return createdIds;
  }

  function createGenreElement(genreId, genreName, options = {}) {
    const {
      saved = false,
      pendingCreate = false,
      selected = false,
      showRemoveIcon = true,
    } = options;

    const normalizedName = normalizeEntityName(genreName);
    const element = document.createElement('div');
    element.classList.add('taglike-item', 'element');
    element.setAttribute('genreid', String(genreId));
    element.dataset.genreName = normalizedName;
    if (saved) {
      element.setAttribute('saved', '');
    }
    if (pendingCreate) {
      element.dataset.pendingCreate = 'true';
    }
    if (selected) {
      element.classList.add('genre-selected');
    }

    const content = document.createElement('e');
    const title = document.createElement('h3');
    title.setAttribute('translate', 'no');
    title.textContent = normalizedName;

    content.appendChild(title);
    if (showRemoveIcon) {
      const removeIcon = document.createElement('img');
      removeIcon.src = '/assets/images/removal-triangle.svg';
      removeIcon.alt = 'Кнопка удаления жанра';
      content.appendChild(removeIcon);
    }
    element.appendChild(content);
    element.addEventListener('click', function () {
      window.GameGenres.toggle(element);
    });
    return element;
  }

  function getGenreName(node) {
    if (!node) return '';
    if (node.dataset && node.dataset.genreName) {
      return normalizeEntityName(node.dataset.genreName);
    }
    const title = node.querySelector('h3');
    return title ? normalizeEntityName(title.textContent) : '';
  }

  function getSearchGenreNode(genreId) {
    return searchGenresRoot ? searchGenresRoot.querySelector('[genreid="' + genreId + '"]') : null;
  }

  function getSelectedGenreNode(genreId) {
    return selectedGenresRoot ? selectedGenresRoot.querySelector('[genreid="' + genreId + '"]') : null;
  }

  function isGenreSelected(genreId) {
    const selectedNode = getSelectedGenreNode(genreId);
    return Boolean(selectedNode && !selectedNode.classList.contains('none-display'));
  }

  function isPendingGenre(node) {
    return Boolean(node && node.dataset && node.dataset.pendingCreate === 'true');
  }

  function isGenreVisible(node) {
    return Boolean(node) && !node.classList.contains('none-display');
  }

  function findGenreByName(rootNode, nameKey) {
    if (!rootNode) return null;

    return Array.from(rootNode.querySelectorAll('[genreid]')).find(function (node) {
      return getEntityNameKey(getGenreName(node)) === nameKey;
    }) || null;
  }

  function resetGenreSearchRoot() {
    if (!searchGenresRoot) return null;

    const emptyState = searchGenresRoot.querySelector('p');
    const detachedEmptyState = emptyState ? emptyState.cloneNode(true) : null;
    searchGenresRoot.innerHTML = '';

    if (detachedEmptyState) {
      detachedEmptyState.textContent = 'Не найдено';
      searchGenresRoot.appendChild(detachedEmptyState);
    }

    return detachedEmptyState;
  }

  function getPendingSelectedGenres() {
    if (!selectedGenresRoot) return [];

    return Array.from(selectedGenresRoot.querySelectorAll('[genreid]')).filter(function (node) {
      return isPendingGenre(node) && isGenreVisible(node);
    });
  }

  function syncPendingGenresToSearch(queryKey) {
    if (!searchGenresRoot) return;

    const existingIds = new Set(
      Array.from(searchGenresRoot.querySelectorAll('[genreid]')).map(function (node) {
        return String(node.getAttribute('genreid') || '');
      }),
    );

    getPendingSelectedGenres().forEach(function (node) {
      const genreName = getGenreName(node);
      if (queryKey !== '' && !getEntityNameKey(genreName).includes(queryKey)) {
        return;
      }

      const genreId = String(node.getAttribute('genreid') || '');
      if (existingIds.has(genreId)) {
        const existingNode = getSearchGenreNode(genreId);
        if (existingNode) {
          existingNode.classList.add('genre-selected');
        }
        return;
      }

      searchGenresRoot.appendChild(
        createGenreElement(genreId, genreName, {
          pendingCreate: true,
          selected: true,
          showRemoveIcon: false,
        }),
      );
    });
  }

  async function fetchGenres(queryValue) {
    const response = await fetch(buildGenresUrl({ page_size: 30, name: queryValue }), {
      credentials: 'include',
    });

    if (!response.ok) {
      const responseText = await response.text().catch(() => '');
      throw new Error(parseResponseMessage(responseText, `Ошибка (${response.status})`));
    }

    const data = await response.json().catch(() => ({}));
    return Array.isArray(data.results) ? data.results : [];
  }

  function updateGenreSearchState(genreId) {
    const searchNode = getSearchGenreNode(genreId);
    if (!searchNode) return;

    searchNode.classList.toggle('genre-selected', isGenreSelected(genreId));
  }

  function triggerGenreHeightUpdate() {
    if (!selectedGenresRoot) return;
    $(selectedGenresRoot).parent().trigger('event-height');
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

    const sourcePairChanged =
      sourceValue !== startSourceValue || sourceIdValue !== startSourceIdValue;

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

  function collectTagChanges() {
    if (!window.TagsSelector || typeof window.TagsSelector.returnSelectedTags !== 'function') {
      return { add: [], remove: [] };
    }

    const selected = window.TagsSelector.returnSelectedTags();
    return {
      add: Array.isArray(selected.notStandardSelected) ? selected.notStandardSelected : [],
      remove: Array.isArray(selected.standardNotSelected) ? selected.standardNotSelected : [],
      create: Array.isArray(selected.pendingCreate) ? selected.pendingCreate : [],
    };
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

  window.GameGenres = {
    async refresh() {
      if (!searchGenresRoot) return;

      const queryValue = normalizeEntityName(genresSearchInput ? genresSearchInput.value : '');
      const queryKey = getEntityNameKey(queryValue);
      const requestId = ++genreSearchRequestCounter;

      try {
        const results = await fetchGenres(queryValue);
        if (requestId !== genreSearchRequestCounter) return;

        resetGenreSearchRoot();

        results.forEach(function (item) {
          const genreId = String(item.id || '');
          const genreNode = createGenreElement(genreId, item.name, {
            selected: isGenreSelected(genreId),
            showRemoveIcon: false,
          });
          searchGenresRoot.appendChild(genreNode);
        });

        syncPendingGenresToSearch(queryKey);
      } catch (error) {
        if (requestId !== genreSearchRequestCounter) return;
        showToast('Ошибка', error.message || String(error), 'danger');
      }
    },
    toggle(node) {
      const genreId = String(node.getAttribute('genreid') || '');
      if (genreId === '') return;

      const selectedNode = getSelectedGenreNode(genreId);
      const alreadySelected = Boolean(selectedNode && !selectedNode.classList.contains('none-display'));

      if (alreadySelected) {
        if (selectedNode.hasAttribute('saved')) {
          selectedNode.classList.add('none-display');
        } else {
          selectedNode.remove();
        }
      } else if (selectedNode) {
        selectedNode.classList.remove('none-display');
      } else {
        const genreName = getGenreName(node);
        if (selectedGenresRoot) {
          selectedGenresRoot.appendChild(createGenreElement(genreId, genreName));
        }
      }

      updateGenreSearchState(genreId);
      triggerGenreHeightUpdate();
    },
    queueCreate() {
      const genreName = normalizeEntityName(genresSearchInput ? genresSearchInput.value : '');
      const genreNameKey = getEntityNameKey(genreName);

      if (genreName === '') {
        showToast('Пустое имя', 'Введите название нового жанра', 'info');
        return;
      }

      const selectedGenre = findGenreByName(selectedGenresRoot, genreNameKey);
      if (selectedGenre) {
        if (!selectedGenre.classList.contains('none-display')) {
          showToast('Уже добавлено', 'Этот жанр уже выбран', 'info');
          return;
        }

        selectedGenre.classList.remove('none-display');
        updateGenreSearchState(String(selectedGenre.getAttribute('genreid') || ''));
        triggerGenreHeightUpdate();
        return;
      }

      const searchGenre = findGenreByName(searchGenresRoot, genreNameKey);
      if (searchGenre) {
        if (!searchGenre.classList.contains('genre-selected')) {
          window.GameGenres.toggle(searchGenre);
        } else {
          showToast('Уже добавлено', 'Этот жанр уже выбран', 'info');
        }
        return;
      }

      pendingGenreCreateCounter += 1;
      const pendingGenreId = 'pending-genre-' + pendingGenreCreateCounter;

      if (selectedGenresRoot) {
        selectedGenresRoot.appendChild(
          createGenreElement(pendingGenreId, genreName, {
            pendingCreate: true,
          }),
        );
      }

      if (searchGenresRoot) {
        searchGenresRoot.appendChild(
          createGenreElement(pendingGenreId, genreName, {
            pendingCreate: true,
            selected: true,
            showRemoveIcon: false,
          }),
        );
      }

      window.GameGenres.refresh();
      triggerGenreHeightUpdate();
    },
    finalizeCreated(tempId, realId) {
      document.querySelectorAll('[genreid="' + tempId + '"]').forEach(function (node) {
        node.setAttribute('genreid', String(realId));
        if (node.dataset) {
          delete node.dataset.pendingCreate;
        }
      });
    },
    getChanges() {
      if (!selectedGenresRoot) {
        return { add: [], remove: [], create: [] };
      }

      const allSelected = Array.from(selectedGenresRoot.querySelectorAll('[genreid]'));
      return {
        add: allSelected
          .filter((node) => !node.hasAttribute('saved') && !node.classList.contains('none-display') && !isPendingGenre(node))
          .map((node) => Number(node.getAttribute('genreid'))),
        remove: allSelected
          .filter((node) => node.hasAttribute('saved') && node.classList.contains('none-display'))
          .map((node) => Number(node.getAttribute('genreid'))),
        create: allSelected
          .filter((node) => !node.classList.contains('none-display') && isPendingGenre(node))
          .map((node) => ({
            tempId: String(node.getAttribute('genreid') || ''),
            name: getGenreName(node),
          })),
      };
    },
  };

  window.toggleDeleteGameButton = function toggleDeleteGameButton() {
    const confirmInput = document.getElementById('delete-game-confirm');
    if (!confirmInput || !deleteButton || deleteInProgress) return;
    deleteButton.disabled = !confirmInput.checked;
  };

  window.deleteGame = async function deleteGame() {
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
      window.toggleDeleteGameButton();
    }
  };

  window.saveGameChanges = async function saveGameChanges() {
    if (saveInProgress) return;

    try {
      const base = collectBaseChanges();
      const tags = collectTagChanges();
      const genres = window.GameGenres.getChanges();
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
          if (window.TagsSelector && typeof window.TagsSelector.finalizeCreatedTag === 'function') {
            window.TagsSelector.finalizeCreatedTag(tempId, realId);
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
          window.GameGenres.finalizeCreated(tempId, realId);
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
  };

  $(document).ready(function () {
    window.setTimeout(function () {
      $('#main-game-edit').css('opacity', 1);
    }, 250);

    const startButton = document.querySelector('#start-page-button');
    if (startButton && window.Pager) {
      Pager.updateSelect.call(startButton);
      window.addEventListener('popstate', function () {
        Pager.updateSelect.call(startButton);
      });
    }

    window.GameGenres.refresh();
    window.toggleDeleteGameButton();
  });
})();
