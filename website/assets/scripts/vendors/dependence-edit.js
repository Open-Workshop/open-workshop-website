/* eslint-env browser */

(function () {
  if (!window.OWPickerEditors || !window.OWCore) return;

  const { getApiPaths, apiUrl } = window.OWCore;
  const apiPaths = getApiPaths();
  const modsPath = apiPaths.mod.list.path;
  const resourcesPath = apiPaths.resource.list.path;
  const fallbackImage = window.OWCore.getImageFallback();

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

  function normalizeGameId(value) {
    const rawValue = String(value || '').trim();
    return rawValue === '0' ? '' : rawValue;
  }

  function buildUrl(path, params) {
    const query = new URLSearchParams();

    Object.entries(params || {}).forEach(function ([key, value]) {
      if (value === undefined || value === null || value === '') return;
      query.set(key, String(value));
    });

    const queryString = query.toString();
    return queryString === '' ? apiUrl(path) : `${apiUrl(path)}?${queryString}`;
  }

  async function fetchJson(path, params) {
    const response = await fetch(buildUrl(path, params), {
      credentials: 'include',
    });

    if (!response.ok) {
      const responseText = await response.text().catch(function () { return ''; });
      throw new Error(parseResponseMessage(responseText, `Ошибка (${response.status})`));
    }

    return response.json().catch(function () {
      return {};
    });
  }

  async function fetchModItems(params) {
    const [modsData, resourcesData] = await Promise.all([
      fetchJson(modsPath, params),
      fetchJson(resourcesPath, {
        owner_type: 'mods',
        owner_ids: params.allowed_ids || '[]',
        types_resources: '["logo"]',
      }).catch(function () {
        return { results: [] };
      }),
    ]);

    const logosById = {};
    (resourcesData.results || []).forEach(function (resource) {
      if (!resource || resource.owner_id === undefined || !resource.url) return;
      logosById[String(resource.owner_id)] = resource.url;
    });

    return {
      results: Array.isArray(modsData.results)
        ? modsData.results.map(function (item) {
          return {
            id: item.id,
            name: item.name,
            img: logosById[String(item.id)] || fallbackImage,
          };
        })
        : [],
      databaseSize: Number(modsData.database_size),
    };
  }

  async function searchDependencies(queryValue, gameId, useDependentsCountSort) {
    const searchParams = {
      page_size: 5,
      name: queryValue,
    };

    if (useDependentsCountSort) {
      searchParams.sort = 'iPLUGINS_COUNT';
    }

    const normalizedGameId = normalizeGameId(gameId);
    if (normalizedGameId !== '') {
      searchParams.game = normalizedGameId;
    }

    const modsData = await fetchJson(modsPath, searchParams);
    const modIds = Array.isArray(modsData.results)
      ? modsData.results.map(function (item) { return item.id; }).filter(function (item) { return item !== undefined; })
      : [];

    const resourcesData = modIds.length > 0
      ? await fetchJson(resourcesPath, {
        owner_type: 'mods',
        owner_ids: '[' + modIds.join(',') + ']',
        types_resources: '["logo"]',
      }).catch(function () {
        return { results: [] };
      })
      : { results: [] };

    const logosById = {};
    (resourcesData.results || []).forEach(function (resource) {
      if (!resource || resource.owner_id === undefined || !resource.url) return;
      logosById[String(resource.owner_id)] = resource.url;
    });

    return {
      results: Array.isArray(modsData.results)
        ? modsData.results.map(function (item) {
          return {
            id: item.id,
            name: item.name,
            img: logosById[String(item.id)] || fallbackImage,
          };
        })
        : [],
      databaseSize: Number(modsData.database_size),
    };
  }

  function createDependencyItemElement(options, isCatalogEditor) {
    const element = document.createElement('div');
    element.className = 'picker-editor__item picker-editor__item--row';

    const media = document.createElement('img');
    media.className = 'picker-editor__item-media';
    media.src = (options.data && options.data.img) || fallbackImage;
    media.alt = 'Логотип мода';
    media.setAttribute('errorcap', '');
    element.appendChild(media);

    const content = document.createElement('div');
    content.className = 'picker-editor__item-content';

    const title = document.createElement('h3');
    title.className = 'picker-editor__item-title';
    title.setAttribute('translate', 'no');
    title.textContent = String(options.name || '');
    content.appendChild(title);

    const actions = document.createElement('div');
    actions.className = 'picker-editor__item-actions';

    if (isCatalogEditor) {
      const modeActions = document.createElement('div');
      modeActions.className = 'picker-editor__item-mode-actions';
      modeActions.setAttribute('role', 'group');
      modeActions.setAttribute('aria-label', 'Режим фильтра по зависимости');

      const excludeButton = document.createElement('button');
      excludeButton.type = 'button';
      excludeButton.className = 'tag-link-red picker-editor__mode-button picker-editor__mode-button--exclude';
      excludeButton.textContent = '-';
      excludeButton.title = 'Применить как антифильтр';
      excludeButton.setAttribute('aria-label', 'Применить как антифильтр');
      excludeButton.setAttribute('data-action', 'catalog-dependencies-mode');
      excludeButton.setAttribute('data-dependencies-mode', 'excluded_dependencies');
      modeActions.appendChild(excludeButton);

      const includeButton = document.createElement('button');
      includeButton.type = 'button';
      includeButton.className = 'tag-link-green picker-editor__mode-button picker-editor__mode-button--include';
      includeButton.textContent = '+';
      includeButton.title = 'Применить как обычный фильтр';
      includeButton.setAttribute('aria-label', 'Применить как обычный фильтр');
      includeButton.setAttribute('data-action', 'catalog-dependencies-mode');
      includeButton.setAttribute('data-dependencies-mode', 'dependencies');
      modeActions.appendChild(includeButton);

      actions.appendChild(modeActions);
    }

    if (options.showRemoveIcon !== false) {
      const removeIcon = document.createElement('img');
      removeIcon.className = 'picker-editor__item-action';
      removeIcon.src = '/assets/images/removal-triangle.svg';
      removeIcon.alt = 'Убрать зависимость';
      actions.appendChild(removeIcon);
    }

    if (actions.childNodes.length > 0) {
      content.appendChild(actions);
    }

    element.appendChild(content);

    if (isCatalogEditor) {
      const itemMode = window.OWCatalogDependencies
        && typeof window.OWCatalogDependencies.getItemMode === 'function'
        ? window.OWCatalogDependencies.getItemMode(String(options.id || ''))
        : 'dependencies';
      const isSelected = Boolean(options.selected) || options.slot === 'selected';

      element.dataset.catalogDependenciesMode = itemMode;
      element.dataset.catalogDependenciesSelected = isSelected ? 'true' : 'false';
      element.querySelectorAll('[data-action="catalog-dependencies-mode"]').forEach(function (button) {
        const buttonMode = button.dataset.dependenciesMode === 'excluded_dependencies'
          ? 'excluded_dependencies'
          : 'dependencies';
        const isActive = buttonMode === itemMode;
        button.classList.toggle('is-active', isActive);
        button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
      });
    }

    return element;
  }

  function initDependencyEditors() {
    document.querySelectorAll('[data-picker-editor-kind="dependencies"]').forEach(function (root) {
      if (root.dataset.owDependencyEditorBound === 'true') return;
      root.dataset.owDependencyEditorBound = 'true';

      const isCatalogEditor = root.id === 'catalog-dependencies-editor';
      const editor = window.OWPickerEditors.create({
        root,
        key: root.id,
        context: {
          gameId: normalizeGameId(root.dataset.pickerContextGameId),
        },
        renderItem: function renderDependencyItem(options) {
          return createDependencyItemElement(options, isCatalogEditor);
        },
        async fetchSearchResults(queryValue, editor) {
          return searchDependencies(queryValue, editor.getContext().gameId, isCatalogEditor);
        },
        async fetchItemsByIds(ids) {
          if (!Array.isArray(ids) || ids.length === 0) return [];
          const data = await fetchModItems({
            allowed_ids: '[' + ids.join(',') + ']',
            page_size: 50,
          });
          return data.results;
        },
      });

      if (isCatalogEditor) {
        root.addEventListener('click', function (event) {
          const button = event.target instanceof Element
            ? event.target.closest('[data-action="catalog-dependencies-mode"]')
            : null;
          if (!button || !root.contains(button)) return;

          event.preventDefault();
          event.stopPropagation();

          const item = button.closest('[data-picker-id]');
          if (window.OWCatalogDependencies && typeof window.OWCatalogDependencies.applyCardMode === 'function') {
            window.OWCatalogDependencies.applyCardMode(button.dataset.dependenciesMode, editor, item);
          }
        }, true);
      }
    });
  }

  initDependencyEditors();
})();
