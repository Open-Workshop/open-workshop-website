/* eslint-env browser */

(function () {
  const root = document.querySelector('main.catalog');
  if (!root) return;

  const { getApiPaths, apiUrl } = window.OWCore;
  const apiPaths = getApiPaths();

  let blocking = false;
  let outOfCards = false;
  let warns = [false, false, false];
  let suppressDependencySync = false;
  let pendingTagSync = false;
  let infiniteScrollObserver = null;
  let infiniteScrollSentinel = null;

  function getTagsEditor() {
    return window.OWPickerEditors ? window.OWPickerEditors.get('catalog-tags-editor') : null;
  }

  function getDependenciesEditor() {
    return window.OWPickerEditors ? window.OWPickerEditors.get('catalog-dependencies-editor') : null;
  }

  function sortOptionsList(mode) {
    const select = document.querySelector('select#sort-select');
    if (!select) return;
    select.classList.toggle('game', !mode);
    select.classList.toggle('mod', mode);
  }

  function getGameSetting() {
    return document.querySelector('setting#game-select');
  }

  function getDependencySetting() {
    return document.querySelector('setting#depen');
  }

  function setSettingChecked(setting, checked) {
    if (!(setting instanceof Element)) return;
    const input = setting.querySelector('input');
    if (input) {
      input.checked = checked;
    }
  }

  function setCatalogSearchValues(value) {
    document.querySelectorAll('#search-in-catalog-header, #search-in-catalog-menu').forEach(function (input) {
      input.value = value;
    });
  }

  function setEndOfCardsVisible(visible) {
    const label = document.querySelector('label#end-of-cards');
    if (!label) return;
    label.style.display = visible ? '' : 'none';
  }

  function parseDependenciesParam(value) {
    return String(value || '')
      .replaceAll('[', '')
      .replaceAll(']', '')
      .replaceAll('_', ',')
      .split(',')
      .map(function (id) {
        return String(id).trim();
      })
      .filter(function (id) {
        return /^\d+$/.test(id);
      });
  }

  function getSelectedDependencyIds() {
    const editor = getDependenciesEditor();
    if (!editor) return [];

    return editor.getState().visible
      .map(function (item) {
        return String(item.id);
      })
      .filter(function (id) {
        return id.length > 0;
      });
  }

  function getSelectedTagIds() {
    const editor = getTagsEditor();
    if (!editor) return [];

    return editor.getState().visible
      .map(function (item) {
        return String(item.id);
      })
      .filter(function (id) {
        return id.length > 0;
      });
  }

  function clearSelectedDependencies() {
    const editor = getDependenciesEditor();
    if (!editor) return;

    suppressDependencySync = true;
    try {
      editor.clearVisibleSelection();
    } finally {
      suppressDependencySync = false;
    }
  }

  function syncDependenceSearchGame(gameID) {
    const editor = getDependenciesEditor();
    if (!editor) return;
    editor.setContext({ gameId: gameID ? String(gameID) : '' });
    if (editor.isOpen()) {
      editor.refresh();
    }
  }

  function syncTagsSearchGame(gameID) {
    const editor = getTagsEditor();
    if (!editor) return;
    editor.setContext({ gameId: gameID ? String(gameID) : '' });
    if (editor.isOpen()) {
      editor.refresh();
    }
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
      setSettingChecked(getDependencySetting(), false);
      setSettingChecked(getGameSetting(), false);
      sortOptionsList(false);
    }

    URLManager.updateParams(updates);
    if (triggerReset) {
      resetCatalog();
    }
    return true;
  }

  function syncTagsUrlFromSelected(selectedIds, triggerReset) {
    const tagsValue = selectedIds.join('_');
    const params = URLManager.getParams();
    if (tagsValue === String(params.get('tags', '') || '')) return false;

    URLManager.updateParams([
      new Dictionary({ key: 'tags', value: tagsValue, default: '' }),
      new Dictionary({ key: 'page', value: 0 }),
    ]);

    if (triggerReset) {
      resetCatalog();
    }
    return true;
  }

  async function hydrateDependenciesFilter(ids) {
    const editor = getDependenciesEditor();
    if (!ids.length || !editor) return;

    suppressDependencySync = true;
    try {
      await editor.setDefaultSelected(ids);
    } finally {
      suppressDependencySync = false;
    }
  }

  function toggleIndependent(settingElement) {
    const setting = settingElement instanceof Element ? settingElement : getDependencySetting();
    const input = setting ? setting.querySelector('input') : null;
    const checked = !(input && input.checked);
    if (input) {
      input.checked = checked;
    }

    const updates = [
      new Dictionary({ key: 'depen', value: checked ? 'yes' : 'no', default: 'no' }),
      new Dictionary({ key: 'page', value: 0 }),
    ];

    if (checked && getSelectedDependencyIds().length > 0) {
      clearSelectedDependencies();
      updates.push(new Dictionary({ key: 'dependencies', value: '', default: '' }));
    }

    URLManager.updateParams(updates);
    resetCatalog();
  }

  function toggleGameMode(settingElement) {
    const setting = settingElement instanceof Element ? settingElement : getGameSetting();
    const input = setting ? setting.querySelector('input') : null;
    const params = URLManager.getParams();
    const checked = !(input && input.checked);
    const hasDependencies =
      getSelectedDependencyIds().length > 0 || parseDependenciesParam(params.get('dependencies', '')).length > 0;

    if (!checked && params.get('game', '') === '' && !hasDependencies) {
      const label = setting ? setting.querySelector('label') : null;
      if (label) {
        label.textContent = 'Выберете игру!';
      }
      return;
    }

    if (input) {
      input.checked = checked;
    }

    sortOptionsList(checked);
    const updates = [
      new Dictionary({ key: 'sgame', value: checked ? 'yes' : 'no', default: 'yes' }),
      new Dictionary({ key: 'page', value: 0 }),
    ];

    if (checked) {
      clearSelectedDependencies();
      updates.push(new Dictionary({ key: 'dependencies', value: '', default: '' }));
    }

    URLManager.updateParams(updates);
    syncDependenceSearchGame(checked ? '' : params.get('game', ''));

    const settingsCatalog = document.getElementById('settings-catalog');
    if (settingsCatalog) {
      settingsCatalog.classList.remove('full-screen');
    }

    resetCatalog();
  }

  function selectGame(gameID) {
    sortOptionsList(false);
    URLManager.updateParams([
      new Dictionary({ key: 'sgame', value: 'no', default: 'yes' }),
      new Dictionary({ key: 'game', value: gameID, default: '' }),
      new Dictionary({ key: 'page', value: 0 }),
    ]);

    const gameSetting = getGameSetting();
    const previewLogo = document.getElementById('preview-logo-card-' + gameID);
    const previewTitle = document.getElementById('titlename' + gameID);
    if (gameSetting) {
      const settingImg = gameSetting.querySelector('img');
      const settingLabel = gameSetting.querySelector('label');
      if (settingImg && previewLogo) {
        settingImg.setAttribute('src', previewLogo.getAttribute('src') || '');
      }
      if (settingLabel && previewTitle) {
        settingLabel.textContent = previewTitle.textContent || '';
      }
    }

    syncTagsSearchGame(gameID);
    syncDependenceSearchGame(gameID);
    pendingTagSync = false;

    const tagsEditor = getTagsEditor();
    if (tagsEditor) {
      tagsEditor.clearVisibleSelection();
    }

    resetCatalog();
  }

  function searchByName(input) {
    const searchInput = input instanceof Element
      ? input
      : document.querySelector(input || '#search-in-catalog-menu');
    if (!searchInput) return;

    setCatalogSearchValues(searchInput.value || '');

    URLManager.updateParams([
      new Dictionary({ key: 'name', value: searchInput.value || '', default: '' }),
      new Dictionary({ key: 'page', value: 0 }),
    ]);

    resetCatalog();
  }

  function refreshCatalogList(input) {
    const menuInput = document.getElementById('search-in-catalog-menu');
    const headerInput = document.getElementById('search-in-catalog-header');
    const searchInput = input || menuInput || headerInput;

    if (searchInput) {
      searchByName(searchInput);
      return;
    }

    URLManager.updateParam('page', 0);
    resetCatalog();
  }

  function applySortSelect(input) {
    const select = input instanceof Element ? input : document.getElementById('sort-select');
    if (!select) return;

    const invertButton = document.querySelector('button#sort-select-invert');
    const invertMode = invertButton && invertButton.classList.contains('toggled') ? 'i' : '';
    URLManager.updateParams([
      new Dictionary({
        key: 'sort',
        value: invertMode + select.value,
        default: 'iDOWNLOADS',
      }),
      new Dictionary({ key: 'page', value: 0 }),
    ]);

    resetCatalog();
  }

  function applyInvertSort(button) {
    const toggleButton = button instanceof Element ? button : document.querySelector('button#sort-select-invert');
    const select = document.querySelector('select#sort-select');
    if (!toggleButton || !select) return;

    const invertMode = toggleButton.classList.contains('toggled') ? 'i' : '';
    URLManager.updateParams([
      new Dictionary({
        key: 'sort',
        value: invertMode + select.value,
        default: 'iDOWNLOADS',
      }),
      new Dictionary({ key: 'page', value: 0 }),
    ]);

    resetCatalog();
  }

  function clearUserFilter() {
    URLManager.updateParams([
      new Dictionary({ key: 'user', value: '', default: '' }),
      new Dictionary({ key: 'page', value: 0 }),
    ]);
    const filterEl = document.getElementById('catalog-user-filter');
    if (filterEl) filterEl.remove();
    resetCatalog();
  }

  async function render(params) {
    const res = await Catalog.addPage(params);
    try {
      if (res.results && res.results.length > 0) {
        const ownerType = params.get('sgame', 'yes') === 'yes' ? 'games' : 'mods';
        await Cards.setterImgs(params.get('page', 0), ownerType);
        return true;
      }
      return false;
    } catch (error) {
      return false;
    }
  }

  async function resetCatalog() {
    blocking = false;
    outOfCards = false;
    warns = [false, false, false];

    setEndOfCardsVisible(false);
    Catalog.removeAll();
    const renderRes = await render(URLManager.getParams());
    if (!renderRes) {
      setEndOfCardsVisible(false);
      outOfCards = true;
      Catalog.notFound();
    }
  }

  function warnAboutCardCount(countElems) {
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
  }

  async function loadNextPage() {
    if (blocking || outOfCards) return;
    blocking = true;

    try {
      const params = URLManager.getParams();
      params.set('page', Number(params.get('page', 0)) + 1);

      const renderRes = await render(params);
      if (renderRes) {
        URLManager.updateParam('page', Number(params.get('page', 0)));
        warnAboutCardCount(document.querySelectorAll('.card').length);
      } else {
        outOfCards = true;
        setEndOfCardsVisible(true);
      }
    } finally {
      blocking = false;
    }
  }

  function ensureInfiniteScrollSentinel() {
    if (infiniteScrollSentinel && infiniteScrollSentinel.isConnected) {
      return infiniteScrollSentinel;
    }

    const cardsContainer = document.getElementById('cards-container');
    if (!cardsContainer) return null;

    infiniteScrollSentinel = document.createElement('div');
    infiniteScrollSentinel.id = 'catalog-scroll-sentinel';
    infiniteScrollSentinel.setAttribute('aria-hidden', 'true');
    infiniteScrollSentinel.style.height = '1px';
    infiniteScrollSentinel.style.opacity = '0';
    infiniteScrollSentinel.style.pointerEvents = 'none';
    cardsContainer.appendChild(infiniteScrollSentinel);
    return infiniteScrollSentinel;
  }

  function bindInfiniteScroll() {
    const sentinel = ensureInfiniteScrollSentinel();
    if (!sentinel || !window.IntersectionObserver) return;

    if (infiniteScrollObserver) {
      infiniteScrollObserver.disconnect();
    }

    infiniteScrollObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          loadNextPage();
        }
      });
    }, {
      root: null,
      rootMargin: '0px 0px 2500px 0px',
      threshold: 0,
    });

    infiniteScrollObserver.observe(sentinel);
  }

  function handleTagsSelectionChange() {
    const editor = getTagsEditor();
    if (!editor) return;

    if (editor.isOpen()) {
      pendingTagSync = true;
      return;
    }

    pendingTagSync = false;
    syncTagsUrlFromSelected(getSelectedTagIds(), true);
  }

  function handleTagsOpenChange(event) {
    if (!event.detail || event.detail.open !== false || !pendingTagSync) return;
    pendingTagSync = false;
    syncTagsUrlFromSelected(getSelectedTagIds(), true);
  }

  function handleDependenciesSelectionChange() {
    if (suppressDependencySync) return;
    syncDependenciesUrlFromSelected(getSelectedDependencyIds(), true);
  }

  function bindPickerEvents() {
    const tagsRoot = document.getElementById('catalog-tags-editor');
    if (tagsRoot && tagsRoot.dataset.catalogBound !== '1') {
      tagsRoot.dataset.catalogBound = '1';
      tagsRoot.addEventListener('ow:picker-selection-change', handleTagsSelectionChange);
      tagsRoot.addEventListener('ow:picker-open-change', handleTagsOpenChange);
    }

    const dependenciesRoot = document.getElementById('catalog-dependencies-editor');
    if (dependenciesRoot && dependenciesRoot.dataset.catalogBound !== '1') {
      dependenciesRoot.dataset.catalogBound = '1';
      dependenciesRoot.addEventListener('ow:picker-selection-change', handleDependenciesSelectionChange);
    }
  }

  async function initCatalogPage() {
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
        params = URLManager.getParams();
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

    const sgame = params.get('sgame', 'yes') === 'yes';

    setSettingChecked(getDependencySetting(), params.get('depen', 'no') === 'yes');
    setSettingChecked(getGameSetting(), sgame);
    setCatalogSearchValues(params.get('name', ''));
    syncTagsSearchGame(params.get('game', ''));
    syncDependenceSearchGame(params.get('game', ''));

    await hydrateDependenciesFilter(parseDependenciesParam(params.get('dependencies', '')));

    URLManager.updateParam('page', Number(params.get('page', 0)));

    sortOptionsList(sgame);
    const tagsEditor = getTagsEditor();
    if (tagsEditor) {
      await tagsEditor.setDefaultSelected(
        params.get('tags', '')
          .replaceAll('_', ',')
          .split(',')
          .map(function (item) {
            return String(item).trim();
          })
          .filter(function (item) {
            return /^\d+$/.test(item);
          }),
      );
    }

    const sortMode = params.get('sort', 'iDOWNLOADS');
    const invertButton = document.querySelector('button#sort-select-invert');
    if (invertButton) {
      invertButton.classList.toggle('toggled', sortMode.startsWith('i'));
    }
    const sortSelectInput = document.querySelector('select#sort-select');
    if (sortSelectInput) {
      sortSelectInput.value = sortMode.replace('i', '');
    }

    if (params.get('game', '') !== '') {
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
        const setting = getGameSetting();
        if (setting) {
          const img = setting.querySelector('img');
          const label = setting.querySelector('label');
          if (img && Array.isArray(logo.results) && logo.results[0]) {
            img.setAttribute('src', logo.results[0]);
          }
          if (label && data.results && data.results[0]) {
            label.textContent = data.results[0].name;
          }
        }
      }
    }

    bindPickerEvents();
    bindInfiniteScroll();
    resetCatalog();
  }

  document.addEventListener('ow:catalog-game-select', function (event) {
    const gameId = event.detail && event.detail.gameId ? String(event.detail.gameId) : '';
    if (gameId) {
      selectGame(gameId);
    }
  });

  document.addEventListener('click', function (event) {
    const target = event.target instanceof Element ? event.target.closest('[data-action]') : null;
    if (!target) return;

    const action = target.dataset.action;

    if (action === 'catalog-toggle-fullscreen') {
      const settings = document.getElementById('settings-catalog');
      if (settings) {
        settings.classList.toggle('full-screen');
      }
      return;
    }

    if (action === 'catalog-clear-user') {
      clearUserFilter();
      return;
    }

    if (action === 'catalog-refresh') {
      const input = document.querySelector(target.dataset.target || '');
      refreshCatalogList(input);
      return;
    }

    if (action === 'catalog-sort-invert') {
      target.classList.toggle('toggled');
      applyInvertSort(target);
      return;
    }

    if (action === 'catalog-toggle-game-mode') {
      toggleGameMode(target);
      return;
    }

    if (action === 'catalog-toggle-independent') {
      toggleIndependent(target);
    }
  });

  document.addEventListener('change', function (event) {
    const target = event.target;
    if (!(target instanceof Element)) return;

    if (target.matches('[data-action="catalog-search"]')) {
      searchByName(target);
      return;
    }

    if (target.matches('[data-action="catalog-sort-select"]')) {
      applySortSelect(target);
    }
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCatalogPage);
  } else {
    initCatalogPage();
  }
})();
