/* eslint-env browser */

(function () {
  const runtime = window.OWEditRuntime;
  if (!runtime) return;

  runtime.define('mod-edit-upload-flow', function createModEditUploadFlow(options) {
    const settings = options || {};
    const api = settings.api;
    const uploadButton = runtime.resolveElement(settings.uploadButton);
    const progressRoot = runtime.resolveElement(settings.progressRoot);
    const progress = window.OWUI ? window.OWUI.createUploadProgress(progressRoot) : null;
    const subscribers = new Set();

    const stageLabels = {
      uploading: 'Загрузка файла...',
      uploaded: 'Файл загружен',
      repacking: 'Перепаковка файла...',
      packed: 'Ожидание сохранения...',
      downloading: 'Скачивание файла...',
      downloaded: 'Файл скачан',
    };

    let busy = false;

    function notify(detail) {
      const payload = {
        busy,
        ...(detail || {}),
      };

      subscribers.forEach(function (listener) {
        listener(payload);
      });
    }

    function subscribe(listener) {
      if (typeof listener !== 'function') {
        return function noop() {};
      }

      subscribers.add(listener);
      listener({ busy });
      return function unsubscribe() {
        subscribers.delete(listener);
      };
    }

    function parseJwt(token) {
      const parts = String(token || '').split('.');
      if (parts.length < 2) return null;

      let payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      const padding = payload.length % 4;
      if (padding) {
        payload += '='.repeat(4 - padding);
      }

      try {
        return JSON.parse(atob(payload));
      } catch (error) {
        return null;
      }
    }

    function getWebSocketUrl(baseUrl, path, token) {
      const wsBase = baseUrl.replace(/^http/, 'ws');
      const url = new URL(path, wsBase);
      url.searchParams.set('token', token);
      return url.toString();
    }

    function setStatus(text) {
      if (progress) {
        progress.setLabel(text || '');
      }
      notify({ label: text || '' });
    }

    function setProgressValue(percent) {
      if (progress) {
        progress.setProgress(percent);
      } else if (progressRoot) {
        const bar = progressRoot.querySelector('[data-upload-progress-bar]');
        if (bar) {
          bar.style.width = (Number.isFinite(percent) ? percent : 0) + '%';
        }
      }
      notify({ progress: Number.isFinite(percent) ? percent : 0 });
    }

    function setStage(stage) {
      if (!stage) return;
      setStatus(stageLabels[stage] || stage);
      notify({ stage });
    }

    async function start(file) {
      if (busy) return;
      if (!file) {
        runtime.showToast('Файл не выбран', 'Выберите архив мода', 'info');
        return;
      }

      busy = true;
      runtime.setButtonBusy(uploadButton, true);
      notify({ stage: 'starting' });

      if (progress) {
        progress.start('Начинаем...');
      } else if (progressRoot) {
        progressRoot.hidden = false;
        progressRoot.style.display = '';
      }

      setProgressValue(0);
      setStage('uploading');

      try {
        const previousInfo = await api.fetchModInfo();
        const previousDate = previousInfo && previousInfo.result ? previousInfo.result.date_update_file : null;

        const formData = new FormData();
        formData.append('pack_format', 'zip');
        formData.append('pack_level', '3');

        const transfer = await api.startVersionTransfer(formData);
        const uploadUrl = transfer && transfer.transfer_url;
        if (!uploadUrl) {
          throw new Error('Не удалось получить ссылку загрузки');
        }

        const parsedUpload = new URL(uploadUrl, window.location.origin);
        if (file.name) {
          parsedUpload.searchParams.set('filename', file.name);
        }

        const token = parsedUpload.searchParams.get('token');
        const tokenPayload = token ? parseJwt(token) : null;
        const jobId = transfer.job_id || (tokenPayload ? tokenPayload.job_id : null);
        const rawWsUrl = transfer.ws_url || (jobId && token
          ? getWebSocketUrl(parsedUpload.origin, `/transfer/ws/${jobId}`, token)
          : null);

        let finalizeStarted = false;
        const finalizeStart = Date.now();
        const maxFinalizeMs = 20 * 60 * 1000;

        function startFinalizePoll() {
          if (finalizeStarted) return;
          finalizeStarted = true;

          setProgressValue(100);
          setStage('packed');

          const poll = async function () {
            if (Date.now() - finalizeStart > maxFinalizeMs) {
              setStatus('Обработка занимает слишком долго');
              runtime.showToast(
                'Обработка занимает слишком долго',
                'Попробуйте обновить страницу через несколько минут.',
                'warning',
                { interval: 6000 },
              );
              busy = false;
              runtime.setButtonBusy(uploadButton, false);
              notify({ stage: 'timeout' });
              return;
            }

            const info = await api.fetchModInfo().catch(function () { return null; });
            const nextDate = info && info.result ? info.result.date_update_file : null;
            if (nextDate && nextDate !== previousDate) {
              setStatus('Новая версия сохранена');
              runtime.showToast('Готово', 'Новая версия загружена', 'success');
              notify({ stage: 'complete' });
              window.location.reload();
              return;
            }

            window.setTimeout(poll, 3000);
          };

          poll();
        }

        if (rawWsUrl) {
          try {
            const ws = new WebSocket(rawWsUrl.replace(/^http/, 'ws'));
            ws.onmessage = function (event) {
              let data = null;
              try {
                data = JSON.parse(event.data);
              } catch (error) {
                return;
              }

              if (data.event === 'stage') {
                setStage(data.stage);
              }

              if (data.event === 'progress') {
                if (data.total) {
                  const percent = Math.min(100, Math.round((data.bytes / data.total) * 100));
                  setProgressValue(percent);
                }
                if (data.stage) {
                  setStage(data.stage);
                }
              }

              if (data.event === 'complete') {
                startFinalizePoll();
              }

              if (data.event === 'error') {
                setStatus('Ошибка загрузки');
                runtime.showToast('Ошибка', data.message || 'Ошибка загрузки', 'danger');
              }
            };
          } catch (error) {
            // WebSocket is optional for progress reporting.
          }
        }

        await api.uploadBinaryToTransfer(uploadUrl, file);
        startFinalizePoll();
      } catch (error) {
        busy = false;
        runtime.setButtonBusy(uploadButton, false);
        setStatus('Ошибка загрузки');
        runtime.showError(error, { fallbackText: 'Не удалось загрузить новую версию' });
        notify({ stage: 'error', error });
      }
    }

    return {
      start,
      subscribe,
      isBusy: function () {
        return busy;
      },
    };
  });
})();
