/* eslint-env browser */

(function () {
  const { getApiPaths, apiUrl } = window.OWCore;
  const apiPaths = getApiPaths();
  const catalogCore = window.OWCatalogCore || {};

  const masonrySettings = {
    columnWidth: 318,
    percentPosition: false,
    gutter: 0,
    stagger: 0,
    fitWidth: true,
    isFitWidth: true,
    isOriginLeft: false,
    isOriginTop: true,
    transitionDuration: 0,
  };

  function hasValue(value) {
    return value !== undefined && value !== null && value !== '';
  }

  function getFirstValue(target, keys) {
    for (const key of keys) {
      if (hasValue(target[key])) return target[key];
    }
    return undefined;
  }

  const catalogRoot = document.querySelector('main.catalog');

  function getCatalogKind() {
    if (!(catalogRoot instanceof Element)) return '';
    return String(catalogRoot.dataset.catalogKind || '').trim().toLowerCase();
  }

  function resolveCatalogMode(mode) {
    if (typeof catalogCore.resolveCatalogMode === 'function') {
      return catalogCore.resolveCatalogMode(mode);
    }
    if (mode === 'game' || mode === 'mod' || mode === 'modpack') {
      return mode;
    }
    return mode ? 'game' : 'mod';
  }

  function formatDateLabel(value) {
    if (!hasValue(value)) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleDateString('ru-RU');
  }

  function isNumericLike(value) {
    if (typeof value === 'number') return Number.isFinite(value);
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed === '') return false;
      return Number.isFinite(Number(trimmed));
    }
    return false;
  }

  function getContextSortMode(sortMode) {
    if (typeof catalogCore.getContextSortMode === 'function') {
      return catalogCore.getContextSortMode(sortMode);
    }
    return String(sortMode || '').replace(/^-/, '').toUpperCase();
  }

  function normalizeCatalogSortValue(sortMode) {
    if (typeof catalogCore.normalizeCatalogSortValue === 'function') {
      return catalogCore.normalizeCatalogSortValue(sortMode);
    }
    return String(sortMode || '').replace(/^-/, '').toLowerCase();
  }

  function getCatalogSortDefaultValue(catalogMode) {
    if (typeof catalogCore.getCatalogSortStateForMode === 'function') {
      return catalogCore.getCatalogSortStateForMode('', catalogMode).value;
    }
    return resolveCatalogMode(catalogMode) === 'game' ? 'mods_count' : 'downloads';
  }

  function isCatalogSortAllowedForMode(sortValue, catalogMode) {
    if (typeof catalogCore.isCatalogSortAllowedForMode === 'function') {
      return catalogCore.isCatalogSortAllowedForMode(sortValue, catalogMode);
    }
    return Boolean(normalizeCatalogSortValue(sortValue));
  }

  function normalizeCatalogSortForManager(sortMode, catalogMode) {
    if (typeof catalogCore.normalizeCatalogSortForManager === 'function') {
      return catalogCore.normalizeCatalogSortForManager(sortMode, catalogMode);
    }
    return String(sortMode || getCatalogSortDefaultValue(catalogMode));
  }

  function normalizeCatalogGameTypeForManager(value) {
    if (typeof catalogCore.normalizeCatalogGameTypeForManager === 'function') {
      return catalogCore.normalizeCatalogGameTypeForManager(value);
    }
    return String(value || 'all').trim().toLowerCase();
  }

  function buildContextTag(element, catalogMode, contextSortMode) {
    const resolvedMode = resolveCatalogMode(catalogMode);

    if (resolvedMode === 'game') {
      if (contextSortMode === 'DOWNLOADS') {
        if (!hasValue(element.mods_downloads)) return null;
        return {
          text: '📥',
          description: 'Скачиваний у всех модов игры',
          value: element.mods_downloads,
        };
      }

      if (contextSortMode === 'MODS') {
        const modsCount = getFirstValue(element, ['mods_count']);
        if (!hasValue(modsCount)) return null;
        return {
          text: '🔭',
          description: 'Количество модов',
          value: modsCount,
        };
      }

      if (contextSortMode === 'CREATION') {
        const creationDate = element.creation_date;
        if (!hasValue(creationDate)) return null;
        return {
          text: '📝',
          description: 'Дата создания',
          value: formatDateLabel(creationDate),
        };
      }

      return null;
    }

    if (resolvedMode === 'modpack') {
      if (contextSortMode === 'DOWNLOADS') {
        const downloads = getFirstValue(element, ['downloads']);
        if (!hasValue(downloads)) return null;
        return {
          text: '📥',
          description: 'Скачиваний',
          value: downloads,
        };
      }

      if (contextSortMode === 'CREATION') {
        const creationDate = getFirstValue(element, ['created_at']);
        if (!hasValue(creationDate)) return null;
        return {
          text: '📝',
          description: 'Дата создания',
          value: formatDateLabel(creationDate),
        };
      }

      if (contextSortMode === 'UPDATE') {
        const updateDate = getFirstValue(element, ['updated_at']);
        if (!hasValue(updateDate)) return null;
        return {
          text: '⏳',
          description: 'Дата обновления',
          value: formatDateLabel(updateDate),
        };
      }

      if (contextSortMode === 'RATING') {
        const rating = getFirstValue(element, ['rating']);
        if (!hasValue(rating)) return null;
        return {
          text: '⭐',
          description: 'Рейтинг',
          value: rating,
        };
      }

      return null;
    }

    if (contextSortMode === 'DOWNLOADS') {
      const downloads = getFirstValue(element, ['downloads']);
      if (!hasValue(downloads)) return null;
      return {
        text: '📥',
        description: 'Скачиваний',
        value: downloads,
      };
    }

    if (contextSortMode === 'CREATION') {
      const creationDate = element.date_creation;
      if (!hasValue(creationDate)) return null;
      return {
        text: '📝',
        description: 'Дата создания',
        value: formatDateLabel(creationDate),
      };
    }

    if (contextSortMode === 'UPDATE') {
      const updateDate = element.date_update_file;
      if (!hasValue(updateDate)) return null;
      return {
        text: '⏳',
        description: 'Дата обновления',
        value: formatDateLabel(updateDate),
      };
    }

    if (contextSortMode === 'SIZE') {
      const size = element.size;
      if (!hasValue(size)) return null;
      const numericSize = isNumericLike(size);
      return {
        text: '📦',
        description: 'Размер файла',
        value: numericSize ? Number(size) : String(size),
        ...(numericSize ? { type: 'size' } : {}),
      };
    }

    if (contextSortMode === 'RATING') {
      const rating = getFirstValue(element, ['rating']);
      if (!hasValue(rating)) return null;
      return {
        text: '⭐',
        description: 'Рейтинг',
        value: rating,
      };
    }

    return null;
  }

  const msnry = new Masonry('#cards', {
    itemSelector: '.card:not([fixed])',
    ...masonrySettings,
  });
  const cardsRoot = document.getElementById('cards');
  let catalogRequestToken = 0;
  let pendingMasonryFrame = 0;

  function cancelPendingMasonryFrame() {
    if (!pendingMasonryFrame) return;
    cancelAnimationFrame(pendingMasonryFrame);
    pendingMasonryFrame = 0;
  }

  function isCurrentCatalogRequest(requestToken) {
    if (requestToken == null) return true;
    const normalizedToken = Number(requestToken);
    return Number.isFinite(normalizedToken) && normalizedToken === catalogRequestToken;
  }

  function relayoutCatalog() {
    cancelPendingMasonryFrame();
    if (cardsRoot) {
      cardsRoot.style.width = 'auto';
    }
    msnry.reloadItems();
    msnry.layout();
  }

  function scheduleMasonryCatalog() {
    if (!cardsRoot || pendingMasonryFrame) return;
    pendingMasonryFrame = requestAnimationFrame(function () {
      pendingMasonryFrame = 0;
      relayoutCatalog();
    });
  }

  function clearPlaceholderCards(placeholders, relayout) {
    const cardsApi = window.Cards;
    const connectedPlaceholders = placeholders.filter(function (placeholder) {
      return placeholder && placeholder.isConnected;
    });

    if (connectedPlaceholders.length === 0) {
      return;
    }

    let remaining = connectedPlaceholders.length;
    const finishOne = function () {
      remaining -= 1;
      if (remaining <= 0 && relayout) {
        relayoutCatalog();
      }
    };

    connectedPlaceholders.forEach(function (placeholder) {
      if (cardsApi && typeof cardsApi.animatePlaceholderExit === 'function') {
        cardsApi.animatePlaceholderExit(placeholder, finishOne);
      } else {
        placeholder.remove();
        finishOne();
      }
    });
  }

  window.addEventListener('resize', function () {
    Catalog.masonry();
  });

  window.Catalog = {
    beginRequest: function () {
      cancelPendingMasonryFrame();
      catalogRequestToken += 1;
      return catalogRequestToken;
    },
    getRequestToken: function () {
      return catalogRequestToken;
    },
    removeAll: function () {
      cancelPendingMasonryFrame();
      if (cardsRoot) {
        cardsRoot.innerHTML = '';
      }
    },
    scheduleMasonry: function () {
      scheduleMasonryCatalog();
    },
    /**
     * @param {Dictionary} settings
     */
    addPage: async function (settings, requestToken = catalogRequestToken) {
      const editTrigger = String(settings.get('trigger', '')).toLowerCase() === 'edit';
      const doplink = URLManager.genString(settings.duplicate().pop('page').pop('trigger'));
      const contextSortMode = getContextSortMode(settings.get('sort', '-downloads'));
      const catalogMode = getCatalogKind();
      const requestPlan = catalogCore.buildCatalogRequest({
        catalogKind: catalogMode,
        pageSize: 30,
        paths: {
          game: apiPaths.game.list.path,
          mod: apiPaths.mod.list.path,
          modpack: apiPaths.modpack.list.path,
        },
        settings,
      });
      const isGameMode = requestPlan.isGameMode;
      const renderEntityKind = requestPlan.renderEntityKind;
      settings.set('page_size', 30);
      settings.pop('statistics');
      settings.pop('dates');
      settings.pop('trigger');
      settings.pop('include');

      const requestSettings = new Dictionary(requestPlan.requestParams);
      const path = requestPlan.path;
      const url =
        apiUrl(path) +
        URLManager.genString(requestSettings, new Dictionary({ size: 'page_size' }));
      if (!isCurrentCatalogRequest(requestToken)) {
        return null;
      }

      const placeholders = [];
      const loadingCardCount = Number(settings.get('page_size', 30)) || 30;
      if (cardsRoot && typeof Cards.createPlaceholder === 'function' && loadingCardCount > 0) {
        for (let index = 0; index < loadingCardCount; index += 1) {
          const placeholder = Cards.createPlaceholder(settings.get('page', 0), {
            index,
          });
          placeholders.push(placeholder);
          cardsRoot.appendChild(placeholder);
        }
        relayoutCatalog();
      }

      let response;
      let payload;
      try {
        response = await fetch(url, {
          method: 'GET',
          redirect: 'follow',
          credentials: 'include',
        });
        payload = await response.json().catch(function () {
          return null;
        });
      } catch (error) {
        clearPlaceholderCards(placeholders, true);
        return null;
      }

      const data = window.OWCore.normalizeCollectionResponse(payload);
      if (!data || typeof data !== 'object') {
        clearPlaceholderCards(placeholders, true);
        return null;
      }

      if (!isCurrentCatalogRequest(requestToken)) {
        clearPlaceholderCards(placeholders, true);
        return null;
      }

      if (response.status != 200) {
        clearPlaceholderCards(placeholders, true);
        return null;
      }

      if (cardsRoot) {
        const placeholdersToRemove = [];
        for (let index = 0; index < data.items.length; index += 1) {
          if (!isCurrentCatalogRequest(requestToken)) {
            clearPlaceholderCards(placeholders, true);
            return null;
          }

          const element = data.items[index];
          const placeholder = placeholders[index] || null;
          const existingCard = cardsRoot.querySelector('div.card[id="' + String(element.id) + '"]');

          if (existingCard) {
            if (placeholder && placeholder.isConnected) {
              placeholdersToRemove.push(placeholder);
            }
            continue;
          }

          element.doplink = doplink;

          const tags = [];
          const contextTag = buildContextTag(element, renderEntityKind, contextSortMode);
          if (contextTag) tags.push(contextTag);

          const card = Cards.create(
            element,
            settings.get('page', 0),
            true,
            settings.get('name', ''),
            isGameMode,
            tags,
            editTrigger,
            {
              entityKind: renderEntityKind,
            },
          );

          if (placeholder && placeholder.isConnected) {
            if (typeof Cards.materializePlaceholder === 'function') {
              Cards.materializePlaceholder(placeholder, card, requestToken);
            } else {
              placeholder.replaceWith(card);
            }
          } else {
            cardsRoot.appendChild(card);
          }
        }

        for (let index = data.items.length; index < placeholders.length; index += 1) {
          const placeholder = placeholders[index];
          if (placeholder && placeholder.isConnected) {
            placeholdersToRemove.push(placeholder);
          }
        }

        relayoutCatalog();
        clearPlaceholderCards(placeholdersToRemove, true);
      }

      return data;
    },
    notFound: function () {
      if (!cardsRoot) return;
      const card = Cards.create(
        {
          name: 'Ничего не найдено',
          short_description: 'По выбранным параметрам ничего не найдено (×﹏×)',
          logo: '/assets/images/webp/not-found.webp',
        },
        0,
        false,
      );
      cardsRoot.appendChild(card);
      msnry.appended(card);
      Catalog.masonry();
    },
    masonry: function () {
      relayoutCatalog();
    },
    cardShow: function (cardClick) {
      if (!cardsRoot) return;
      cardsRoot.classList.add('showing');
      cardsRoot.querySelectorAll('.card').forEach(function (card) {
        card.classList.remove('show');
      });

      const card = cardClick instanceof Element ? cardClick.closest('.card') : null;
      if (card) {
        card.classList.add('show');
      }
    },
    cardsCancel: function () {
      if (!cardsRoot) return;
      cardsRoot.classList.remove('showing');
      cardsRoot.querySelectorAll('.card').forEach(function (card) {
        card.classList.remove('show');
      });
    },
  };
})();
