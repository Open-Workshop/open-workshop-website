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

    function setStatus(text, metaText) {
      if (progress) {
        progress.setLabel(text || '');
        if (typeof progress.setMeta === 'function') {
          progress.setMeta(metaText || '');
        }
      }
      notify({ label: text || '', meta: metaText || '' });
    }

    function applyTransferState(message) {
      if (!progress || typeof progress.applyTransferState !== 'function') {
        return null;
      }

      const snapshot = progress.applyTransferState(message);
      notify({
        stage: snapshot.stage,
        label: snapshot.label,
        meta: snapshot.metaText,
        progress: snapshot.percent,
        bytes: snapshot.bytes,
        total: snapshot.total,
        speed: snapshot.speed,
      });
      return snapshot;
    }

    function setStage(stage) {
      if (!stage) return;
      const snapshot = progress && typeof progress.setStage === 'function'
        ? progress.setStage(stage)
        : null;

      if (snapshot) {
        notify({
          stage: snapshot.stage,
          label: snapshot.label,
          meta: snapshot.metaText,
          progress: snapshot.percent,
          bytes: snapshot.bytes,
          total: snapshot.total,
          speed: snapshot.speed,
        });
        return;
      }

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

      applyTransferState({
        event: 'progress',
        stage: 'uploading',
        bytes: 0,
        total: Number.isFinite(file.size) ? file.size : null,
      });

      try {
        const previousInfo = await api.fetchModInfo();
        const previousResult = previousInfo && previousInfo.result ? previousInfo.result : previousInfo;
        const previousDate = previousResult ? previousResult.file_updated_at : null;
        const uploadMode = previousResult && previousResult.condition === 'published' ? 'replace' : 'create';

        const transfer = await api.startVersionTransfer({
          kind: 'mod_archive',
          owner_type: 'mod',
          owner_id: previousResult ? previousResult.id : 0,
          mode: uploadMode,
          format: 'zip',
          compression_level: 3,
        });
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
            const nextResult = info && info.result ? info.result : info;
            const nextDate = nextResult ? nextResult.file_updated_at : null;
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

              if (data.event === 'stage' || data.event === 'progress') {
                applyTransferState(data);
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
