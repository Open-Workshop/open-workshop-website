/* eslint-env browser */

(function () {
  const { getApiPaths, apiUrl } = window.OWCore;
  const apiPaths = getApiPaths();

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

  const CATALOG_SORT_ALIASES = {
    creation: 'created_at',
    downloads: 'downloads',
    mods: 'mods_count',
    mods_downloads: 'downloads',
    plugins_count: 'dependents_count',
    rating: 'rating',
    update: 'file_updated_at',
    updated_at: 'file_updated_at',
  };
  const CATALOG_SORT_ALLOWED_VALUES = {
    game: new Set(['mods_count', 'downloads', 'created_at', 'name']),
    mod: new Set(['downloads', 'size', 'file_updated_at', 'dependents_count', 'created_at', 'name', 'rating']),
    modpack: new Set(['downloads', 'rating', 'created_at', 'name']),
  };
  const CATALOG_SORT_DEFAULT_VALUES = {
    game: 'mods_count',
    mod: 'downloads',
    modpack: 'downloads',
  };

  function getContextSortMode(sortMode) {
    const normalizedSort = String(sortMode || '')
      .replace(/^-/, '')
      .toLowerCase();
    const aliases = {
      downloads: 'DOWNLOADS',
      mods_downloads: 'DOWNLOADS',
      created_at: 'CREATION',
      file_updated_at: 'UPDATE',
      updated_at: 'UPDATE',
      mods_count: 'MODS',
      dependents_count: 'DEPENDENTS',
      size: 'SIZE',
      rating: 'RATING',
    };
    return aliases[normalizedSort] || normalizedSort.toUpperCase();
  }

  function normalizeCatalogSortValue(sortMode) {
    const normalizedSort = String(sortMode || '')
      .replace(/^-/, '')
      .toLowerCase();
    return CATALOG_SORT_ALIASES[normalizedSort] || normalizedSort;
  }

  function getCatalogSortDefaultValue(catalogMode) {
    const resolvedMode = resolveCatalogMode(catalogMode);
    return CATALOG_SORT_DEFAULT_VALUES[resolvedMode] || CATALOG_SORT_DEFAULT_VALUES.mod;
  }

  function isCatalogSortAllowedForMode(sortValue, catalogMode) {
    const normalizedSort = normalizeCatalogSortValue(sortValue);
    const resolvedMode = resolveCatalogMode(catalogMode);
    const allowedValues = CATALOG_SORT_ALLOWED_VALUES[resolvedMode] || CATALOG_SORT_ALLOWED_VALUES.mod;
    return allowedValues.has(normalizedSort);
  }

  function normalizeCatalogSortForManager(sortMode, catalogMode) {
    const rawSort = String(sortMode || '').trim();
    const descending = rawSort.startsWith('-');
    const normalizedSort = normalizeCatalogSortValue(rawSort);
    const resolvedMode = resolveCatalogMode(catalogMode);
    const allowedSort = isCatalogSortAllowedForMode(normalizedSort, resolvedMode)
      ? normalizedSort
      : getCatalogSortDefaultValue(resolvedMode);
    const managerSort = allowedSort === 'downloads' && resolvedMode === 'game'
      ? 'mods_downloads'
      : allowedSort;

    return descending ? '-' + managerSort : managerSort;
  }

  function normalizeCatalogGameTypeForManager(value) {
    const normalized = String(value || 'all').trim().toLowerCase();
    if (normalized === 'app' || normalized === 'game') return normalized;
    return 'all';
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
      const isModpackMode = catalogMode === 'modpack';
      const isGameMode = settings.get('sgame', 'yes') == 'yes';
      const renderEntityKind = isGameMode ? 'game' : (isModpackMode ? 'modpack' : 'mod');
      settings.set('page_size', 30);
      settings.pop('statistics');
      settings.pop('dates');
      settings.pop('trigger');
      settings.pop('include');

      const requestSettings = settings.duplicate();
      requestSettings.pop('catalog_kind');
      const includeFields = ['short_description', 'dates'];
      let path = '';
      if (isModpackMode && !isGameMode) {
        requestSettings.pop('user');
        const selectedGameId = String(requestSettings.get('game_id', requestSettings.get('game', '')) || '').trim();
        requestSettings.pop('public');
        requestSettings.pop('sgame');
        requestSettings.pop('game');
        requestSettings.pop('game_id');
        requestSettings.pop('game_type');
        requestSettings.pop('types');
        requestSettings.pop('dependencies_mode');
        requestSettings.pop('independents');
        requestSettings.pop('depen');
        requestSettings.pop('dependencies');
        requestSettings.pop('excluded_dependencies');
        requestSettings.pop('excluded_conflicts');
        requestSettings.pop('genres');
        requestSettings.pop('size_min');
        requestSettings.pop('size_max');
        requestSettings.pop('size_unpacked_min');
        requestSettings.pop('size_unpacked_max');
        if (selectedGameId !== '') {
          requestSettings.set('game_id', selectedGameId);
        }
        if (requestSettings.get('tags', '').length > 0) {
          requestSettings.set('tags', requestSettings.get('tags').split('_').filter(Boolean));
        }
        if (requestSettings.get('excluded_tags', '').length > 0) {
          requestSettings.set('excluded_tags', requestSettings.get('excluded_tags').split('_').filter(Boolean));
        }
        requestSettings.set('include', includeFields);
        requestSettings.set(
          'sort',
          normalizeCatalogSortForManager(requestSettings.get('sort', '-downloads'), 'modpack'),
        );
        path = apiPaths.modpack.list.path;
      } else {
        const keys = [['depen', 'independents']];
        keys.forEach((key) => {
          if (requestSettings.get(key[0]) != undefined) {
            requestSettings.replaceKey(key[0], key[1]);
          }
        });

        const rawDependencies = String(requestSettings.get('dependencies', '') || '');
        const rawExcludedDependencies = String(requestSettings.get('excluded_dependencies', '') || '');
        const rawExcludedConflicts = String(requestSettings.get('excluded_conflicts', '') || '');
        const dependencies = rawDependencies
          .replaceAll('_', ',')
          .replaceAll('[', '')
          .replaceAll(']', '')
          .split(',')
          .map((id) => String(id).trim())
          .filter((id) => /^\d+$/.test(id));
        const excludedDependencies = rawExcludedDependencies
          .replaceAll('_', ',')
          .replaceAll('[', '')
          .replaceAll(']', '')
          .split(',')
          .map((id) => String(id).trim())
          .filter((id) => /^\d+$/.test(id));
        const excludedConflicts = rawExcludedConflicts
          .replaceAll('_', ',')
          .replaceAll('[', '')
          .replaceAll(']', '')
          .split(',')
          .map((id) => String(id).trim())
          .filter((id) => /^\d+$/.test(id));
        const independentMode = String(requestSettings.get('independents', 'no')) === 'yes';
        requestSettings.pop('dependencies_mode');
        if (independentMode) {
          requestSettings.pop('dependencies');
          requestSettings.pop('excluded_dependencies');
        } else {
          if (dependencies.length > 0) {
            requestSettings.set('dependencies', dependencies);
          } else {
            requestSettings.pop('dependencies');
          }

          if (excludedDependencies.length > 0) {
            requestSettings.set('excluded_dependencies', excludedDependencies);
          } else {
            requestSettings.pop('excluded_dependencies');
          }

          if (dependencies.length > 0 || excludedDependencies.length > 0) {
            requestSettings.set('sgame', 'no');
            requestSettings.set('independents', 'no');
          }
        }
        if (excludedConflicts.length > 0) {
          requestSettings.set('excluded_conflicts', excludedConflicts);
          requestSettings.set('sgame', 'no');
        } else {
          requestSettings.pop('excluded_conflicts');
        }

        if (isGameMode) {
          includeFields.push('statistics');
        }
        const gameType = normalizeCatalogGameTypeForManager(requestSettings.get('game_type', requestSettings.get('types', 'all')));
        requestSettings.pop('dependencies_mode');
        requestSettings.pop('independents');
        requestSettings.pop('sgame');
        if (isGameMode) {
          requestSettings.pop('adult');
          requestSettings.pop('dependencies');
          requestSettings.pop('excluded_dependencies');
          requestSettings.pop('excluded_conflicts');
          requestSettings.pop('tags');
          requestSettings.pop('excluded_tags');
          requestSettings.pop('dependents_count_min');
          requestSettings.pop('dependents_count_max');
          requestSettings.pop('size_min');
          requestSettings.pop('size_max');
          requestSettings.pop('size_unpacked_min');
          requestSettings.pop('size_unpacked_max');
          requestSettings.pop('game_type');
          requestSettings.pop('types');
          if (gameType !== 'all') {
            requestSettings.set('types', gameType);
          }
          if (requestSettings.get('genres', '').length > 0) {
            requestSettings.set('genres', requestSettings.get('genres').split('_').filter(Boolean));
          }
        } else {
          const adultValue = requestSettings.get('adult', '');
          if (adultValue === '' || adultValue === undefined || adultValue === null) {
            requestSettings.set('adult', '0');
          }
          requestSettings.pop('game_type');
          requestSettings.pop('types');
          requestSettings.pop('genres');
        }
        requestSettings.set('include', includeFields);
        requestSettings.set(
          'sort',
          normalizeCatalogSortForManager(requestSettings.get('sort', '-downloads'), isGameMode ? 'game' : 'mod'),
        );
        if (isGameMode) {
          requestSettings.pop('game');
        } else if (requestSettings.get('game') != undefined) {
          requestSettings.replaceKey('game', 'game_id');
        }

        if (!isGameMode && requestSettings.get('tags', '').length > 0) {
          requestSettings.set('tags', requestSettings.get('tags').split('_').filter(Boolean));
        }

        if (!isGameMode && requestSettings.get('excluded_tags', '').length > 0) {
          requestSettings.set('excluded_tags', requestSettings.get('excluded_tags').split('_').filter(Boolean));
        }

        const gamesPath = apiPaths.game.list.path;
        const modsPath = apiPaths.mod.list.path;
        path = isGameMode ? gamesPath : modsPath;
      }
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
