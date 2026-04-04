/* eslint-env browser */

(function () {
  if (window.OWEditRuntime) return;

  const factories = new Map();

  function resolveElement(target, selector) {
    if (!target) {
      return selector ? document.querySelector(selector) : null;
    }

    if (target instanceof Element) {
      if (!selector || target.matches(selector)) return target;
      return target.querySelector(selector);
    }

    if (typeof target === 'string') {
      const node = document.querySelector(target);
      if (!(node instanceof Element)) return selector ? document.querySelector(selector) : null;
      if (!selector || node.matches(selector)) return node;
      return node.querySelector(selector);
    }

    return null;
  }

  function showToast(title, text, theme, options) {
    if (typeof window.Toast !== 'function') return null;

    return new Toast({
      title,
      text,
      theme,
      autohide: true,
      interval: 5000,
      ...(options || {}),
    });
  }

  function showError(error, options) {
    const settings = options || {};
    const fallbackText = settings.fallbackText || 'Произошла непредвиденная ошибка';
    const message = error instanceof Error
      ? error.message
      : String(error || fallbackText);

    return showToast(settings.title || 'Ошибка', message || fallbackText, settings.theme || 'danger', settings.toast);
  }

  function setButtonBusy(button, busy) {
    const node = resolveElement(button);
    if (!(node instanceof HTMLButtonElement || node instanceof HTMLAnchorElement)) return;

    const isBusy = Boolean(busy);
    if ('disabled' in node) {
      node.disabled = isBusy;
    }
    node.classList.toggle('disabled', isBusy);
    node.setAttribute('aria-busy', isBusy ? 'true' : 'false');
  }

  function initPage(root, options) {
    const node = resolveElement(root);
    if (!(node instanceof Element)) return;

    const settings = options || {};
    const delay = Number.isFinite(settings.fadeInDelay) ? settings.fadeInDelay : 250;
    const opacity = settings.opacity == null ? '1' : String(settings.opacity);

    window.setTimeout(function () {
      node.style.opacity = opacity;
    }, delay);
  }

  function bindPager(startButton) {
    const button = resolveElement(startButton);
    if (!(button instanceof Element) || !window.Pager) {
      return function noop() {};
    }

    const update = function () {
      window.Pager.updateSelect.call(button);
    };

    update();
    window.addEventListener('popstate', update);

    return function unbindPager() {
      window.removeEventListener('popstate', update);
    };
  }

  function getTextValue(target) {
    const node = resolveElement(target);
    return node && 'value' in node ? String(node.value || '') : '';
  }

  function getStartValue(target) {
    const node = resolveElement(target);
    return node instanceof Element ? String(node.getAttribute('startdata') || '') : '';
  }

  function getAttributeValue(target, name) {
    const node = resolveElement(target);
    return node instanceof Element ? String(node.getAttribute(name) || '') : '';
  }

  function getEditorRoot(target) {
    return resolveElement(target, '.desc-edit');
  }

  function getEditorValue(target) {
    const editorRoot = getEditorRoot(target);
    if (!editorRoot || !window.OWDescEditors) return '';
    return String(window.OWDescEditors.getValue(editorRoot) || '');
  }

  function getEditorStartValue(target) {
    const editorRoot = getEditorRoot(target);
    if (!editorRoot || !window.OWDescEditors) return '';
    return String(window.OWDescEditors.getStartValue(editorRoot) || '');
  }

  function diffValue(value, startValue) {
    const currentValue = String(value == null ? '' : value);
    const initialValue = String(startValue == null ? '' : startValue);

    return {
      value: currentValue,
      startValue: initialValue,
      changed: currentValue !== initialValue,
    };
  }

  function parseResponseMessage(text, fallback) {
    if (!text) return fallback;

    try {
      const parsed = JSON.parse(text);
      if (typeof parsed === 'string') return parsed;
      if (parsed && typeof parsed.detail === 'string') return parsed.detail;
      if (parsed && typeof parsed.message === 'string') return parsed.message;
      if (parsed && typeof parsed.error === 'string') return parsed.error;
    } catch (error) {
      return String(text).replace(/^"(.*)"$/, '$1');
    }

    return fallback;
  }

  function define(name, factory) {
    factories.set(String(name), factory);
  }

  function requireFactory(name) {
    const factory = factories.get(String(name));
    if (typeof factory !== 'function') {
      throw new Error('OWEditRuntime factory not found: ' + name);
    }
    return factory;
  }

  window.OWEditRuntime = {
    resolveElement,
    showToast,
    showError,
    setButtonBusy,
    initPage,
    bindPager,
    getTextValue,
    getStartValue,
    getAttributeValue,
    getEditorValue,
    getEditorStartValue,
    diffValue,
    parseResponseMessage,
    define,
    requireFactory,
  };
})();
