(function () {
  const root = document.getElementById('main-container');
  if (!root) return;

  let config = {};
  try {
    config = JSON.parse(root.dataset.addPage || '{}');
  } catch (error) {
    config = {};
  }
  const addKind = String(config.kind || root.dataset.addKind || 'mod').toLowerCase();
  const apiBase = window.OWCore.getApiBase();
  const apiPaths = window.OWCore.getApiPaths();
  const addModEndpoint = apiPaths.mod && apiPaths.mod.add ? apiPaths.mod.add : null;
  const addGameEndpoint = apiPaths.game && apiPaths.game.add ? apiPaths.game.add : null;
  const uploadProgress = window.OWUI
    ? window.OWUI.createUploadProgress(root.querySelector('[data-upload-progress-root]'))
    : null;

  const titleInput = document.querySelector('input#entity-name-title');
  const fileInput = document.querySelector('input#input-mod-file-upload');
  const gameSelector = document.querySelector('div.main-body-game-selector');
  const descriptionModules = Array.isArray(config.description_modules) ? config.description_modules : [];
  let submitInProgress = false;

  function initDescriptionModule() {
    if (!window.OWDescriptionModules) return;
    descriptionModules.forEach(function (module) {
      if (!module || !module.module_key) return;
      window.OWDescriptionModules.init({
        moduleKey: module.module_key,
        limit: module.limit,
      });
    });
  }

  initDescriptionModule();

  function showUploadProgress() {
    if (!uploadProgress) return;
    uploadProgress.start();
  }

  function syncUploadProgress(message) {
    if (!uploadProgress || typeof uploadProgress.applyTransferState !== 'function') {
      return null;
    }
    return uploadProgress.applyTransferState(message);
  }

  function hideUploadProgress() {
    if (!uploadProgress) return;
    uploadProgress.complete();
  }

  function updateStage(stage) {
    if (!stage) return;
    if (uploadProgress && typeof uploadProgress.setStage === 'function') {
      uploadProgress.setStage(stage);
    }
  }

  function parseJwt(token) {
    const parts = token.split('.');
    if (parts.length < 2) return null;
    let payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padding = payload.length % 4;
    if (padding) {
      payload += '='.repeat(4 - padding);
    }
    try {
      const decoded = atob(payload);
      return JSON.parse(decoded);
    } catch (err) {
      return null;
    }
  }

  function getWebSocketUrl(baseUrl, path, token) {
    const wsBase = baseUrl.replace(/^http/, 'ws');
    const url = new URL(path, wsBase);
    url.searchParams.set('token', token);
    return url.toString();
  }

  async function startTransferViaManager(formData) {
    const managerResp = await fetch(apiBase + addModEndpoint.path, {
      method: addModEndpoint.method,
      body: formData,
      credentials: 'include',
      headers: {
        'X-Requested-With': 'XMLHttpRequest',
        Accept: 'application/json',
      },
    });

    if (managerResp.ok) {
      const payload = await managerResp.json().catch(() => ({}));
      if (payload && payload.transfer_url) {
        return payload;
      }
      throw new Error('Ответ менеджера некорректен');
    }

    if (managerResp.status === 307 || managerResp.status === 302) {
      const redirectUrl = managerResp.headers.get('Location');
      if (!redirectUrl) {
        throw new Error('Redirect URL не получен');
      }
      return { transfer_url: redirectUrl };
    }

    const text = await managerResp.text();
    throw new Error(text || `Ошибка (${managerResp.status})`);
  }

  function printError(targetText) {
    new Toast({
      title: 'Ошибка форматирования',
      text: targetText,
      theme: 'warning',
      autohide: true,
      interval: 6000,
    });
  }

  function printDanger(targetText) {
    new Toast({
      title: 'Ошибка',
      text: targetText,
      theme: 'danger',
      autohide: true,
      interval: 6000,
    });
  }

  function parseResponseMessage(text, fallback) {
    if (!text) return fallback;

    try {
      const parsed = JSON.parse(text);
      if (typeof parsed === 'string') return parsed;
      if (parsed && typeof parsed.detail === 'string') return parsed.detail;
      if (parsed && typeof parsed.message === 'string') return parsed.message;
    } catch (error) {
      return text.replace(/^"(.*)"$/, '$1');
    }

    return fallback;
  }

  function getNameValue() {
    return String(titleInput ? titleInput.value : '').trim();
  }

  function getDescriptionValue(module, useTutorialValue) {
    if (!module) return '';

    if (window.OWDescriptionModules && typeof window.OWDescriptionModules.getValue === 'function') {
      return String(window.OWDescriptionModules.getValue(module.module_key, useTutorialValue) || '');
    }

    const descRoot = document.querySelector(
      '.mod-edit__content[data-desc-module="' + module.module_key + '"] .desc-edit',
    );
    if (window.OWDescEditors) {
      return String(window.OWDescEditors.getValue(descRoot) || '');
    }
    return '';
  }

  function normalizeIdCandidate(value) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && /^\d+$/.test(value.trim())) {
      return Number(value.trim());
    }
    return null;
  }

  function extractCreatedId(payload, kind) {
    const directId = normalizeIdCandidate(payload);
    if (directId !== null) return directId;

    if (Array.isArray(payload)) {
      for (const item of payload) {
        const nestedId = extractCreatedId(item, kind);
        if (nestedId !== null) return nestedId;
      }
      return null;
    }

    if (!payload || typeof payload !== 'object') return null;

    const candidates = kind === 'game' ? ['game_id', 'id'] : ['mod_id', 'id'];
    for (const key of candidates) {
      const value = normalizeIdCandidate(payload[key]);
      if (value !== null) return value;
    }

    const nestedContainers = ['result', 'data', 'game', 'mod'];
    for (const key of nestedContainers) {
      if (payload[key] === undefined) continue;
      const nestedId = extractCreatedId(payload[key], kind);
      if (nestedId !== null) return nestedId;
    }

    return null;
  }

  function extractIdFromLocation(locationHeader) {
    if (typeof locationHeader !== 'string' || locationHeader.trim() === '') return null;
    const match = locationHeader.match(/\/(\d+)(?:\/)?$/);
    return match ? Number(match[1]) : null;
  }

  function setSubmitInProgress(nextValue) {
    submitInProgress = nextValue;
    const button = root.querySelector('.entity-add__actions > button');
    if (button) {
      button.disabled = nextValue;
    }
  }

  async function createNewGame() {
    if (!addGameEndpoint) {
      printDanger('В приложении не настроен endpoint для добавления игр');
      return;
    }

    const name = getNameValue();
    if (name.length <= 0) {
      printError('Не указали название игры!');
      return;
    }

    const shortModule = descriptionModules[0] || null;
    const shortText = getDescriptionValue(shortModule, true).trim();

    if (shortText.length <= 0) {
      printError('Краткое описание игры не указано!');
      return;
    }
    if (shortModule && shortModule.limit && shortText.length > shortModule.limit) {
      printError('Краткое описание игры слишком длинное!');
      return;
    }

    const typeSelect = config.type_select && config.type_select.id
      ? document.getElementById(config.type_select.id)
      : null;
    const gameType = typeSelect
      ? String(typeSelect.value || config.type_select.default || 'game')
      : 'game';

    const formData = new URLSearchParams();
    formData.set('game_name', name);
    formData.set('game_short_desc', shortText);
    formData.set('game_desc', shortText);
    formData.set('game_type', gameType);

    setSubmitInProgress(true);

    try {
      const response = await fetch(apiBase + addGameEndpoint.path, {
        method: addGameEndpoint.method,
        body: formData.toString(),
        credentials: 'include',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          Accept: 'application/json, text/plain, */*',
        },
      });

      if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new Error(parseResponseMessage(text, `Ошибка (${response.status})`));
      }

      const payload = await response.json().catch(() => null);
      const gameId =
        extractCreatedId(payload, 'game') ||
        extractIdFromLocation(response.headers.get('Location') || response.headers.get('location'));

      if (gameId !== null) {
        window.location.href = `/game/${gameId}/edit`;
        return;
      }

      new Toast({
        title: 'Готово',
        text: 'Игра создана',
        theme: 'success',
        autohide: true,
        interval: 5000,
      });
      window.location.href = '/?sgame=yes&trigger=edit';
    } catch (error) {
      printDanger(error && error.message ? error.message : 'Не удалось добавить игру');
      setSubmitInProgress(false);
    }
  }

  async function uploadNewMod() {
    if (!addModEndpoint) {
      printDanger('В приложении не настроен endpoint для загрузки модов');
      return;
    }

    if (getNameValue().length <= 0) {
      printError('Не указали название мода!');
      return;
    }

    const textDesc = getDescriptionValue(descriptionModules[0], true).trim();
    if (textDesc.length <= 0) {
      printError('Описание мода не указано!');
      return;
    } else if (textDesc.length > 256) {
      printError('Описание мода слииишком длинное!');
      return;
    }

    const selectedGameId = gameSelector ? gameSelector.getAttribute('gameid') : '';
    if (!selectedGameId) {
      printError('Игра-владелец не выбрана!');
      return;
    }

    if (!fileInput || !fileInput.files || fileInput.files.length <= 0) {
      printError('Нужно выбрать файл первой версии!');
      return;
    }

    setSubmitInProgress(true);
    showUploadProgress();

    const formData = new FormData();
    formData.append('mod_source', 'local');
    formData.append('mod_game', selectedGameId);
    formData.append('mod_name', getNameValue());
    formData.append('mod_short_description', textDesc);
    formData.append('mod_description', textDesc);
    formData.append('mod_public', '2');
    formData.append('pack_format', 'zip');
    formData.append('pack_level', '3');

    try {
      const transfer = await startTransferViaManager(formData);

      const uploadUrl = transfer.transfer_url;
      if (!uploadUrl) {
        throw new Error('Не удалось получить ссылку загрузки');
      }

      const parsedUpload = new URL(uploadUrl);
      const fileToUpload = fileInput.files[0];
      const token = parsedUpload.searchParams.get('token');
      const tokenPayload = token ? parseJwt(token) : null;
      const modId = transfer.mod_id || (tokenPayload ? tokenPayload.mod_id : null);
      const jobId = tokenPayload ? tokenPayload.job_id : null;
      const wsUrl =
        transfer.ws_url ||
        (jobId && token ? getWebSocketUrl(parsedUpload.origin, `/transfer/ws/${jobId}`, token) : null);
      if (fileToUpload && fileToUpload.name) {
        parsedUpload.searchParams.set('filename', fileToUpload.name);
      }
      if (fileToUpload && Number.isFinite(fileToUpload.size) && fileToUpload.size >= 0) {
        parsedUpload.searchParams.set('size', String(fileToUpload.size));
      }
      const finalUploadUrl = parsedUpload.toString();

      syncUploadProgress({
        event: 'progress',
        stage: 'uploading',
        bytes: 0,
        total: fileToUpload && Number.isFinite(fileToUpload.size) ? fileToUpload.size : null,
      });

      let finalizeStarted = false;
      const finalizeStart = Date.now();
      const maxFinalizeMs = 20 * 60 * 1000;

      function startFinalizePoll() {
        if (finalizeStarted) return;
        finalizeStarted = true;
        updateStage('packed');

        if (!modId) {
          hideUploadProgress();
          return;
        }

        const poll = async () => {
          if (Date.now() - finalizeStart > maxFinalizeMs) {
            hideUploadProgress();
            new Toast({
              title: 'Обработка занимает слишком долго',
              text: 'Попробуйте обновить страницу через несколько минут.',
              theme: 'warning',
              autohide: true,
              interval: 6000,
            });
            return;
          }
          const url = window.OWCore.apiUrl(
            window.OWCore.formatPath(apiPaths.mod.info.path, { mod_id: modId }),
          );
          const resp = await fetch(url, { credentials: 'include' }).catch(() => null);
          if (resp && resp.ok) {
            const data = await resp.json().catch(() => null);
            const condition = data && data.result ? data.result.condition : null;
            if (condition === 0) {
              hideUploadProgress();
              window.location.href = `/mod/${modId}/edit`;
              return;
            }
          }
          setTimeout(poll, 3000);
        };

        poll();
      }

      fetch(finalUploadUrl, {
        method: 'POST',
        body: fileToUpload,
        headers: {
          'Content-Type': 'application/octet-stream',
        },
        credentials: 'omit',
      })
        .then(async (resp) => {
          if (!resp.ok) {
            const text = await resp.text();
            new Toast({
              title: 'Ошибка загрузки',
              text: text || `Ошибка (${resp.status})`,
              theme: 'warning',
              autohide: true,
              interval: 6000,
            });
            hideUploadProgress();
            setSubmitInProgress(false);
            return;
          }
          startFinalizePoll();
        })
        .catch(() => {
          new Toast({
            title: 'Сетевая ошибка',
            text: 'Не удалось отправить файл',
            theme: 'danger',
            autohide: true,
            interval: 6000,
          });
          hideUploadProgress();
          setSubmitInProgress(false);
        });

      if (wsUrl) {
        const ws = new WebSocket(wsUrl);
        ws.onmessage = function (event) {
          try {
            const msg = JSON.parse(event.data);
            if (msg.event === 'stage' || msg.event === 'progress') {
              syncUploadProgress(msg);
              return;
            } else if (msg.event === 'complete') {
              startFinalizePoll();
              ws.close();
            } else if (msg.event === 'error') {
              hideUploadProgress();
              new Toast({
                title: 'Ошибка загрузки',
                text: msg.message || 'Не удалось загрузить файл',
                theme: 'warning',
                autohide: true,
                interval: 6000,
              });
              setSubmitInProgress(false);
              ws.close();
            }
          } catch (err) {
            // ignore parse errors
          }
        };
        ws.onerror = function () {
          // WS не обязателен — продолжаем без него
        };
      }
    } catch (error) {
      hideUploadProgress();
      new Toast({
        title: 'Ошибка загрузки',
        text: error && error.message ? error.message : 'Не удалось загрузить мод',
        theme: 'warning',
        autohide: true,
        interval: 6000,
      });
      setSubmitInProgress(false);
    }
  }

  async function submitAddEntity() {
    if (submitInProgress) return;

    if (addKind === 'game') {
      await createNewGame();
      return;
    }

    await uploadNewMod();
  }

  const submitButton = root.querySelector('[data-action="submit-add-entity"]');
  if (submitButton) {
    submitButton.addEventListener('click', function () {
      submitAddEntity();
    });
  }
})();
