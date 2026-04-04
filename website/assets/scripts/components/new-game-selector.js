(function () {
  const apiPaths = window.OWCore.getApiPaths();
  const listPath = apiPaths.game.list.path;
  const resourcesPath = apiPaths.resource && apiPaths.resource.list ? apiPaths.resource.list.path : null;
  const owConfig = window.OWCore.getConfig ? window.OWCore.getConfig() : {};
  const fallbackGameLogo =
    (owConfig.assets &&
      owConfig.assets.images &&
      (owConfig.assets.images.loading || owConfig.assets.images.fallback)) ||
    '/assets/images/choose-man.webp';

  function normalizeGameLogo(logo) {
    if (typeof logo !== 'string') return fallbackGameLogo;
    const cleanLogo = logo.trim();
    return cleanLogo.length ? cleanLogo : fallbackGameLogo;
  }

  async function fetchGameLogos(games) {
    if (!resourcesPath || !Array.isArray(games) || !games.length) return {};

    const ids = games
      .map(function (game) {
        return game && game.id;
      })
      .filter(function (id) {
        return id !== undefined && id !== null;
      });
    if (!ids.length) return {};

    const resourcesParams = new URLSearchParams({
      owner_type: 'games',
      owner_ids: `[${ids.join(',')}]`,
      types_resources: '["logo"]',
    });

    try {
      const response = await fetch(`${window.OWCore.apiUrl(resourcesPath)}?${resourcesParams.toString()}`, {
        credentials: 'include',
      });
      if (!response.ok) return {};

      const data = await response.json();
      return (Array.isArray(data.results) ? data.results : []).reduce(function (acc, item) {
        if (!item || item.owner_id === undefined || item.owner_id === null || !item.url) return acc;
        acc[String(item.owner_id)] = item.url;
        return acc;
      }, {});
    } catch (error) {
      return {};
    }
  }

  function createResultCard(game) {
    const normalizedLogo = normalizeGameLogo(game.logo);
    const card = document.createElement('div');
    card.className = 'in-popup-game-card';
    card.dataset.gameId = String(game.id);
    card.dataset.gameName = String(game.name || '');
    card.dataset.gameLogo = normalizedLogo;
    card.style.setProperty('--logo-game', `url("${normalizedLogo}")`);
    card.title = String(game.name || '');

    const image = document.createElement('img');
    image.src = normalizedLogo;
    image.alt = 'Лого игры';

    const title = document.createElement('p');
    title.textContent = String(game.name || '');

    card.append(image, title);
    return card;
  }

  function bindNewGameSelector(container) {
    if (!(container instanceof Element) || container.dataset.newGameSelectorBound === '1') return;
    container.dataset.newGameSelectorBound = '1';

    const menu = container.querySelector('.select-game-menu');
    const popup = container.querySelector('.popup-game-select');
    const resultsRoot = container.querySelector('#all-games-search-results');
    const searchInput = container.querySelector('#search-update-input');
    const showMoreNode = container.querySelector('#show-more-count');
    const logos = container.querySelectorAll('img.game-select-logo');

    if (!menu || !popup || !resultsRoot || !searchInput) return;

    let requestCounter = 0;

    function setOpen(open) {
      container.classList.toggle('active', open);
    }

    function updateOverflowCount(number) {
      if (!showMoreNode) return;
      showMoreNode.textContent = 'И ещё ' + number + ' шт...';
      showMoreNode.toggleAttribute('hidden', number <= 0);
    }

    function clearSearchResults() {
      resultsRoot.innerHTML = '';
    }

    function applySelectedGame(card) {
      const gameId = card.dataset.gameId || '';
      const gameName = card.dataset.gameName || 'Игра не выбрана';
      const logoUrl = normalizeGameLogo(card.dataset.gameLogo);
      const label = menu.querySelector('p');

      if (label) {
        label.textContent = gameName;
      }
      menu.setAttribute('gameid', gameId);
      container.setAttribute('gameid', gameId);
      logos.forEach(function (logo) {
        logo.src = logoUrl;
      });
      setOpen(false);
    }

    async function refreshResults() {
      popup.classList.add('reset');
      const requestId = ++requestCounter;
      const gamesParams = new URLSearchParams({
        page_size: '5',
        name: String(searchInput.value || ''),
      });

      let data = { database_size: 0, results: [] };
      try {
        const response = await fetch(`${window.OWCore.apiUrl(listPath)}?${gamesParams.toString()}`, {
          credentials: 'include',
        });
        data = await response.json();
      } catch (error) {
        data = { database_size: 0, results: [] };
      }

      if (requestId !== requestCounter) return;

      const safeResults = Array.isArray(data.results) ? data.results : [];
      const logosMap = await fetchGameLogos(safeResults);
      if (requestId !== requestCounter) return;

      clearSearchResults();
      updateOverflowCount((Number(data.database_size) || 0) - safeResults.length);

      safeResults.forEach(function (item) {
        resultsRoot.appendChild(createResultCard({
          id: item.id,
          name: item.name,
          logo: item.logo || logosMap[String(item.id)],
        }));
      });

      popup.classList.remove('reset');
    }

    container.addEventListener('click', function (event) {
      const target = event.target;
      if (!(target instanceof Element)) return;

      const card = target.closest('.in-popup-game-card');
      if (card && resultsRoot.contains(card)) {
        applySelectedGame(card);
        return;
      }

      if (target.closest('.popup-game-select')) return;
      setOpen(!container.classList.contains('active'));
    });

    searchInput.addEventListener('input', refreshResults);
    refreshResults();
  }

  function initNewGameSelectors() {
    document.querySelectorAll('.main-body-game-selector').forEach(bindNewGameSelector);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initNewGameSelectors);
  } else {
    initNewGameSelectors();
  }
})();
