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

    const controller = {
      root,
      start(label) {
        root.hidden = false;
        root.style.display = '';
        controller.setProgress(0);
        controller.setLabel(label || 'Начинаем...');
      },
      setLabel(label) {
        text.textContent = String(label || '');
      },
      setProgress(percent) {
        const numericPercent = Number.isFinite(percent) ? Math.max(0, Math.min(100, percent)) : 0;
        bar.style.width = numericPercent + '%';
        if (numericPercent >= 100) {
          text.textContent = 'Ещё мгновение...';
        } else {
          text.textContent = Math.round(numericPercent) + '%';
        }
      },
      complete() {
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
  };
})();
