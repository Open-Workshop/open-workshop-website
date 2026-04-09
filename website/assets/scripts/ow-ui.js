/* eslint-env browser */

(function () {
  if (window.OWUI) return;

  const uploadRegistry = new WeakMap();
  const relativeRegistry = new WeakMap();

  const SECOND_MS = 1000;
  const MINUTE_MS = 60 * SECOND_MS;
  const HOUR_MS = 60 * MINUTE_MS;
  const DAY_MS = 24 * HOUR_MS;
  const MONTH_MS = 30 * DAY_MS;
  const YEAR_MS = 365 * DAY_MS;
  const UPLOAD_STAGE_LABELS = Object.freeze({
    starting: 'Начинаем...',
    uploading: 'Загрузка файла...',
    uploaded: 'Файл загружен',
    repacking: 'Перепаковка файла...',
    packed: 'Ожидание сохранения...',
    downloading: 'Скачивание файла...',
    downloaded: 'Файл скачан',
    processing: 'Обработка файла...',
  });
  const BYTE_UNITS = ['Б', 'КБ', 'МБ', 'ГБ', 'ТБ'];

  function resolveElement(target, selector) {
    if (!target) return selector ? document.querySelector(selector) : null;
    if (target instanceof Element) {
      if (!selector || target.matches(selector)) return target;
      return target.querySelector(selector);
    }
    if (target instanceof Document) {
      return selector ? target.querySelector(selector) : target.documentElement;
    }
    if (typeof target === 'string') {
      return document.querySelector(target);
    }
    return null;
  }

  function createElement(tagName, classNames) {
    const node = document.createElement(tagName);
    String(classNames || '')
      .split(/\s+/)
      .filter(Boolean)
      .forEach(function (className) {
        node.classList.add(className);
      });
    return node;
  }

  function parseDate(value) {
    const date = new Date(String(value || ''));
    return Number.isFinite(date.getTime()) ? date : null;
  }

  function toFiniteNumber(value) {
    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? numericValue : null;
  }

  function clampNumber(value, minValue, maxValue) {
    return Math.min(maxValue, Math.max(minValue, value));
  }

  function formatNumber(value, maximumFractionDigits) {
    return new Intl.NumberFormat('ru-RU', {
      maximumFractionDigits,
    }).format(value);
  }

  function formatBytes(value) {
    const numericValue = toFiniteNumber(value);
    if (numericValue === null) return '';

    let scaledValue = Math.max(0, numericValue);
    let unitIndex = 0;
    while (scaledValue >= 1024 && unitIndex < BYTE_UNITS.length - 1) {
      scaledValue /= 1024;
      unitIndex += 1;
    }

    let digits = 0;
    if (unitIndex > 0 && scaledValue < 100) {
      digits = scaledValue >= 10 ? 1 : 2;
    }

    return `${formatNumber(scaledValue, digits)} ${BYTE_UNITS[unitIndex]}`;
  }

  function formatSpeed(value) {
    const numericValue = toFiniteNumber(value);
    if (numericValue === null || numericValue <= 0) return '';
    return `${formatBytes(numericValue)}/с`;
  }

  function formatTransferSize(bytes, total) {
    const currentSize = formatBytes(bytes);
    const totalSize = formatBytes(total);
    if (currentSize && totalSize) {
      return `${currentSize} / ${totalSize}`;
    }
    return currentSize || totalSize || '';
  }

  function getUploadStageLabel(stage) {
    const normalizedStage = String(stage || '').trim().toLowerCase();
    return UPLOAD_STAGE_LABELS[normalizedStage] || String(stage || '').trim();
  }

  function resolveTransferPercent(message, previousState) {
    const currentState = message && typeof message === 'object' ? message : {};
    const previous = previousState && typeof previousState === 'object' ? previousState : {};
    const stage = String(currentState.stage || previous.stage || '').trim().toLowerCase();
    const explicitPercent = toFiniteNumber(currentState.percent);
    const bytes = toFiniteNumber(currentState.bytes);
    const total = toFiniteNumber(currentState.total);

    if (stage === 'repacking') {
      if (explicitPercent !== null) {
        return clampNumber(Math.round(explicitPercent), 0, 100);
      }
      if (String(previous.stage || '').trim().toLowerCase() === 'repacking') {
        return clampNumber(Math.round(toFiniteNumber(previous.percent) || 0), 0, 100);
      }
      return 0;
    }

    if (bytes !== null && total !== null && total > 0) {
      return clampNumber(Math.round((bytes / total) * 100), 0, 100);
    }

    if (stage === 'uploaded' || stage === 'packed' || stage === 'downloaded') {
      return 100;
    }

    if (toFiniteNumber(previous.percent) !== null) {
      return clampNumber(Math.round(previous.percent), 0, 100);
    }

    return 0;
  }

  function getRussianPlural(value, oneWord, twoWord, fiveWord) {
    const absValue = Math.abs(Number(value) || 0);
    const mod100 = absValue % 100;
    const mod10 = absValue % 10;

    if (mod100 >= 11 && mod100 <= 14) {
      return fiveWord;
    }
    if (mod10 === 1) {
      return oneWord;
    }
    if (mod10 >= 2 && mod10 <= 4) {
      return twoWord;
    }
    return fiveWord;
  }

  function formatDuration(ms) {
    const seconds = Math.floor(ms / SECOND_MS);
    if (seconds <= 0) return null;

    if (seconds < 60) {
      return `${seconds} ${getRussianPlural(seconds, 'секунду', 'секунды', 'секунд')}`;
    }

    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) {
      return `${minutes} ${getRussianPlural(minutes, 'минуту', 'минуты', 'минут')}`;
    }

    const hours = Math.floor(minutes / 60);
    if (hours < 24) {
      return `${hours} ${getRussianPlural(hours, 'час', 'часа', 'часов')}`;
    }

    const days = Math.floor(hours / 24);
    if (days < 30) {
      return `${days} ${getRussianPlural(days, 'день', 'дня', 'дней')}`;
    }

    const months = Math.floor(days / 30);
    if (months < 12) {
      return `${months} ${getRussianPlural(months, 'месяц', 'месяца', 'месяцев')}`;
    }

    const years = Math.floor(days / 365);
    return `${years} ${getRussianPlural(years, 'год', 'года', 'лет')}`;
  }

  function ensureRelativeOutput(element) {
    let controller = relativeRegistry.get(element);
    if (controller && controller.output && controller.wrapper) {
      return controller;
    }

    const wrapper = createElement('span', 'ow-relative-time-wrapper');
    wrapper.dataset.relativeWrapper = 'true';

    if (element.dataset.relativeBreak === 'true') {
      wrapper.appendChild(document.createElement('br'));
    }

    const output = createElement('i', element.dataset.relativeClass || '');
    output.dataset.relativeOutput = 'true';
    wrapper.appendChild(output);
    element.appendChild(wrapper);

    controller = {
      element,
      wrapper,
      output,
      timerId: 0,
    };
    relativeRegistry.set(element, controller);
    return controller;
  }

  function stopRelativeTimer(controller) {
    if (!controller || !controller.timerId) return;
    window.clearInterval(controller.timerId);
    controller.timerId = 0;
  }

  function renderRelativeElement(element) {
    if (!(element instanceof Element)) return;

    const targetDate = parseDate(element.getAttribute('datejs'));
    if (!targetDate) return;

    const mode = String(element.dataset.relativeTime || 'ago').toLowerCase();
    const now = Date.now();
    const delta = mode === 'countdown'
      ? targetDate.getTime() - now
      : now - targetDate.getTime();
    const text = formatDuration(delta);
    const controller = ensureRelativeOutput(element);

    if (!text) {
      stopRelativeTimer(controller);
      if (element.dataset.relativeHideOnExpire === 'true' && mode === 'countdown') {
        element.hidden = true;
      } else {
        controller.wrapper.hidden = true;
      }
      return;
    }

    controller.wrapper.hidden = false;
    controller.output.textContent =
      String(element.dataset.relativePrefix || '') +
      text +
      String(element.dataset.relativeSuffix || '');
  }

  function bindRelativeElement(element) {
    if (!(element instanceof Element)) return;

    const existing = relativeRegistry.get(element);
    if (existing) {
      renderRelativeElement(element);
      return;
    }

    const mode = String(element.dataset.relativeTime || 'ago').toLowerCase();
    const controller = ensureRelativeOutput(element);

    renderRelativeElement(element);

    if (mode === 'countdown') {
      controller.timerId = window.setInterval(function () {
        renderRelativeElement(element);
      }, SECOND_MS);
    } else if (element.dataset.relativeLive === 'true') {
      controller.timerId = window.setInterval(function () {
        renderRelativeElement(element);
      }, MINUTE_MS);
    }
  }

  function collectRelativeElements(rootOrDocument) {
    const scope = rootOrDocument instanceof Element || rootOrDocument instanceof Document
      ? rootOrDocument
      : document;
    const items = [];

    if (scope instanceof Element && scope.matches('[data-relative-time][datejs]')) {
      items.push(scope);
    }

    if (scope.querySelectorAll) {
      scope.querySelectorAll('[data-relative-time][datejs]').forEach(function (element) {
        items.push(element);
      });
    }

    return items;
  }

  function initRelativeTime(rootOrDocument) {
    collectRelativeElements(rootOrDocument).forEach(bindRelativeElement);
  }

  function resolveUploadRoot(target) {
    const root = resolveElement(target, '[data-upload-progress-root]');
    if (root && root.matches('[data-upload-progress-root]')) return root;
    return target instanceof Element && target.matches('[data-upload-progress-root]') ? target : root;
  }

  function createUploadProgress(target) {
    const root = resolveUploadRoot(target);
    if (!root) return null;

    if (uploadRegistry.has(root)) {
      return uploadRegistry.get(root);
    }

    const bar = root.querySelector('[data-upload-progress-bar]');
    const text = root.querySelector('[data-upload-progress-text]');
    if (!bar || !text) return null;

    let meta = root.querySelector('[data-upload-progress-meta]');
    if (!meta) {
      meta = createElement('div', 'ow-upload-progress__meta');
      meta.dataset.uploadProgressMeta = 'true';
      const metaParent = text.parentNode || root;
      metaParent.appendChild(meta);
    }
    const metaSize = meta.querySelector('[data-upload-progress-meta-size]') || createElement('span', 'ow-upload-progress__meta-item');
    const metaSpeed = meta.querySelector('[data-upload-progress-meta-speed]') || createElement('span', 'ow-upload-progress__meta-item');

    if (!metaSize.parentNode) {
      metaSize.dataset.uploadProgressMetaSize = 'true';
      meta.appendChild(metaSize);
    }
    if (!metaSpeed.parentNode) {
      metaSpeed.dataset.uploadProgressMetaSpeed = 'true';
      meta.appendChild(metaSpeed);
    }

    const transferState = {
      stage: '',
      bytes: null,
      total: null,
      percent: 0,
      speed: null,
      lastProgressBytes: null,
      lastProgressAt: 0,
    };

    function resetTransferState() {
      transferState.stage = '';
      transferState.bytes = null;
      transferState.total = null;
      transferState.percent = 0;
      transferState.speed = null;
      transferState.lastProgressBytes = null;
      transferState.lastProgressAt = 0;
    }

    function setMetaText(value) {
      if (value && typeof value === 'object') {
        const sizeText = String(value.size || '');
        const speedText = String(value.speed || '');

        metaSize.textContent = sizeText;
        metaSpeed.textContent = speedText;

        metaSize.hidden = sizeText === '';
        metaSpeed.hidden = speedText === '';
        meta.hidden = sizeText === '' && speedText === '';
        return;
      }

      const nextValue = String(value || '');
      metaSize.textContent = '';
      metaSpeed.textContent = '';
      metaSize.hidden = true;
      metaSpeed.hidden = true;
      meta.hidden = nextValue === '';
    }

    function buildTransferSnapshot(message) {
      const nextState = message && typeof message === 'object' ? message : {};
      const previousStage = transferState.stage;
      const stage = String(nextState.stage || previousStage || '').trim().toLowerCase();
      const bytes = toFiniteNumber(nextState.bytes);
      const total = toFiniteNumber(nextState.total);
      const stageChanged = stage !== previousStage;

      if (bytes !== null) {
        transferState.bytes = Math.max(0, bytes);
      }
      if (total !== null) {
        transferState.total = Math.max(0, total);
      }

      if (stageChanged) {
        transferState.lastProgressAt = 0;
        transferState.lastProgressBytes = transferState.bytes;
        transferState.speed = null;
      }
      transferState.stage = stage;

      if (stage === 'uploading' && nextState.event === 'progress' && transferState.bytes !== null) {
        const now = Date.now();
        if (
          transferState.lastProgressAt > 0 &&
          transferState.lastProgressBytes !== null &&
          transferState.bytes >= transferState.lastProgressBytes
        ) {
          const deltaBytes = transferState.bytes - transferState.lastProgressBytes;
          const deltaSeconds = (now - transferState.lastProgressAt) / 1000;
          if (deltaBytes > 0 && deltaSeconds > 0.05) {
            const instantSpeed = deltaBytes / deltaSeconds;
            transferState.speed = toFiniteNumber(transferState.speed) !== null
              ? (transferState.speed * 0.65) + (instantSpeed * 0.35)
              : instantSpeed;
          }
        }
        transferState.lastProgressAt = now;
        transferState.lastProgressBytes = transferState.bytes;
      }

      if (stage && stage !== 'uploading') {
        transferState.speed = null;
      }

      transferState.percent = resolveTransferPercent(
        {
          stage,
          percent: nextState.percent,
          bytes: transferState.bytes,
          total: transferState.total,
        },
        {
          stage: previousStage,
          percent: transferState.percent,
        },
      );

      const stageLabel = getUploadStageLabel(stage);
      const sizeText = formatTransferSize(transferState.bytes, transferState.total);
      const speedText = stage === 'uploading' ? formatSpeed(transferState.speed) : '';

      return {
        stage,
        label: stageLabel
          ? `${stageLabel}${stage === 'processing' ? '' : ` ${transferState.percent}%`}`.trim()
          : `${transferState.percent}%`,
        metaText: {
          size: sizeText || '',
          speed: speedText || '',
        },
        percent: transferState.percent,
        bytes: transferState.bytes,
        total: transferState.total,
        speed: transferState.speed,
      };
    }

    const controller = {
      root,
      start(label) {
        root.hidden = false;
        root.style.display = '';
        resetTransferState();
        controller.setProgress(0);
        controller.setLabel(label || 'Начинаем...');
        setMetaText('');
      },
      setLabel(label) {
        text.textContent = String(label || '');
      },
      setMeta(metaText) {
        setMetaText(metaText);
      },
      setProgress(percent) {
        const numericPercent = Number.isFinite(percent) ? Math.max(0, Math.min(100, percent)) : 0;
        bar.style.width = numericPercent + '%';
      },
      setStage(stage) {
        const snapshot = buildTransferSnapshot({ event: 'stage', stage });
        controller.setProgress(snapshot.percent);
        controller.setLabel(snapshot.label);
        setMetaText(snapshot.metaText);
        return snapshot;
      },
      applyTransferState(message) {
        const snapshot = buildTransferSnapshot(message);
        controller.setProgress(snapshot.percent);
        controller.setLabel(snapshot.label);
        setMetaText(snapshot.metaText);
        return snapshot;
      },
      complete() {
        resetTransferState();
        setMetaText('');
        root.hidden = true;
        root.style.display = 'none';
      },
    };

    uploadRegistry.set(root, controller);
    return controller;
  }

  window.OWUI = {
    initRelativeTime,
    createUploadProgress,
    getUploadStageLabel,
    resolveTransferPercent,
    formatBytes,
  };
})();
