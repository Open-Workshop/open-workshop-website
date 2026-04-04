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
    const popup = document.querySelector('div.popup-game-select');
    if (popup) {
      popup.classList.add('reset');
    }

    const searchInput = document.getElementById('search-update-input');
    const query = searchInput ? searchInput.value : '';
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

    if (popup) {
      popup.classList.remove('reset');
    }
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
    const resultsRoot = document.getElementById('all-games-search-results');
    if (resultsRoot) {
      resultsRoot.innerHTML = '';
    }
  }

  function noInList(number) {
    const pNoInList = document.getElementById('show-more-count');
    if (!pNoInList) return;
    pNoInList.textContent = 'И ещё ' + number + ' шт...';

    if (number <= 0) {
      pNoInList.setAttribute('hidden', '');
    } else {
      pNoInList.removeAttribute('hidden');
    }
  }

  function addNewGameResult(gameName, gameID, gameLogo) {
    const normalizedLogo = normalizeGameLogo(gameLogo);
    const newDiv = document.createElement('div');
    newDiv.className = 'in-popup-game-card';
    newDiv.setAttribute('gameid', String(gameID));
    newDiv.setAttribute('style', '--logo-game: url("' + normalizedLogo + '");');
    newDiv.setAttribute('title', gameName);

    const newImg = document.createElement('img');
    newImg.setAttribute('src', normalizedLogo);
    newImg.setAttribute('alt', 'Лого игры');

    const newP = document.createElement('p');
    newP.textContent = gameName;

    newDiv.append(newImg, newP);
    newDiv.addEventListener('click', function () {
      window.gameSelected(newDiv);
    });

    const resultsRoot = document.getElementById('all-games-search-results');
    if (resultsRoot) {
      resultsRoot.appendChild(newDiv);
    }
  }

  window.gameSelected = function gameSelected(element) {
    const container = document.querySelector('div.main-body-game-selector');
    const gameSelectCard = container ? container.querySelector('div.select-game-menu') : document.querySelector('div.select-game-menu');
    const text = element.querySelector('p');
    const image = element.querySelector('img');

    if (gameSelectCard) {
      const label = gameSelectCard.querySelector('p');
      if (label && text) {
        label.textContent = text.textContent || '';
      }
      gameSelectCard.setAttribute('gameid', element.getAttribute('gameid') || '');
    }
    document.querySelectorAll('img.game-select-logo').forEach(function (logo) {
      if (image) {
        logo.setAttribute('src', image.getAttribute('src') || fallbackGameLogo);
      }
    });
    if (container) {
      container.setAttribute('gameid', element.getAttribute('gameid') || '');
      container.classList.remove('active');
    }
  };

  window.stateMachineGameSelect = function stateMachineGameSelect() {
    const container = document.querySelector('div.main-body-game-selector');
    if (!container) return;
    container.classList.toggle('active');
  };

  function initNewGameSelector() {
    bindSelectorToggle();
    const searchInput = document.getElementById('search-update-input');
    if (searchInput) {
      searchInput.addEventListener('input', function () {
        window.searchUpdateInput();
      });
      window.searchUpdateInput();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initNewGameSelector);
  } else {
    initNewGameSelector();
  }
})();
