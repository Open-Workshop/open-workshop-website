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
      .replace(/^i/, '')
      .toUpperCase();
    const aliases = {
      MOD_DOWNLOADS: 'DOWNLOADS',
      CREATION_DATE: 'CREATION',
      UPDATE_DATE: 'UPDATE',
      MODS_COUNT: 'MODS',
    };
    return aliases[normalizedSort] || normalizedSort;
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

  window.addEventListener('resize', function () {
    Catalog.masonry();
  });

  window.Catalog = {
    removeAll: function () {
      $('#cards').html('');
    },
    /**
     * @param {Dictionary} settings
     */
    addPage: async function (settings) {
      const editTrigger = String(settings.get('trigger', '')).toLowerCase() === 'edit';
      const doplink = URLManager.genString(settings.duplicate().pop('page').pop('trigger'));
      const contextSortMode = getContextSortMode(settings.get('sort', 'iDOWNLOADS'));

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

      const dependencies = String(settings.get('dependencies', '') || '')
        .replaceAll('_', ',')
        .replaceAll('[', '')
        .replaceAll(']', '')
        .split(',')
        .map((id) => String(id).trim())
        .filter((id) => /^\d+$/.test(id));
      if (dependencies.length > 0) {
        settings.set('dependencies', '[' + dependencies.join(',') + ']');
        settings.set('sgame', 'no');
        settings.set('independents', 'no');
      } else {
        settings.pop('dependencies');
      }

      const isGameMode = settings.get('sgame', 'yes') == 'yes';

      const values = new Dictionary({
        independents: { yes: 'true', no: 'false' },
        sort: {
          DOWNLOADS: 'MOD_DOWNLOADS',
          iDOWNLOADS: 'iMOD_DOWNLOADS',
          CREATION: 'CREATION_DATE',
          iCREATION: 'iCREATION_DATE',
          UPDATE: 'UPDATE_DATE',
          iUPDATE: 'iUPDATE_DATE',
          MODS: 'MODS_COUNT',
          iMODS: 'iMODS_COUNT',
        },
      });
      for (const key in values) {
        if (settings.get(key) != undefined && values[key].get(settings.get(key)) != undefined) {
          settings.set(key, values[key][settings.get(key)]);
        }
      }

      if (settings.get('tags', '').length > 0) {
        settings.set('tags', '[' + String(settings.get('tags').split('_')) + ']');
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
      const data = await response.json();

      if (response.status == 200) {
        data.results.forEach((element) => {
          if ($('#cards').find('div#' + element.id).length <= 0) {
            element.doplink = doplink;

            const tags = [];
            const contextTag = buildContextTag(element, isGameMode, contextSortMode);
            if (contextTag) tags.push(contextTag);

            $('#cards').append(
              Cards.create(
                element,
                settings.get('page', 0),
                true,
                settings.get('name', ''),
                isGameMode,
                tags,
                editTrigger && !isGameMode,
              ),
            );
            msnry.appended(element);
          } else {
            console.log('Duplicate (xuricat paradox): ', element);
          }
        });
      } else {
        console.log('Error addPage: ' + data);
      }

      return data;
    },
    notFound: function () {
      $('#cards').append(
        Cards.create(
          {
            name: 'Ничего не найдено',
            short_description: 'По выбранным параметрам ничего не найдено (×﹏×)',
            logo: '/assets/images/webp/not-found.webp',
          },
          0,
          false,
        ),
      );
      msnry.appended(element);
      Catalog.masonry();
    },
    masonry: function () {
      $('#cards').css('width', 'auto');
      msnry.reloadItems();
      msnry.layout();
    },
    cardShow: function (cardClick) {
      const $cards = $('#cards');
      $cards.addClass('showing');
      $cards.find('.card').removeClass('show');

      const $card = $(cardClick).closest('.card');
      $card.addClass('show');
    },
    cardsCancel: function () {
      const $cards = $('#cards');
      $cards.removeClass('showing');

      $cards.find('.card').removeClass('show');
    },
  };
})();
