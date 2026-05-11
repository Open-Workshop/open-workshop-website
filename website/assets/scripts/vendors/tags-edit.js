/* eslint-env browser */

(function () {
  if (!window.OWPickerEditors || !window.OWCore) return;

  const { getApiPaths, apiUrl, formatPath } = window.OWCore;
  const apiPaths = getApiPaths();
  const tagsPath = apiPaths.tag.list.path;
  const gameTagsEndpoint = apiPaths.game && apiPaths.game.tags ? apiPaths.game.tags : null;
  const tagGroupTagsEndpoint = apiPaths.tag_group && apiPaths.tag_group.tags ? apiPaths.tag_group.tags : null;
  const noGameValues = new Set(['', '0', 'none', 'null', 'undefined']);
  const CATALOG_TAG_FILTER_MODES = {
    tags: 'tags',
    excluded_tags: 'excluded_tags',
  };

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

  function normalizeTagFilterMode(value) {
    const normalized = String(value || '').trim();
    return normalized === CATALOG_TAG_FILTER_MODES.excluded_tags
      ? CATALOG_TAG_FILTER_MODES.excluded_tags
      : CATALOG_TAG_FILTER_MODES.tags;
  }

  function normalizeGameId(value) {
    const rawValue = String(value || '').trim();
    return noGameValues.has(rawValue.toLowerCase()) ? '' : rawValue;
  }

  function normalizeTagGroupId(value) {
    const rawValue = String(value || '').trim();
    return noGameValues.has(rawValue.toLowerCase()) ? '' : rawValue;
  }

  function isUngroupedTagsContext(context) {
    const normalized = String(context && (context.tagUngroupedOnly || context.tag_ungrouped_only) || '').trim().toLowerCase();
    return normalized === 'true';
  }

  function isUngroupedTagsEditor(root) {
    if (!root) return false;
    return root.dataset.pickerContextTagUngroupedOnly === 'true';
  }

  function isCatalogEditor(root) {
    if (!root) return false;
    if (root.id === 'catalog-tags-editor') return true;
    if (root.dataset.catalogTagFilter === 'true') return true;
    return root.id.indexOf('catalog-tag-group-') === 0;
  }

  function getCatalogTagMode(itemId) {
    if (window.OWCatalogTags && typeof window.OWCatalogTags.getItemMode === 'function') {
      return normalizeTagFilterMode(window.OWCatalogTags.getItemMode(String(itemId || '')));
    }

    return CATALOG_TAG_FILTER_MODES.tags;
  }

  function applyCatalogTagModeToElement(element, mode, selected) {
    const normalizedMode = normalizeTagFilterMode(mode);
    const isSelected = typeof selected === 'boolean' ? selected : false;

    element.dataset.catalogTagFilterMode = normalizedMode;
    element.dataset.catalogTagFilterSelected = isSelected ? 'true' : 'false';

    element.querySelectorAll('[data-action="catalog-tags-mode"]').forEach(function (button) {
      const buttonMode = normalizeTagFilterMode(button.dataset.tagMode);
      const isActive = buttonMode === normalizedMode;
      button.classList.toggle('is-active', isActive);
      button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    });
  }

  function getTagsPathForContext(context) {
    const tagUngroupedOnly = isUngroupedTagsContext(context);
    const tagGroupId = normalizeTagGroupId(context && context.tagGroupId);
    const gameId = normalizeGameId(context && context.gameId);
    if (tagGroupId && tagGroupTagsEndpoint && tagGroupTagsEndpoint.path) {
      return formatPath(tagGroupTagsEndpoint.path, { group_id: tagGroupId });
    }

    if (tagUngroupedOnly) {
      return tagsPath;
    }

    if (gameId !== '' && gameTagsEndpoint && gameTagsEndpoint.path) {
      return formatPath(gameTagsEndpoint.path, { game_id: gameId });
    }

    return tagsPath;
  }

  function buildTagsUrl(params, context) {
    const query = new URLSearchParams();

    Object.entries(params || {}).forEach(function ([key, value]) {
      if (Array.isArray(value)) {
        value.forEach(function (item) {
          if (item === undefined || item === null || item === '') return;
          query.append(key, String(item));
        });
        return;
      }
      if (value === undefined || value === null || value === '') return;
      query.set(key, String(value));
    });

    const queryString = query.toString();
    const path = getTagsPathForContext(context || {});
    return queryString === '' ? apiUrl(path) : `${apiUrl(path)}?${queryString}`;
  }

  async function fetchTags(params, context) {
    const response = await fetch(buildTagsUrl(params, context), { credentials: 'include' });
    if (!response.ok) {
      const responseText = await response.text().catch(function () { return ''; });
      throw new Error(parseResponseMessage(responseText, `Ошибка (${response.status})`));
    }

    const data = await response.json().catch(function () {
      return {};
    });
    return window.OWCore.normalizeCollectionResponse(data);
  }

  function createTagItemElement(options, catalogEditorEnabled) {
    const element = document.createElement('div');
    element.className = 'picker-editor__item picker-editor__item--chip';

    const isCatalogEditorEnabled = Boolean(catalogEditorEnabled);
    const itemMode = isCatalogEditorEnabled ? getCatalogTagMode(options.id) : CATALOG_TAG_FILTER_MODES.tags;
    const isSelected = Boolean(options.selected) || options.slot === 'selected';

    if (isCatalogEditorEnabled) {
      element.classList.add('picker-editor__item--tag-filter');
    }

    if (isCatalogEditorEnabled) {
      const modeGroup = document.createElement('div');
      modeGroup.className = 'picker-editor__tag-mode';
      modeGroup.setAttribute('role', 'group');
      modeGroup.setAttribute('aria-label', 'Режим фильтра тегов');

      const excludeButton = document.createElement('button');
      excludeButton.type = 'button';
      excludeButton.className = 'picker-editor__tag-mode-button picker-editor__tag-mode-button--exclude';
      excludeButton.textContent = '-';
      excludeButton.title = 'Исключить тег';
      excludeButton.setAttribute('aria-label', 'Исключить тег');
      excludeButton.setAttribute('data-action', 'catalog-tags-mode');
      excludeButton.setAttribute('data-tag-mode', CATALOG_TAG_FILTER_MODES.excluded_tags);
      modeGroup.appendChild(excludeButton);

      const label = document.createElement('span');
      label.className = 'picker-editor__tag-mode-label';
      label.setAttribute('translate', 'no');

      const title = document.createElement('span');
      title.className = 'picker-editor__item-title';
      title.textContent = normalizeTagName(options.name);
      label.appendChild(title);

      if (options.showRemoveIcon !== false) {
        const removeIcon = document.createElement('img');
        removeIcon.className = 'picker-editor__item-action';
        removeIcon.src = '/assets/images/removal-triangle.svg';
        removeIcon.alt = 'Убрать тег';
        label.appendChild(removeIcon);
      }

      modeGroup.appendChild(label);

      const includeButton = document.createElement('button');
      includeButton.type = 'button';
      includeButton.className = 'picker-editor__tag-mode-button picker-editor__tag-mode-button--include';
      includeButton.textContent = '+';
      includeButton.title = 'Включить тег';
      includeButton.setAttribute('aria-label', 'Включить тег');
      includeButton.setAttribute('data-action', 'catalog-tags-mode');
      includeButton.setAttribute('data-tag-mode', CATALOG_TAG_FILTER_MODES.tags);
      modeGroup.appendChild(includeButton);

      element.appendChild(modeGroup);
      applyCatalogTagModeToElement(element, itemMode, isSelected);
    } else {
      const title = document.createElement('span');
      title.className = 'picker-editor__item-title';
      title.setAttribute('translate', 'no');
      title.textContent = normalizeTagName(options.name);
      element.appendChild(title);
    }

    if (options.showRemoveIcon !== false && !isCatalogEditorEnabled) {
      const removeIcon = document.createElement('img');
      removeIcon.className = 'picker-editor__item-action';
      removeIcon.src = '/assets/images/removal-triangle.svg';
      removeIcon.alt = 'Убрать тег';
      element.appendChild(removeIcon);
    }

    return element;
  }

  function initTagEditors() {
    document.querySelectorAll('[data-picker-editor-kind="tags"]').forEach(function (root) {
      if (root.dataset.owTagsEditorBound === 'true') return;
      root.dataset.owTagsEditorBound = 'true';

      const catalogEditorEnabled = isCatalogEditor(root);
      const ungroupedOnlyEditor = isUngroupedTagsEditor(root);

      const editor = window.OWPickerEditors.create({
        root,
        key: root.id,
        pendingPrefix: `pending-tag-${root.id}`,
        context: {
          gameId: normalizeGameId(root.dataset.pickerContextGameId),
          tagGroupId: normalizeTagGroupId(root.dataset.pickerContextTagGroupId || root.dataset.catalogTagGroupId),
          tagUngroupedOnly: ungroupedOnlyEditor ? 'true' : 'false',
        },
        emptyNameMessage: 'Введите название нового тега',
        duplicateMessage: 'Этот тег уже выбран',
        renderItem: function renderTagItem(options) {
          return createTagItemElement(options, catalogEditorEnabled);
        },
        async fetchSearchResults(queryValue, editor) {
          const context = editor.getContext();
          const path = getTagsPathForContext(context);
          const gameId = normalizeGameId(context.gameId);
          const params = {
            page_size: 30,
            name: queryValue,
          };
          if (gameId !== '' && (!gameTagsEndpoint || !gameTagsEndpoint.path || path !== formatPath(gameTagsEndpoint.path, { game_id: gameId }))) {
            params.game_id = gameId;
          }

          const data = await fetchTags(params, context);
          const normalized = window.OWCore.normalizeCollectionResponse(data);
          const items = Array.isArray(normalized.items) ? normalized.items : [];
          return {
            results: items,
            databaseSize: Number(normalized.database_size) || items.length,
          };
        },
        async fetchItemsByIds(ids, editor) {
          const context = editor.getContext();
          const path = getTagsPathForContext(context);
          const gameId = normalizeGameId(context.gameId);
          const params = {
            ids,
          };
          if (gameId !== '' && (!gameTagsEndpoint || !gameTagsEndpoint.path || path !== formatPath(gameTagsEndpoint.path, { game_id: gameId }))) {
            params.game_id = gameId;
          }

          const data = await fetchTags(params, context);
          const normalized = window.OWCore.normalizeCollectionResponse(data);
          const items = Array.isArray(normalized.items) ? normalized.items : [];
          return items;
        },
      });

      if (catalogEditorEnabled && editor) {
        root.addEventListener('click', function (event) {
          const button = event.target instanceof Element
            ? event.target.closest('[data-action="catalog-tags-mode"]')
            : null;
          if (!button || !root.contains(button)) return;

          event.preventDefault();
          event.stopPropagation();

          const item = button.closest('[data-picker-id]');
          if (window.OWCatalogTags && typeof window.OWCatalogTags.applyCardMode === 'function') {
            window.OWCatalogTags.applyCardMode(button.dataset.tagMode, editor, item);
          }
        }, true);
      }
    });
  }

  initTagEditors();
  window.OWTagsEditors = window.OWTagsEditors || {};
  window.OWTagsEditors.init = initTagEditors;
})();
