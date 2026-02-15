(function () {
  const apiPaths = window.OWCore.getApiPaths();
  const listPath = apiPaths.game.list.path;
  const resourcesPath = apiPaths.resource && apiPaths.resource.list ? apiPaths.resource.list.path : null;
  const fallbackGameLogo =
    (window.OW &&
      window.OW.assets &&
      window.OW.assets.images &&
      (window.OW.assets.images.loading || window.OW.assets.images.fallback)) ||
    '/assets/images/choose-man.webp';

  function bindSelectorToggle() {
    const container = document.querySelector('div.main-body-game-selector');
    if (!container || container.dataset.toggleBound === '1') return;
    container.dataset.toggleBound = '1';

    container.addEventListener('click', function (event) {
      const target = event.target;
      if (!(target instanceof Element)) return;

      // Внутри popup должны работать свои действия (поиск, выбор карточки) без toggle контейнера.
      if (target.closest('div.popup-game-select')) return;

      window.stateMachineGameSelect();
    });
  }

  window.searchUpdateInput = async function searchUpdateInput() {
    const $popup = $('div.popup-game-select');
    $popup.addClass('reset');

    const query = $('input#search-update-input').val();
    const gamesParams = new URLSearchParams({
      page_size: '5',
      name: String(query || ''),
    });
    let data = { database_size: 0, results: [] };

    try {
      const ref = await fetch(`${window.OWCore.apiUrl(listPath)}?${gamesParams.toString()}`, {
        credentials: 'include',
      });
      data = await ref.json();
    } catch (error) {
      data = { database_size: 0, results: [] };
    }

    const safeResults = Array.isArray(data.results) ? data.results : [];
    const logosMap = await fetchGameLogos(safeResults);

    clearSearchResults();
    noInList((Number(data.database_size) || 0) - safeResults.length);

    safeResults.forEach((t) => {
      const logo = normalizeGameLogo(t.logo || logosMap[String(t.id)]);
      addNewGameResult(t.name, t.id, logo);
    });

    $popup.removeClass('reset');
  };

  async function fetchGameLogos(games) {
    if (!resourcesPath || !Array.isArray(games) || !games.length) return {};

    const ids = games
      .map((game) => game && game.id)
      .filter((id) => id !== undefined && id !== null);
    if (!ids.length) return {};

    const ownerIds = `[${ids.join(',')}]`;
    const resourcesParams = new URLSearchParams({
      owner_type: 'games',
      owner_ids: ownerIds,
      types_resources: '["logo"]',
    });

    try {
      const ref = await fetch(`${window.OWCore.apiUrl(resourcesPath)}?${resourcesParams.toString()}`, {
        credentials: 'include',
      });
      if (!ref.ok) return {};

      const data = await ref.json();
      const results = Array.isArray(data.results) ? data.results : [];
      const map = {};
      results.forEach((item) => {
        if (!item || item.owner_id === undefined || item.owner_id === null || !item.url) return;
        map[String(item.owner_id)] = item.url;
      });
      return map;
    } catch (error) {
      return {};
    }
  }

  function normalizeGameLogo(logo) {
    if (typeof logo !== 'string') return fallbackGameLogo;
    const cleanLogo = logo.trim();
    return cleanLogo.length ? cleanLogo : fallbackGameLogo;
  }

  function clearSearchResults() {
    $('div#all-games-search-results').empty();
  }

  function noInList(number) {
    const pNoInList = $('p#show-more-count');
    pNoInList.text('И ещё ' + number + ' шт...');

    if (number <= 0) {
      pNoInList.attr('hidden', '');
    } else {
      pNoInList.removeAttr('hidden');
    }
  }

  function addNewGameResult(gameName, gameID, gameLogo) {
    const normalizedLogo = normalizeGameLogo(gameLogo);
    const newDiv = $('<div/>', {
      class: 'in-popup-game-card',
      gameid: gameID,
      style: '--logo-game: url("' + normalizedLogo + '");',
      onclick: 'gameSelected($(this))',
      title: gameName,
    });

    const newImg = $('<img/>', {
      src: normalizedLogo,
      alt: 'Лого игры',
      onerror: 'handlerImgErrorLoad(this)',
    });

    const newP = $('<p/>', {
      text: gameName,
    });

    newDiv.append(newImg, newP);
    $('div#all-games-search-results').append(newDiv);
  }

  window.gameSelected = function gameSelected(element) {
    const container = document.querySelector('div.main-body-game-selector');
    const gameSelectCard = container ? $(container).find('div.select-game-menu').first() : $('div.select-game-menu');

    gameSelectCard.children('p').text(element.children('p').text());
    $('img.game-select-logo').attr('src', element.children('img').attr('src'));
    gameSelectCard.attr('gameid', element.attr('gameid'));
    if (container) {
      container.setAttribute('gameid', element.attr('gameid'));
      container.classList.remove('active');
    }
  };

  window.stateMachineGameSelect = function stateMachineGameSelect() {
    const container = document.querySelector('div.main-body-game-selector');
    if (!container) return;
    container.classList.toggle('active');
  };

  $(document).ready(function () {
    bindSelectorToggle();
    if (document.getElementById('search-update-input')) {
      window.searchUpdateInput();
    }
  });
})();
