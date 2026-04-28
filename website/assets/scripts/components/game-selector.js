/* eslint-env browser */

(function () {
  function initLegacyGameSelector(root) {
    if (!(root instanceof Element) || root.dataset.legacyGameSelectorBound === '1') return;

    const infoPath = root.dataset.gameInfoPath || '';
    const listPath = root.dataset.gameListPath || '';
    const apiBase = root.dataset.apiBase || '';
    const idInput = root.querySelector('[data-role="legacy-game-selector-id"]');
    const namePreview = root.querySelector('#name-game-select');
    const nameInput = root.querySelector('[data-role="legacy-game-selector-name"]');
    const applyButton = root.querySelector('[data-action="legacy-game-selector-apply"]');
    const logo = root.querySelector('#logo-game-select');
    const unlockButton = root.querySelector('[data-action="legacy-game-selector-unlock"]');
    const fallbackImage = window.OWCore.getImageFallback();
    let searchTimer = 0;

    if (!idInput || !namePreview || !nameInput || !applyButton || !logo) return;
    root.dataset.legacyGameSelectorBound = '1';

    function setColor(color) {
      namePreview.style.color = 'dark' + color;
      nameInput.style.color = color;
    }

    function triggerDynamLen() {
      nameInput.dispatchEvent(new Event('event-height', { bubbles: true }));
      nameInput.dispatchEvent(new Event('input', { bubbles: true }));
    }

    async function renderSelectedGame() {
      applyButton.disabled = true;
      if (!String(idInput.value || '').trim()) {
        namePreview.textContent = '';
        nameInput.value = '';
        nameInput.setAttribute('lastval', '');
        logo.setAttribute('src', fallbackImage);
        idInput.removeAttribute('found');
        triggerDynamLen();
        return;
      }

      const gameInfoUrl = apiBase + infoPath.replace('{game_id}', idInput.value);
      const response = await fetch(gameInfoUrl, { method: 'GET' }).catch(function () { return null; });
      const json = response ? await response.json().catch(function () { return null; }) : null;

      const data = window.OWCore.normalizeCollectionResponse(json);
      const result = data && data.result ? data.result : data;

      if (result) {
        namePreview.textContent = result.name;
        namePreview.style.color = 'darkgray';
        nameInput.value = result.name;
        nameInput.setAttribute('lastval', result.name);
        nameInput.style.color = 'gray';
        logo.setAttribute('src', String(result.logo || '').trim() || fallbackImage);
        idInput.setAttribute('found', 'true');
      } else {
        namePreview.textContent = '';
        namePreview.style.color = 'darkred';
        nameInput.value = '';
        nameInput.setAttribute('lastval', '');
        nameInput.style.color = 'red';
        logo.setAttribute('src', fallbackImage);
        idInput.removeAttribute('found');
      }
      triggerDynamLen();
    }

    async function updateNameSearch() {
      const currentValue = nameInput.value || '';
      nameInput.setAttribute('lastval', currentValue);

      if (currentValue.length <= 0) {
        applyButton.disabled = true;
        namePreview.textContent = ' ';
        setColor('grey');
        return;
      }

      if (!(namePreview.textContent || '').toUpperCase().startsWith(currentValue.toUpperCase())) {
        namePreview.textContent = ' ';
      }

      const response = await fetch(apiBase + listPath + '?page_size=1&sort=name&name=' + encodeURIComponent(currentValue), {
        method: 'GET',
        credentials: 'include',
      }).catch(function () { return null; });
      const data = window.OWCore.normalizeCollectionResponse(
        response ? await response.json().catch(function () { return { items: [] }; }) : { items: [] },
      );

      if (Array.isArray(data.items) && data.items.length) {
        setColor('grey');
        const serverName = String(data.items[0].name || '').toUpperCase();
        const userName = currentValue.toUpperCase();

        if (serverName.startsWith(userName)) {
          applyButton.disabled = false;
          applyButton.setAttribute('gameid', data.items[0].id);
          namePreview.textContent = serverName;
        } else {
          applyButton.disabled = true;
          namePreview.textContent = ' ';
        }
      } else {
        applyButton.disabled = true;
        namePreview.textContent = ' ';
        setColor('red');
      }
    }

    nameInput.addEventListener('input', function () {
      if (nameInput.value.length > 0) {
        nameInput.style.minWidth = '15px';
      } else {
        nameInput.style.minWidth = '155px';
      }

      window.clearTimeout(searchTimer);
      searchTimer = window.setTimeout(updateNameSearch, 250);
    });

    nameInput.addEventListener('focus', function () {
      setColor('grey');
      nameInput.setAttribute('dynamlen', 'true');
      triggerDynamLen();
    });

    nameInput.addEventListener('blur', function () {
      triggerDynamLen();
    });

    idInput.addEventListener('change', renderSelectedGame);

    applyButton.addEventListener('click', function () {
      idInput.value = applyButton.getAttribute('gameid') || '';
      renderSelectedGame();
    });

    if (unlockButton) {
      unlockButton.addEventListener('click', function () {
        unlockButton.hidden = true;
        root.querySelectorAll('input.edit-mod-game-input').forEach(function (input) {
          input.removeAttribute('disabled');
        });
      });
    }

    renderSelectedGame();
  }

  function initAllLegacyGameSelectors() {
    document.querySelectorAll('.game-selector').forEach(initLegacyGameSelector);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAllLegacyGameSelectors);
  } else {
    initAllLegacyGameSelectors();
  }
})();
