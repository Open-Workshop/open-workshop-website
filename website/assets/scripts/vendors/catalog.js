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
      const doplink = URLManager.genString(settings.duplicate().pop('page'));

      settings.set('description', true);
      settings.set('short_description', true);
      settings.set('page_size', 30);
      settings.set('statistics', true);

      const keys = [['depen', 'independents']];
      keys.forEach((key) => {
        if (settings.get(key[0]) != undefined) {
          settings.replaceKey(key[0], key[1]);
        }
      });

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
            if (element.mods_downloads || element.downloads) {
              tags.push({
                text: '📥',
                description: element.mods_downloads
                  ? 'Скачиваний у всех модов игры'
                  : 'Скачиваний',
                value: element.mods_downloads || element.downloads,
              });
            }
            if (element.size) {
              tags.push({
                text: '📦',
                description: 'Размер мода',
                value: element.size,
                type: 'size',
              });
            }
            if (element.mods_count) {
              tags.push({
                text: '🔭',
                description: 'Количество модов',
                value: element.mods_count,
              });
            }

            $('#cards').append(
              Cards.create(
                element,
                settings.get('page', 0),
                true,
                settings.get('name', ''),
                settings.get('sgame', 'yes') == 'yes',
                tags,
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
