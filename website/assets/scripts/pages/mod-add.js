(function () {
  const root = document.getElementById('main-container');
  if (!root) return;

  const apiBase = window.OWCore.getApiBase();
  const apiPaths = window.OWCore.getApiPaths();
  const addModEndpoint = apiPaths.mod.add;

  const titleMod = $('input#mod-name-title');
  const descMod = $('.mod-edit__content[data-desc-module="add"] div[limit=256] textarea.editing').first();
  const fileMod = $('input#input-mod-file-upload');
  const gameOwnerMod = $('div.select-game-menu');
  const descriptionHelpText =
    '[h1]Гайд По Форматированию![/h1]\n\nФорматирование поддерживает заголовки от 1 до 6.\nМожно использовать [b]жирный[/b], [i]курсив[/i], ссылки и изображения.\n\nПримеры:\n[url=https://openworkshop.su]Ссылка[/url]\n[img]https://cdn.akamai.steamstatic.com/steam/apps/105600/header.jpg?t=1666290860[/img]\n\n[list]\n[*] Первый пункт\n[*] Второй пункт\n[/list]';
  const guideEditWarningText = 'Вы редактируете текст гайда. Эти правки не сохраняются для описания мода.';
  const stageLabels = {
    uploading: 'Загрузка файла...',
    uploaded: 'Файл загружен',
    repacking: 'Перепаковка файла...',
    packed: 'Ожидание сохранения...',
    downloading: 'Скачивание файла...',
    downloaded: 'Файл скачан',
  };

  function initDescriptionModule() {
    if (!window.OWDescriptionModules) return;
    window.OWDescriptionModules.init({
      moduleKey: 'add',
      limit: 256,
      helpText: descriptionHelpText,
      warningText: guideEditWarningText,
    });
    window.OWDescriptionModules.setView('add', false);
  }

  initDescriptionModule();

  function updateStage(stage) {
    if (!stage) return;
    const label = stageLabels[stage] || stage;
    $('#greenBarText').text(label);
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

  window.uploadNewMod = async function uploadNewMod() {
    function printError(targetText) {
      new Toast({
        title: 'Ошибка форматирования',
        text: targetText,
        theme: 'warning',
        autohide: true,
        interval: 6000,
      });
    }

    if (titleMod.val().length <= 0) {
      printError('Не указали название мода!');
      return;
    }

    const textDesc = window.OWDescriptionModules
      ? window.OWDescriptionModules.getValue('add', true)
      : (descMod.length ? descMod.val() : '');
    if (textDesc.length <= 0) {
      printError('Описание мода не указано!');
      return;
    } else if (textDesc.length > 256) {
      printError('Описание мода слииишком длинное!');
      return;
    }

    if (!gameOwnerMod.attr('gameid')) {
      printError('Игра-владелец не выбрана!');
      return;
    }

    if (fileMod.get(0).files.length <= 0) {
      printError('Нужно выбрать файл первой версии!');
      return;
    }

    uploadStart();

    const formData = new FormData();
    formData.append('mod_source', 'local');
    formData.append('mod_game', gameOwnerMod.attr('gameid'));
    formData.append('mod_name', titleMod.val());
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
      const fileToUpload = fileMod.prop('files')[0];
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
      const finalUploadUrl = parsedUpload.toString();

      let finalizeStarted = false;
      const finalizeStart = Date.now();
      const maxFinalizeMs = 20 * 60 * 1000;

      function startFinalizePoll() {
        if (finalizeStarted) return;
        finalizeStarted = true;
        progressUpdate(100);
        $('#greenBarText').text('Обработка файла...');

        if (!modId) {
          uploadComplete();
          return;
        }

        const poll = async () => {
          if (Date.now() - finalizeStart > maxFinalizeMs) {
            uploadComplete();
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
              uploadComplete();
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
            uploadComplete();
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
          uploadComplete();
        });

      if (wsUrl) {
        const ws = new WebSocket(wsUrl);
        ws.onmessage = function (event) {
          try {
            const msg = JSON.parse(event.data);
            if (msg.stage) {
              updateStage(msg.stage);
            }
            if (msg.event === 'stage') {
              updateStage(msg.stage);
              return;
            }
            if (msg.event === 'progress') {
              if (msg.total) {
                progressUpdate((msg.bytes / msg.total) * 100);
              } else {
                progressUpdate(0);
                updateStage(msg.stage || 'uploading');
              }
            } else if (msg.event === 'complete') {
              startFinalizePoll();
              ws.close();
            } else if (msg.event === 'error') {
              uploadComplete();
              new Toast({
                title: 'Ошибка загрузки',
                text: msg.message || 'Не удалось загрузить файл',
                theme: 'warning',
                autohide: true,
                interval: 6000,
              });
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
      uploadComplete();
      new Toast({
        title: 'Ошибка загрузки',
        text: error && error.message ? error.message : 'Не удалось загрузить мод',
        theme: 'warning',
        autohide: true,
        interval: 6000,
      });
    }
  };
})();
