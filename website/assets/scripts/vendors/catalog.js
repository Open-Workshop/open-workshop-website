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
    const normalizedSort = String(sortMode || '')
      .replace(/^-/, '')
      .replace(/^i/, '')
      .toLowerCase();
    const aliases = {
      downloads: 'DOWNLOADS',
      created_at: 'CREATION',
      file_updated_at: 'UPDATE',
      updated_at: 'UPDATE',
      mods_count: 'MODS',
      dependents_count: 'DEPENDENTS',
      size: 'SIZE',
    };
    return aliases[normalizedSort] || normalizedSort.toUpperCase();
  }

  function buildContextTag(element, isGameMode, contextSortMode) {
    if (isGameMode) {
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

    return null;
  }

  const msnry = new Masonry('#cards', {
    itemSelector: '.card:not([fixed])',
    ...masonrySettings,
  });
  const cardsRoot = document.getElementById('cards');

  window.addEventListener('resize', function () {
    Catalog.masonry();
  });

  window.Catalog = {
    removeAll: function () {
      if (cardsRoot) {
        cardsRoot.innerHTML = '';
      }
    },
    /**
     * @param {Dictionary} settings
     */
    addPage: async function (settings) {
      const editTrigger = String(settings.get('trigger', '')).toLowerCase() === 'edit';
      const doplink = URLManager.genString(settings.duplicate().pop('page').pop('trigger'));
      const contextSortMode = getContextSortMode(settings.get('sort', '-downloads'));

      settings.set('description', true);
      settings.set('short_description', true);
      settings.set('page_size', 30);
      settings.set('statistics', true);
      settings.set('dates', true);
      settings.pop('trigger');

      const keys = [['depen', 'independents']];
      keys.forEach((key) => {
        if (settings.get(key[0]) != undefined) {
          settings.replaceKey(key[0], key[1]);
        }
      });

      const rawDependencies = String(settings.get('dependencies', '') || '');
      const rawExcludedDependencies = String(settings.get('excluded_dependencies', '') || '');
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
      const independentMode = String(settings.get('independents', 'no')) === 'yes';
      settings.pop('dependencies_mode');
      if (independentMode) {
        settings.pop('dependencies');
        settings.pop('excluded_dependencies');
      } else {
        if (dependencies.length > 0) {
          settings.set('dependencies', '[' + dependencies.join(',') + ']');
        } else {
          settings.pop('dependencies');
        }

        if (excludedDependencies.length > 0) {
          settings.set('excluded_dependencies', '[' + excludedDependencies.join(',') + ']');
        } else {
          settings.pop('excluded_dependencies');
        }

        if (dependencies.length > 0 || excludedDependencies.length > 0) {
          settings.set('sgame', 'no');
          settings.set('independents', 'no');
        }
      }

      const isGameMode = settings.get('sgame', 'yes') == 'yes';

      const values = new Dictionary({
        independents: { yes: 'true', no: 'false' },
        sort: {
          DOWNLOADS: 'downloads',
          iDOWNLOADS: '-downloads',
          PLUGINS_COUNT: 'dependents_count',
          iPLUGINS_COUNT: '-dependents_count',
          CREATION: 'created_at',
          iCREATION: '-created_at',
          UPDATE: 'file_updated_at',
          iUPDATE: '-file_updated_at',
          MODS: 'mods_count',
          iMODS: '-mods_count',
        },
      });
      for (const key in values) {
        if (settings.get(key) != undefined && values[key].get(settings.get(key)) != undefined) {
          settings.set(key, values[key][settings.get(key)]);
        }
      }

      if (settings.get('tags', '').length > 0) {
        settings.set('tags', settings.get('tags').split('_').filter(Boolean));
      }

      if (settings.get('excluded_tags', '').length > 0) {
        settings.set('excluded_tags', settings.get('excluded_tags').split('_').filter(Boolean));
      }

      if (settings.get('genres', '').length > 0) {
        settings.set('genres', settings.get('genres').split('_').filter(Boolean));
      }

      const gamesPath = apiPaths.game.list.path;
      const modsPath = apiPaths.mod.list.path;
      const path =
        settings.get('sgame', 'yes') == 'yes' ? gamesPath : modsPath;
      const url =
        apiUrl(path) +
        URLManager.genString(settings, new Dictionary({ size: 'page_size' }));

      const response = await fetch(url, {
        method: 'GET',
        redirect: 'follow',
        credentials: 'include',
      });
      const data = window.OWCore.normalizeCollectionResponse(await response.json());

      if (response.status == 200) {
        data.items.forEach((element) => {
          const existingCard = cardsRoot ? cardsRoot.querySelector('div.card[id="' + String(element.id) + '"]') : null;
          if (!cardsRoot || existingCard) {
            return;
          }

          if (cardsRoot) {
            element.doplink = doplink;

            const tags = [];
            const contextTag = buildContextTag(element, isGameMode, contextSortMode);
            if (contextTag) tags.push(contextTag);

            const card = Cards.create(
              element,
              settings.get('page', 0),
              true,
              settings.get('name', ''),
              isGameMode,
              tags,
              editTrigger,
            );
            cardsRoot.appendChild(card);
            msnry.appended(card);
          }
        });
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
      if (cardsRoot) {
        cardsRoot.style.width = 'auto';
      }
      msnry.reloadItems();
      msnry.layout();
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
