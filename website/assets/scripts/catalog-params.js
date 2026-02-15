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

  function parseDependenciesParam(value) {
    return String(value || '')
      .replaceAll('[', '')
      .replaceAll(']', '')
      .replaceAll('_', ',')
      .split(',')
      .map((id) => String(id).trim())
      .filter((id) => /^\d+$/.test(id));
  }

  function getSelectedDependencyIds() {
    return $('#mod-dependence-selected')
      .find('div.element:not(.none-display)')
      .map(function () {
        return String($(this).attr('modid'));
      })
      .get()
      .filter((id) => id.length > 0);
  }

  function clearSelectedDependencies() {
    const $container = $('#mod-dependence-selected');
    if (!$container.length) return;
    $container.find('div.element').addClass('none-display');
    $container.parent().parent().trigger('event-height');
  }

  function syncDependenceSearchGame(gameID) {
    const $dependenceSearchInput = $('#search-update-input-dependence');
    if (!$dependenceSearchInput.length) return;
    $dependenceSearchInput.attr('gameid', gameID ? String(gameID) : '');
  }

  function syncDependenciesUrlFromSelected(selectedIds, triggerReset) {
    const params = URLManager.getParams();
    const dependenciesValue = selectedIds.join('_');
    const currentDependenciesValue = parseDependenciesParam(params.get('dependencies', '')).join('_');

    if (dependenciesValue === currentDependenciesValue) return false;

    const updates = [
      new Dictionary({ key: 'dependencies', value: dependenciesValue, default: '' }),
      new Dictionary({ key: 'page', value: 0 }),
    ];

    if (selectedIds.length > 0) {
      updates.push(new Dictionary({ key: 'sgame', value: 'no', default: 'yes' }));
      updates.push(new Dictionary({ key: 'depen', value: 'no', default: 'no' }));
      $('setting#depen').find('input').prop('checked', false);
      $('setting#game-select').find('input').prop('checked', false);
      sortOptionsList(false);
    }

    URLManager.updateParams(updates);
    if (triggerReset) {
      resetCatalog();
    }
    return true;
  }

  function appendSelectedDependency(modName, modID, modLogo) {
    const $container = $('#mod-dependence-selected');
    if (!$container.length) return;

    const id = String(modID);
    const $exists = $container.find(`div.element[modid="${id}"]`).first();
    if ($exists.length) {
      $exists.removeClass('none-display');
      return;
    }

    const $item = $('<div/>', {
      class: 'element',
      modid: id,
      onclick: 'editModDependence(this)',
      saved: true,
    });
    const $logo = $('<img/>', {
      src: modLogo || '/assets/images/image-not-found.webp',
      alt: 'Логотип мода',
      onerror: 'handlerImgErrorLoad(this)',
    });
    const $meta = $('<e/>');
    const $title = $('<h3/>', {
      translate: 'no',
      title: modName,
      text: modName,
    });
    const $remove = $('<img/>', {
      src: '/assets/images/removal-triangle.svg',
      alt: 'Кнопка удаления зависимости',
    });

    $meta.append($title, $remove);
    $item.append($logo, $meta);
    $container.append($item);
  }

  async function hydrateDependenciesFilter(ids) {
    if (!ids.length || !$('#mod-dependence-selected').length) return;

    const modsPath = apiPaths.mod.list.path;
    const resourcesPath = apiPaths.resource.list.path;
    const idsAsList = '[' + ids.join(',') + ']';

    const [modsResponse, logosResponse] = await Promise.all([
      fetch(`${apiUrl(modsPath)}?allowed_ids=${idsAsList}&page_size=50`, { credentials: 'include' }),
      fetch(`${apiUrl(resourcesPath)}?owner_type=mods&owner_ids=${idsAsList}&types_resources=["logo"]`, {
        credentials: 'include',
      }),
    ]);

    if (!modsResponse.ok) return;

    const [modsData, logosData] = await Promise.all([
      modsResponse.json().catch(() => ({ results: [] })),
      logosResponse.ok ? logosResponse.json().catch(() => ({ results: [] })) : Promise.resolve({ results: [] }),
    ]);

    const logosById = {};
    (logosData.results || []).forEach((logo) => {
      if (!logo || logo.owner_id === undefined || !logo.url) return;
      logosById[String(logo.owner_id)] = logo.url;
    });

    const modsById = {};
    (modsData.results || []).forEach((mod) => {
      if (!mod || mod.id === undefined) return;
      modsById[String(mod.id)] = mod;
    });

    ids.forEach((id) => {
      const mod = modsById[String(id)];
      if (!mod) return;
      appendSelectedDependency(mod.name, mod.id, logosById[String(mod.id)]);
    });

    $('#mod-dependence-selected').parent().parent().trigger('event-height');
  }

  window.undependencyMod = function undependencyMod() {
    const $this = $(this);
    const $input = $this.find('input');

    const checked = !$input.prop('checked');
    $input.prop('checked', checked);
    const updates = [
      new Dictionary({ key: 'depen', value: checked ? 'yes' : 'no', default: 'no' }),
      new Dictionary({ key: 'page', value: 0 }),
    ];

    // API conflicts on independents=true with dependencies filter.
    if (checked && getSelectedDependencyIds().length > 0) {
      clearSelectedDependencies();
      updates.push(new Dictionary({ key: 'dependencies', value: '', default: '' }));
    }

    URLManager.updateParams(updates);
    resetCatalog();
  };

  window.stateMachineGameSelect = function stateMachineGameSelect() {
    const $this = $(this);
    const $input = $this.find('input');

    const params = URLManager.getParams();
    const checked = !$input.prop('checked');
    const hasDependencies =
      getSelectedDependencyIds().length > 0 || parseDependenciesParam(params.get('dependencies', '')).length > 0;

    if (!checked && params.get('game', '') == '' && !hasDependencies) {
      $this.find('label').text('Выберете игру!');
    } else {
      $input.prop('checked', checked);
      sortOptionsList(checked);
      const updates = [
        new Dictionary({ key: 'sgame', value: checked ? 'yes' : 'no', default: 'yes' }),
        new Dictionary({ key: 'page', value: 0 }),
      ];
      if (checked) {
        // В режиме игр фильтр по модам не применяется.
        clearSelectedDependencies();
        updates.push(new Dictionary({ key: 'dependencies', value: '', default: '' }));
      }
      URLManager.updateParams(updates);
      syncDependenceSearchGame(checked ? '' : params.get('game', ''));
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
    syncDependenceSearchGame(gameID);
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

  window.refreshCatalog = function refreshCatalog(input) {
    const menuInput = document.getElementById('search-in-catalog-menu');
    const headerInput = document.getElementById('search-in-catalog-header');
    const searchInput = input || menuInput || headerInput;

    if (searchInput) {
      window.nameSearch(searchInput);
      return;
    }

    URLManager.updateParam('page', 0);
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
    let params = URLManager.getParams();
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

    const dependencyIds = parseDependenciesParam(params.get('dependencies', ''));
    const dependencyUpdates = [];
    const normalizedDependenciesValue = dependencyIds.join('_');
    if (normalizedDependenciesValue !== String(params.get('dependencies', '') || '')) {
      dependencyUpdates.push(
        new Dictionary({ key: 'dependencies', value: normalizedDependenciesValue, default: '' }),
      );
    }
    if (dependencyIds.length > 0 && params.get('sgame', 'yes') !== 'no') {
      dependencyUpdates.push(new Dictionary({ key: 'sgame', value: 'no', default: 'yes' }));
    }
    if (dependencyIds.length > 0 && params.get('depen', 'no') === 'yes') {
      dependencyUpdates.push(new Dictionary({ key: 'depen', value: 'no', default: 'no' }));
    }
    if (dependencyUpdates.length > 0) {
      dependencyUpdates.push(new Dictionary({ key: 'page', value: 0 }));
      URLManager.updateParams(dependencyUpdates);
      params = URLManager.getParams();
    }

    const sgame = params.get('sgame', 'yes') == 'yes';

    $('setting#depen').find('input').prop('checked', params.get('depen', 'no') == 'yes');
    $('setting#game-select').find('input').prop('checked', sgame);
    $('input#search-in-catalog-header').val(params.get('name', ''));
    $('input#search-in-catalog-menu').val(params.get('name', ''));
    $('#search-update-input-tags').attr('gameid', params.get('game', ''));
    syncDependenceSearchGame(params.get('game', ''));

    await hydrateDependenciesFilter(parseDependenciesParam(params.get('dependencies', '')));

    URLManager.updateParam('page', Number(params.get('page', 0)));

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

    resetCatalog();
  });

  window.addEventListener('ow:dependencies-changed', function () {
    syncDependenciesUrlFromSelected(getSelectedDependencyIds(), true);
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
