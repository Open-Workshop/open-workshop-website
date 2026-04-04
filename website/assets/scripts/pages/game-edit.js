/* eslint-env browser */

(function () {
  const root = document.getElementById('main-game-edit');
  if (!root) return;

  const apiPaths = window.OWCore.getApiPaths();
  const gameId = Number(root.dataset.gameId || 0);
  const selectedGenresRoot = document.getElementById('game-genres-selected');
  const searchGenresRoot = document.getElementById('game-genres-search-list');
  const genresSearchInput = document.getElementById('search-update-input-genres');
  const saveButton = document.getElementById('save-game-button');
  const deleteButton = document.getElementById('delete-game-button');

  let saveInProgress = false;
  let deleteInProgress = false;

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

  function createGenreElement(genreId, genreName, saved = false) {
    const element = document.createElement('div');
    element.classList.add('element');
    element.setAttribute('genreid', String(genreId));
    if (saved) {
      element.setAttribute('saved', '');
    }

    const content = document.createElement('e');
    const title = document.createElement('h3');
    title.setAttribute('translate', 'no');
    title.textContent = genreName;

    const removeIcon = document.createElement('img');
    removeIcon.src = '/assets/images/removal-triangle.svg';
    removeIcon.alt = 'Кнопка удаления жанра';

    content.append(title, removeIcon);
    element.appendChild(content);
    element.addEventListener('click', function () {
      window.GameGenres.toggle(element);
    });
    return element;
  }

  function getGenreName(node) {
    const title = node ? node.querySelector('h3') : null;
    return title ? String(title.textContent || '').trim() : '';
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
    refresh() {
      if (!searchGenresRoot) return;

      const query = genresSearchInput ? String(genresSearchInput.value || '').trim().toLowerCase() : '';

      searchGenresRoot.querySelectorAll('[genreid]').forEach(function (node) {
        const name = getGenreName(node).toLowerCase();
        const visible = query === '' || name.includes(query);
        node.classList.toggle('none-display', !visible);
        node.classList.toggle('genre-selected', isGenreSelected(String(node.getAttribute('genreid') || '')));
      });
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
    getChanges() {
      if (!selectedGenresRoot) {
        return { add: [], remove: [] };
      }

      const allSelected = Array.from(selectedGenresRoot.querySelectorAll('[genreid]'));
      return {
        add: allSelected
          .filter((node) => !node.hasAttribute('saved') && !node.classList.contains('none-display'))
          .map((node) => Number(node.getAttribute('genreid'))),
        remove: allSelected
          .filter((node) => node.hasAttribute('saved') && node.classList.contains('none-display'))
          .map((node) => Number(node.getAttribute('genreid'))),
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
      const hasChanges =
        base.changed ||
        tags.add.length > 0 ||
        tags.remove.length > 0 ||
        genres.add.length > 0 ||
        genres.remove.length > 0;

      if (!hasChanges) {
        showToast('Нечего сохранять', 'Нет изменений', 'info');
        return;
      }

      saveInProgress = true;
      setButtonBusy(saveButton, true);

      if (base.changed) {
        await sendForm(apiPaths.game.edit, base.params);
      }

      if (tags.add.length > 0) {
        await syncAssociations(apiPaths.game.tag_association, tags.add, 'tag_id', true);
      }

      if (tags.remove.length > 0) {
        await syncAssociations(apiPaths.game.tag_association, tags.remove, 'tag_id', false);
      }

      if (genres.add.length > 0) {
        await syncAssociations(apiPaths.game.genre_association, genres.add, 'genre_id', true);
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
