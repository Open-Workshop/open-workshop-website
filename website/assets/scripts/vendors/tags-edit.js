/* eslint-env browser */

(function () {
  if (!window.OWTaglikeSelector || !window.OWCore) return;

  const { getApiPaths, apiUrl } = window.OWCore;
  const apiPaths = getApiPaths();
  const tagsPath = apiPaths.tag.list.path;
  const noGameValues = new Set(['', '0', 'none', 'null', 'undefined']);

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

  function normalizeTagName(value) {
    return String(value || '').trim().replace(/\s+/g, ' ');
  }

  function parseNumericIds(items) {
    return items
      .map(function (item) {
        return Number(item.id);
      })
      .filter(Number.isFinite);
  }

  function getSearchInput() {
    return document.getElementById('search-update-input-tags');
  }

  function getNormalizedGameId() {
    const searchInput = getSearchInput();
    const rawGameId = String((searchInput && searchInput.getAttribute('gameid')) || '').trim();
    return noGameValues.has(rawGameId.toLowerCase()) ? '' : rawGameId;
  }

  function buildTagsUrl(params = {}) {
    const query = new URLSearchParams();
    const gameId = getNormalizedGameId();

    if (gameId !== '') {
      query.set('game_id', gameId);
    }

    Object.entries(params).forEach(function ([key, value]) {
      query.set(key, String(value ?? ''));
    });

    const queryString = query.toString();
    return queryString === '' ? apiUrl(tagsPath) : `${apiUrl(tagsPath)}?${queryString}`;
  }

  async function fetchTags(params = {}) {
    const response = await fetch(buildTagsUrl(params), { credentials: 'include' });
    if (!response.ok) {
      const responseText = await response.text().catch(() => '');
      throw new Error(parseResponseMessage(responseText, `Ошибка (${response.status})`));
    }

    return response.json().catch(() => ({}));
  }

  function createTagItemElement({ id, name, saved, selected, pendingCreate }) {
    const element = document.createElement('div');
    element.classList.add('taglike-item');
    element.setAttribute('tagid', String(id));
    element.dataset.taglikeName = normalizeTagName(name);
    element.textContent = normalizeTagName(name);

    if (saved) {
      element.setAttribute('saved', '');
    }

    if (selected) {
      element.classList.add('selected-tag');
    }

    if (pendingCreate) {
      element.setAttribute('data-pending-create', 'true');
    }

    return element;
  }

  function triggerHeightUpdate() {
    const selectedRoot = document.getElementById('tags-edit-selected-tags');
    if (!selectedRoot) return;
    $(selectedRoot).parent().parent().trigger('event-height');
  }

  const selector = window.OWTaglikeSelector.create({
    selectedRoot: '#tags-edit-selected-tags',
    searchRoot: '#tags-edit-search-tags',
    searchInput: '#search-update-input-tags',
    showMoreCounter: '#show-more-count-tags',
    idAttribute: 'tagid',
    selectedClass: 'selected-tag',
    pendingPrefix: 'pending-tag',
    searchEmptyText: 'Не найдено',
    emptyNameMessage: 'Введите название нового тега',
    duplicateMessage: 'Этот тег уже выбран',
    createItemElement: createTagItemElement,
    async fetchSearchResults(queryValue) {
      const data = await fetchTags({ page_size: 30, name: queryValue });
      return {
        results: Array.isArray(data.results) ? data.results : [],
        databaseSize: Number(data.database_size),
      };
    },
    async fetchItemsByIds(ids) {
      const data = await fetchTags({ tags_ids: '[' + ids.join(',') + ']' });
      return Array.isArray(data.results) ? data.results : [];
    },
    onSelectionChange: triggerHeightUpdate,
  });

  if (!selector) return;

  window.TagsSelector = {
    searchRequestTagUpdate: selector.refresh,
    editTag: selector.toggle,
    queueCreate: selector.queueCreate,
    unselectAllTags: selector.unselectAll,
    async setDefaultSelectedTags(tags) {
      const ids = String(tags || '')
        .split(',')
        .map(function (item) {
          return String(item).trim();
        })
        .filter(function (item) {
          return /^\d+$/.test(item);
        });

      await selector.setDefaultSelected(ids);
    },
    finalizeCreatedTag: selector.finalizeCreated,
    returnSelectedTags() {
      const state = selector.getState();

      return {
        standard: parseNumericIds(state.savedAll),
        standardSelected: parseNumericIds(state.savedVisible),
        standardNotSelected: parseNumericIds(state.savedHidden),
        notStandardSelected: parseNumericIds(state.unsavedVisible),
        pendingCreate: state.pendingVisible.map(function (item) {
          return {
            tempId: item.id,
            name: item.name,
          };
        }),
        selected: parseNumericIds(state.visible),
      };
    },
  };
})();
