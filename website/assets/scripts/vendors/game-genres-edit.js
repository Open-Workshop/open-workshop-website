/* eslint-env browser */

(function () {
  if (!window.OWPickerEditors || !window.OWCore) return;

  const apiPaths = window.OWCore.getApiPaths();
  const genresPath = apiPaths.genre.list.path;
  let allGenresPromise = null;

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

  function normalizeGenreName(value) {
    return String(value || '').trim().replace(/\s+/g, ' ');
  }

  function buildGenresUrl(params) {
    const query = new URLSearchParams();

    Object.entries(params || {}).forEach(function ([key, value]) {
      if (value === undefined || value === null || value === '') return;
      query.set(key, String(value));
    });

    const queryString = query.toString();
    return queryString === '' ? window.OWCore.apiUrl(genresPath) : `${window.OWCore.apiUrl(genresPath)}?${queryString}`;
  }

  async function fetchGenres(params) {
    const response = await fetch(buildGenresUrl(params), {
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

  async function fetchAllGenres() {
    if (!allGenresPromise) {
      allGenresPromise = (async function () {
        const firstPage = await fetchGenres({
          page_size: 50,
        });

        const results = Array.isArray(firstPage.results) ? firstPage.results.slice() : [];
        const totalSize = Number(firstPage.database_size);
        if (!Number.isFinite(totalSize) || results.length >= totalSize) {
          return results;
        }

        const pageCount = Math.ceil(totalSize / 50);
        const pageRequests = [];
        for (let page = 1; page < pageCount; page += 1) {
          pageRequests.push(fetchGenres({
            page_size: 50,
            page,
          }));
        }

        const pageResults = await Promise.all(pageRequests);
        pageResults.forEach(function (pageData) {
          if (Array.isArray(pageData.results)) {
            results.push(...pageData.results);
          }
        });

        return results;
      })().catch(function (error) {
        allGenresPromise = null;
        throw error;
      });
    }

    return allGenresPromise;
  }

  async function fetchGenresByIds(ids) {
    const requestedIds = Array.isArray(ids)
      ? ids
        .map(function (id) {
          return String(id);
        })
        .filter(function (id) {
          return id.length > 0;
        })
      : [];

    if (requestedIds.length === 0) {
      return [];
    }

    const lookup = new Map(
      (await fetchAllGenres()).map(function (item) {
        return [String(item.id), item];
      }),
    );

    return requestedIds
      .map(function (id) {
        return lookup.get(id) || null;
      })
      .filter(Boolean);
  }

  function createGenreItemElement(options) {
    const element = document.createElement('div');
    element.className = 'picker-editor__item picker-editor__item--chip';

    const title = document.createElement('span');
    title.className = 'picker-editor__item-title';
    title.setAttribute('translate', 'no');
    title.textContent = normalizeGenreName(options.name);
    element.appendChild(title);

    if (options.showRemoveIcon !== false) {
      const removeIcon = document.createElement('img');
      removeIcon.className = 'picker-editor__item-action';
      removeIcon.src = '/assets/images/removal-triangle.svg';
      removeIcon.alt = 'Убрать жанр';
      element.appendChild(removeIcon);
    }

    return element;
  }

  function initGenreEditors() {
    document.querySelectorAll('[data-picker-editor-kind="genres"]').forEach(function (root) {
      if (root.dataset.owGenresEditorBound === 'true') return;
      root.dataset.owGenresEditorBound = 'true';

      window.OWPickerEditors.create({
        root,
        key: root.id,
        pendingPrefix: 'pending-genre',
        emptyNameMessage: 'Введите название нового жанра',
        duplicateMessage: 'Этот жанр уже выбран',
        renderItem: createGenreItemElement,
        async fetchSearchResults(queryValue) {
          const data = await fetchGenres({
            page_size: 50,
            name: queryValue,
          });

          return {
            results: Array.isArray(data.results) ? data.results : [],
            databaseSize: Number(data.database_size),
          };
        },
        async fetchItemsByIds(ids) {
          return fetchGenresByIds(ids);
        },
      });
    });
  }

  initGenreEditors();
})();
