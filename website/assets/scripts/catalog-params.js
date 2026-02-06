/* eslint-env browser */

(function () {
  const { getApiPaths, apiUrl } = window.OWCore;
  const apiPaths = getApiPaths();

  let blocking = false;
  let outOfCards = false;
  let warns = [false, false, false];

  function sortOptionsList(mode) {
    $('select#sort-select').toggleClass('game', !mode).toggleClass('mod', mode);
  }

  window.undependencyMod = function undependencyMod() {
    const $this = $(this);
    const $input = $this.find('input');

    const checked = !$input.prop('checked');
    $input.prop('checked', checked);
    URLManager.updateParams([
      new Dictionary({ key: 'depen', value: checked ? 'yes' : 'no', default: 'no' }),
      new Dictionary({ key: 'page', value: 0 }),
    ]);
    resetCatalog();
  };

  window.stateMachineGameSelect = function stateMachineGameSelect() {
    const $this = $(this);
    const $input = $this.find('input');

    const params = URLManager.getParams();
    const checked = !$input.prop('checked');
    if (!checked && params.get('game', '') == '') {
      $this.find('label').text('Выберете игру!');
    } else {
      $input.prop('checked', checked);
      sortOptionsList(checked);
      URLManager.updateParams([
        new Dictionary({ key: 'sgame', value: checked ? 'yes' : 'no', default: 'yes' }),
        new Dictionary({ key: 'page', value: 0 }),
      ]);
      $('#settings-catalog').removeClass('full-screen');
      resetCatalog();
    }
  };

  window.gameSelect = function gameSelect(gameID) {
    sortOptionsList(false);
    URLManager.updateParams([
      new Dictionary({ key: 'sgame', value: 'no', default: 'yes' }),
      new Dictionary({ key: 'game', value: gameID, default: '' }),
      new Dictionary({ key: 'page', value: 0 }),
    ]);

    $('setting#game-select')
      .find('img')
      .attr('src', $('img#preview-logo-card-' + gameID).attr('src'));
    $('setting#game-select').find('label').text($('h2#titlename' + gameID).text());
    $('#search-update-input-tags').attr('gameid', gameID);
    TagsSelector.unselectAllTags();

    resetCatalog();
  };

  window.nameSearch = function nameSearch(input) {
    const $input = $(input);

    $('input#search-in-catalog-header').val($input.val());
    $('input#search-in-catalog-menu').val($input.val());

    URLManager.updateParams([
      new Dictionary({ key: 'name', value: $input.val(), default: '' }),
      new Dictionary({ key: 'page', value: 0 }),
    ]);

    resetCatalog();
  };

  window.sortSelect = function sortSelect(input) {
    const $this = $(input);

    const invertMode = $('button#sort-select-invert').hasClass('toggled') ? 'i' : '';
    URLManager.updateParams([
      new Dictionary({
        key: 'sort',
        value: invertMode + $this.val(),
        default: 'iDOWNLOADS',
      }),
      new Dictionary({ key: 'page', value: 0 }),
    ]);

    resetCatalog();
  };

  window.invertSort = function invertSort(button) {
    const $this = $(button);

    const invertMode = $this.hasClass('toggled') ? 'i' : '';
    URLManager.updateParams([
      new Dictionary({
        key: 'sort',
        value: invertMode + $('select#sort-select').val(),
        default: 'iDOWNLOADS',
      }),
      new Dictionary({ key: 'page', value: 0 }),
    ]);

    resetCatalog();
  };

  window.clearUserFilter = function clearUserFilter() {
    URLManager.updateParams([
      new Dictionary({ key: 'user', value: '', default: '' }),
      new Dictionary({ key: 'page', value: 0 }),
    ]);
    const filterEl = document.getElementById('catalog-user-filter');
    if (filterEl) filterEl.remove();
    resetCatalog();
  };

  async function render(params) {
    const res = await Catalog.addPage(params);
    try {
      if (res.results && res.results.length > 0) {
        const ownerType = params.get('sgame', 'yes') == 'yes' ? 'games' : 'mods';
        await Cards.setterImgs(params.get('page', 0), ownerType);
        return true;
      }
      return false;
    } catch (error) {
      console.log(error);
      return false;
    }
  }

  async function resetCatalog() {
    blocking = false;
    outOfCards = false;
    warns = [false, false, false];

    $('label#end-of-cards').fadeOut(100);
    Catalog.removeAll();
    const renderRes = await render(URLManager.getParams());
    if (!renderRes) {
      $('label#end-of-cards').hide();
      outOfCards = true;
      Catalog.notFound();
    }
  }

  $(document).ready(async function () {
    const params = URLManager.getParams();
    const filterEl = document.getElementById('catalog-user-filter');
    if (filterEl) {
      const userId = filterEl.getAttribute('data-user-id');
      const currentUser = params.get('user', '');
      const currentSGame = params.get('sgame', 'yes');
      if (currentUser !== String(userId) || currentSGame !== 'no') {
        URLManager.updateParams([
          new Dictionary({ key: 'user', value: String(userId), default: '' }),
          new Dictionary({ key: 'sgame', value: 'no', default: 'yes' }),
          new Dictionary({ key: 'page', value: 0 }),
        ]);
        params.set('user', String(userId));
        params.set('sgame', 'no');
      }
    }
    const sgame = params.get('sgame', 'yes') == 'yes';

    $('setting#depen').find('input').attr('checked', params.depen == 'yes');
    $('setting#game-select').find('input').attr('checked', sgame);
    $('input#search-in-catalog-header').val(params.get('name', ''));
    $('input#search-in-catalog-menu').val(params.get('name', ''));
    $('#search-update-input-tags').attr('gameid', params.get('game', ''));

    URLManager.updateParam('page', Number(URLManager.getParams().get('page', 0)));
    resetCatalog();

    sortOptionsList(sgame);
    TagsSelector.setDefaultSelectedTags(params.get('tags', '').replaceAll('_', ','));
    const sortMode = params.get('sort', 'iDOWNLOADS');
    $('button#sort-select-invert').toggleClass('toggled', sortMode.startsWith('i'));
    $('select#sort-select').val(sortMode.replace('i', ''));

    if (params.get('game', '') != '') {
      const gameListPath = apiPaths.game.list.path;
      const resourcesPath = apiPaths.resource.list.path;
      const gameIds = '[' + params.get('game', '') + ']';

      const [gameResponse, logoResponse] = await Promise.all([
        fetch(`${apiUrl(gameListPath)}?allowed_ids=${gameIds}`),
        fetch(
          `${apiUrl(resourcesPath)}?owner_type=games&owner_ids=${gameIds}&types_resources=["logo"]&only_urls=true`,
        ),
      ]);

      if (gameResponse.ok && logoResponse.ok) {
        const [data, logo] = await Promise.all([gameResponse.json(), logoResponse.json()]);
        $('setting#game-select').find('img').attr('src', logo.results[0]);
        $('setting#game-select').find('label').text(data.results[0].name);
      }
    }
  });

  setInterval(function () {
    if ($('div.popup-tags-select').hasClass('popup-nonvisible')) {
      const params = URLManager.getParams();
      const tags = TagsSelector.returnSelectedTags().selected;

      if (String(tags).replaceAll(',', '_') != params.get('tags', '')) {
        URLManager.updateParams([
          new Dictionary({ key: 'tags', value: String(tags).replaceAll(',', '_'), default: '' }),
          new Dictionary({ key: 'page', value: 0 }),
        ]);
        resetCatalog();
      }
    }
  }, 1000);

  setInterval(async () => {
    if (
      window.innerHeight + window.scrollY >= document.body.offsetHeight - 2500 &&
      !blocking &&
      !outOfCards
    ) {
      blocking = true;

      const params = URLManager.getParams();
      params.set('page', Number(params.get('page', 0)) + 1);

      const renderRes = await render(params);

      if (renderRes) {
        URLManager.updateParam('page', Number(params.get('page', 0)));
        const countElems = document.querySelectorAll('.card').length;
        if (countElems >= 500 && warns[0] === false) {
          warns[0] = true;
          new Toast({
            title: 'Рекомендуем обновить страницу',
            text: 'На странице ' + countElems + ' карточек из-за чего рендер замедляется!',
            theme: 'warning',
          });
        } else if (countElems > 700 && warns[1] === false) {
          warns[1] = true;
          new Toast({
            title: 'Обновите страницу',
            text: 'На странице ' + countElems + ' карточек из-за чего рендер замедляется!!',
            theme: 'error',
          });
        } else if (countElems > 1000 && warns[2] === false) {
          warns[2] = true;
          new Toast({
            title: 'Обновите страницу!',
            text: 'На странице ' + countElems + ' карточек из-за чего рендер замедляется!!!',
            theme: 'critical',
          });
        }
      } else {
        outOfCards = true;
        $('label#end-of-cards').fadeIn(100);
      }

      blocking = false;
    }
  }, 2000);
})();
