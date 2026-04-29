/* eslint-env browser */

(function () {
  if (window.OWUI) return;

  const uploadRegistry = new WeakMap();
  const saveRegistry = new WeakMap();
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

  const SAVE_STEP_STATUS = Object.freeze({
    pending: 'pending',
    active: 'active',
    complete: 'complete',
    error: 'error',
  });

  function resolveSaveProgressRoot(target) {
    const root = resolveElement(target, '[data-save-progress-root]');
    if (root && root.matches('[data-save-progress-root]')) return root;
    return target instanceof Element && target.matches('[data-save-progress-root]') ? target : root;
  }

  function normalizeSaveStepStatus(status) {
    const normalized = String(status || SAVE_STEP_STATUS.pending).trim().toLowerCase();
    if (
      normalized === SAVE_STEP_STATUS.active ||
      normalized === SAVE_STEP_STATUS.complete ||
      normalized === SAVE_STEP_STATUS.error
    ) {
      return normalized;
    }
    return SAVE_STEP_STATUS.pending;
  }

  function createSaveProgress(target) {
    const root = resolveSaveProgressRoot(target);
    if (!root) return null;

    if (saveRegistry.has(root)) {
      return saveRegistry.get(root);
    }

    const dialog = root.querySelector('[data-save-progress-dialog]') || root;
    const titleNode = root.querySelector('[data-save-progress-title]');
    const messageNode = root.querySelector('[data-save-progress-message]');
    const stepsRoot = root.querySelector('[data-save-progress-steps]');
    const transferRoot = root.querySelector('[data-upload-progress-root]');
    const transferProgress = transferRoot ? createUploadProgress(transferRoot) : null;
    const stepNodes = new Map();

    const steps = [];
    let activeStepKey = '';
    let transferActive = false;

    function updateBodyLock(locked) {
      document.documentElement.classList.toggle('ow-save-progress-open', locked);
      if (document.body) {
        document.body.classList.toggle('ow-save-progress-open', locked);
      }
    }

    function setMessage(text) {
      if (!messageNode) return;
      const nextText = String(text || '').trim();
      messageNode.textContent = nextText;
      messageNode.hidden = nextText === '';
    }

    function setTitle(text) {
      if (!titleNode) return;
      titleNode.textContent = String(text || '');
    }

    function setTransferLabel(text) {
      if (!transferProgress || typeof transferProgress.setLabel !== 'function') return;
      transferProgress.setLabel(text || '');
    }

    function setTransferMeta(metaText) {
      if (!transferProgress || typeof transferProgress.setMeta !== 'function') return;
      transferProgress.setMeta(metaText || '');
    }

    function setTransferProgress(percent) {
      if (!transferProgress || typeof transferProgress.setProgress !== 'function') return;
      transferProgress.setProgress(percent);
    }

    function setTransferStage(stage) {
      transferActive = true;
      if (!transferProgress || typeof transferProgress.setStage !== 'function') return null;
      return transferProgress.setStage(stage);
    }

    function applyTransferState(message) {
      transferActive = true;
      if (!transferProgress || typeof transferProgress.applyTransferState !== 'function') {
        return null;
      }
      return transferProgress.applyTransferState(message);
    }

    function clearTransferState() {
      transferActive = false;
      syncProgressBar();
    }

    function syncProgressBar() {
      if (!transferProgress || typeof transferProgress.setProgress !== 'function') return;
      if (transferActive) return;

      if (steps.length === 0) {
        setTransferProgress(0);
        return;
      }

      let completedCount = 0;
      let activeIndex = -1;

      steps.forEach(function (step, index) {
        if (step.status === SAVE_STEP_STATUS.complete) {
          completedCount += 1;
        } else if (activeIndex === -1 && step.status === SAVE_STEP_STATUS.active) {
          activeIndex = index;
        }
      });

      const activeBonus = activeIndex >= 0 ? 0.35 : 0;
      const percent = completedCount >= steps.length
        ? 100
        : Math.min(
          99,
          Math.max(0, Math.round(((completedCount + activeBonus) / Math.max(steps.length, 1)) * 100)),
        );
      setTransferProgress(percent);

      const currentStep = activeIndex >= 0
        ? steps[activeIndex]
        : steps[Math.min(completedCount, steps.length - 1)] || null;
      if (currentStep) {
        setTransferLabel(currentStep.detail || currentStep.label || '');
      }
    }

    function renderStepNode(step, index) {
      let node = stepNodes.get(step.key);
      if (!node) {
        const item = createElement('li', 'ow-save-progress__step');
        item.dataset.saveProgressStep = step.key;

        const marker = createElement('span', 'ow-save-progress__step-marker');
        marker.setAttribute('aria-hidden', 'true');

        const copy = createElement('div', 'ow-save-progress__step-copy');
        const label = createElement('span', 'ow-save-progress__step-label');
        const detail = createElement('span', 'ow-save-progress__step-detail');

        copy.append(label, detail);
        item.append(marker, copy);

        node = {
          item,
          marker,
          label,
          detail,
        };
        stepNodes.set(step.key, node);
      }

      node.marker.textContent = String(index + 1);
      node.label.textContent = step.label;
      node.detail.textContent = step.detail || '';
      node.detail.hidden = String(step.detail || '').trim() === '';

      node.item.classList.toggle('is-pending', step.status === SAVE_STEP_STATUS.pending);
      node.item.classList.toggle('is-active', step.status === SAVE_STEP_STATUS.active);
      node.item.classList.toggle('is-complete', step.status === SAVE_STEP_STATUS.complete);
      node.item.classList.toggle('is-error', step.status === SAVE_STEP_STATUS.error);

      return node.item;
    }

    function renderSteps(nextSteps) {
      steps.length = 0;
      stepNodes.clear();
      if (stepsRoot) {
        stepsRoot.replaceChildren();
      }

      const normalizedSteps = Array.isArray(nextSteps)
        ? nextSteps.map(function (step) {
          return {
            key: String(step && step.key !== undefined ? step.key : '').trim(),
            label: String(step && step.label !== undefined ? step.label : '').trim(),
            detail: String(step && step.detail !== undefined ? step.detail : '').trim(),
            status: normalizeSaveStepStatus(step && step.status),
          };
        }).filter(function (step) {
          return step.key !== '' && step.label !== '';
        })
        : [];

      normalizedSteps.forEach(function (step, index) {
        steps.push(step);
        if (stepsRoot) {
          stepsRoot.appendChild(renderStepNode(step, index));
        }
      });
    }

    function setStep(stepKey, status, detail) {
      const key = String(stepKey || '').trim();
      if (key === '') return null;

      const step = steps.find(function (item) {
        return item.key === key;
      });
      if (!step) return null;

      const nextStatus = normalizeSaveStepStatus(status);
      const switchingStep = nextStatus === SAVE_STEP_STATUS.active && activeStepKey && activeStepKey !== key;
      if (nextStatus !== SAVE_STEP_STATUS.active || switchingStep) {
        transferActive = false;
      }
      if (nextStatus === SAVE_STEP_STATUS.active && activeStepKey && activeStepKey !== key) {
        const previousStep = steps.find(function (item) {
          return item.key === activeStepKey;
        });
        if (previousStep && previousStep.status === SAVE_STEP_STATUS.active) {
          previousStep.status = SAVE_STEP_STATUS.complete;
          renderStepNode(previousStep, steps.indexOf(previousStep));
        }
      }

      if (detail !== undefined) {
        step.detail = String(detail || '').trim();
      }

      step.status = nextStatus;
      activeStepKey = nextStatus === SAVE_STEP_STATUS.active ? key : (activeStepKey === key ? '' : activeStepKey);

      const index = steps.indexOf(step);
      if (index >= 0) {
        if (stepsRoot && stepNodes.has(step.key) === false) {
          stepsRoot.appendChild(renderStepNode(step, index));
        } else {
          renderStepNode(step, index);
        }
      }

      setMessage(step.detail || step.label);
      setTransferLabel(step.detail || step.label || '');
      syncProgressBar();
      return step;
    }

    function start(options) {
      const settings = options && typeof options === 'object' ? options : {};
      if (settings.title !== undefined) {
        setTitle(settings.title);
      }
      if (settings.message !== undefined) {
        setMessage(settings.message);
      }

      renderSteps(settings.steps);
      activeStepKey = '';
      transferActive = false;

      root.hidden = false;
      root.style.display = '';
      root.classList.add('is-open');
      root.setAttribute('aria-hidden', 'false');
      updateBodyLock(true);

      if (transferProgress && typeof transferProgress.start === 'function') {
        transferProgress.start(settings.transferLabel || settings.title || 'Начинаем...');
      }

      if (dialog && typeof dialog.focus === 'function') {
        window.requestAnimationFrame(function () {
          try {
            dialog.focus({ preventScroll: true });
          } catch (error) {
            dialog.focus();
          }
        });
      }

      if (steps.length > 0) {
        setStep(steps[0].key, SAVE_STEP_STATUS.active, steps[0].detail);
      } else {
        syncProgressBar();
      }

      return controller;
    }

    function close() {
      transferActive = false;
      if (transferProgress && typeof transferProgress.complete === 'function') {
        transferProgress.complete();
      }
      root.classList.remove('is-open');
      root.setAttribute('aria-hidden', 'true');
      root.hidden = true;
      root.style.display = 'none';
      updateBodyLock(false);
    }

    function complete(message) {
      if (message !== undefined) {
        setMessage(message);
      }

      steps.forEach(function (step, index) {
        step.status = SAVE_STEP_STATUS.complete;
        renderStepNode(step, index);
      });
      activeStepKey = '';
      syncProgressBar();
      close();
    }

    function fail(message) {
      if (message !== undefined) {
        setMessage(message);
      }

      if (activeStepKey) {
        const step = steps.find(function (item) {
          return item.key === activeStepKey;
        });
        if (step) {
          step.status = SAVE_STEP_STATUS.error;
          renderStepNode(step, steps.indexOf(step));
        }
      }

      transferActive = false;
      if (transferProgress && typeof transferProgress.complete === 'function') {
        transferProgress.complete();
      }
      syncProgressBar();
    }

    const controller = {
      root,
      start,
      close,
      complete,
      fail,
      setTitle,
      setMessage,
      setSteps: renderSteps,
      setStep,
      setProgress: setTransferProgress,
      setLabel: setTransferLabel,
      setMeta: setTransferMeta,
      setTransferStage,
      applyTransferState,
      clearTransferState,
    };

    saveRegistry.set(root, controller);
    return controller;
  }

  const modalRegistry = new WeakMap();
  let activeModalController = null;
  let modalOpenCount = 0;

  function updateModalLockState() {
    const locked = modalOpenCount > 0;
    document.documentElement.classList.toggle('ow-modal-open', locked);
    if (document.body) {
      document.body.classList.toggle('ow-modal-open', locked);
    }
  }

  function getModalFocusableElements(root) {
    if (!(root instanceof Element)) return [];
    return Array.from(root.querySelectorAll(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    )).filter(function (element) {
      return element instanceof HTMLElement && !element.hidden;
    });
  }

  function bindModalController(root) {
    if (!(root instanceof Element)) return null;
    if (modalRegistry.has(root)) {
      return modalRegistry.get(root);
    }

    let previousFocus = null;
    let pendingResolve = null;
    let pendingPromise = null;

    function getDefaultAction() {
      const normalizedAction = String(root.dataset.owModalDefaultAction || 'confirm').trim().toLowerCase();
      return normalizedAction === 'cancel' ? 'cancel' : 'confirm';
    }

    function getActionButton(action) {
      return root.querySelector('[data-ow-modal-action="' + action + '"]');
    }

    function focusDefaultAction() {
      const defaultAction = getDefaultAction();
      const preferredButton = getActionButton(defaultAction) || getActionButton(defaultAction === 'confirm' ? 'cancel' : 'confirm');
      const dialog = root.querySelector('[data-ow-modal-dialog]');
      const focusTarget = preferredButton || dialog || root;
      if (focusTarget && typeof focusTarget.focus === 'function') {
        focusTarget.focus({ preventScroll: true });
      }
    }

    function finish(accepted) {
      const wasOpen = root.getAttribute('aria-hidden') === 'false';
      root.classList.remove('is-open');
      root.setAttribute('aria-hidden', 'true');
      root.hidden = true;
      if (wasOpen) {
        modalOpenCount = Math.max(0, modalOpenCount - 1);
        if (activeModalController === controller) {
          activeModalController = null;
        }
        updateModalLockState();
      }

      const resolve = pendingResolve;
      const restoreFocusTarget = previousFocus;
      previousFocus = null;
      pendingResolve = null;
      pendingPromise = null;

      if (resolve) {
        resolve(Boolean(accepted));
      }

      if (restoreFocusTarget && typeof restoreFocusTarget.focus === 'function') {
        try {
          restoreFocusTarget.focus({ preventScroll: true });
        } catch (error) {
          restoreFocusTarget.focus();
        }
      }

      root.dispatchEvent(new CustomEvent(Boolean(accepted) ? 'ow:modal-confirm' : 'ow:modal-cancel', {
        bubbles: true,
        detail: { accepted: Boolean(accepted) },
      }));
    }

    function close(accepted = false) {
      if (!pendingPromise && root.hidden) {
        return Boolean(accepted);
      }
      finish(accepted);
      root.dispatchEvent(new CustomEvent('ow:modal-close', {
        bubbles: true,
        detail: { accepted: Boolean(accepted) },
      }));
      return Boolean(accepted);
    }

    function open() {
      if (pendingPromise && root.getAttribute('aria-hidden') === 'false') {
        return pendingPromise;
      }

      if (activeModalController && activeModalController !== controller) {
        activeModalController.close(false);
      }

      previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      root.hidden = false;
      root.classList.add('is-open');
      root.setAttribute('aria-hidden', 'false');
      activeModalController = controller;
      modalOpenCount += 1;
      updateModalLockState();

      pendingPromise = new Promise(function (resolve) {
        pendingResolve = resolve;
      });

      window.requestAnimationFrame(function () {
        if (pendingPromise && root.getAttribute('aria-hidden') === 'false') {
          focusDefaultAction();
        }
      });

      root.dispatchEvent(new CustomEvent('ow:modal-open', {
        bubbles: true,
      }));

      return pendingPromise;
    }

    function handleClick(event) {
      const actionNode = event.target instanceof Element ? event.target.closest('[data-ow-modal-action]') : null;
      if (actionNode && root.contains(actionNode)) {
        const action = String(actionNode.dataset.owModalAction || '').trim().toLowerCase();
        event.preventDefault();
        if (action === 'confirm') {
          close(true);
        } else {
          close(false);
        }
        return;
      }

      const backdropNode = event.target instanceof Element ? event.target.closest('[data-ow-modal-backdrop]') : null;
      if (backdropNode && root.contains(backdropNode)) {
        event.preventDefault();
        close(false);
      }
    }

    function handleKeydown(event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        close(false);
        return;
      }

      if (event.key !== 'Tab') return;

      const focusable = getModalFocusableElements(root);
      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }

      const currentIndex = focusable.indexOf(document.activeElement);
      if (currentIndex === -1) {
        event.preventDefault();
        focusDefaultAction();
        return;
      }

      if (event.shiftKey && currentIndex === 0) {
        event.preventDefault();
        focusable[focusable.length - 1].focus();
      } else if (!event.shiftKey && currentIndex === focusable.length - 1) {
        event.preventDefault();
        focusable[0].focus();
      }
    }

    const controller = {
      root,
      open,
      close,
      get isOpen() {
        return root.getAttribute('aria-hidden') === 'false';
      },
    };

    root.addEventListener('click', handleClick);
    root.addEventListener('keydown', handleKeydown);
    modalRegistry.set(root, controller);
    return controller;
  }

  function resolveModalRoot(target) {
    if (!target) return null;
    if (target instanceof Element) {
      return target.matches('[data-ow-modal]') ? target : target.closest('[data-ow-modal]');
    }
    if (target instanceof Document) {
      return target.querySelector('[data-ow-modal]');
    }
    if (typeof target === 'string') {
      return document.querySelector(target);
    }
    return resolveElement(target, '[data-ow-modal]');
  }

  function collectModalElements(rootOrDocument) {
    const scope = rootOrDocument instanceof Element || rootOrDocument instanceof Document
      ? rootOrDocument
      : document;
    const items = [];

    if (scope instanceof Element && scope.matches('[data-ow-modal]')) {
      items.push(scope);
    }

    if (scope.querySelectorAll) {
      scope.querySelectorAll('[data-ow-modal]').forEach(function (element) {
        items.push(element);
      });
    }

    return items;
  }

  function initModals(rootOrDocument) {
    collectModalElements(rootOrDocument).forEach(function (element) {
      bindModalController(element);
    });
  }

  function openModal(target) {
    const controller = bindModalController(resolveModalRoot(target));
    if (!controller) return Promise.resolve(false);
    return controller.open();
  }

  function closeModal(target) {
    const controller = bindModalController(resolveModalRoot(target));
    if (!controller) return false;
    return controller.close(false);
  }

  function confirmModal(target) {
    const controller = bindModalController(resolveModalRoot(target));
    if (!controller) return Promise.resolve(false);
    return controller.open();
  }

  window.OWUI = {
    initRelativeTime,
    initModals,
    createUploadProgress,
    createSaveProgress,
    openModal,
    closeModal,
    confirmModal,
    getUploadStageLabel,
    resolveTransferPercent,
    formatBytes,
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      initModals(document);
    });
  } else {
    initModals(document);
  }
})();
