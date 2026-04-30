/* eslint-env browser */

(function () {
  const FALLBACK_ICON = '/assets/images/svg/white/link.svg';

  function normalizeHttpUrl(value) {
    const text = String(value == null ? '' : value).trim();
    if (!text) return '';

    const candidate = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(text) ? text : `https://${text}`;
    try {
      const parsed = new URL(candidate, window.location.href);
      return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.href : '';
    } catch (error) {
      return '';
    }
  }

  function getFaviconUrl(value) {
    const normalized = normalizeHttpUrl(value);
    if (!normalized) return FALLBACK_ICON;

    try {
      return new URL('/favicon.ico', normalized).href;
    } catch (error) {
      return FALLBACK_ICON;
    }
  }

  function bindBlock(block) {
    if (!(block instanceof Element)) return null;

    const icon = block.querySelector('[data-git-favicon]');
    const source = block.querySelector('[data-git-url-source]');
    if (!(icon instanceof HTMLImageElement) || !source) return null;

    const isInput = source instanceof HTMLInputElement || source instanceof HTMLTextAreaElement;

    function readValue() {
      if (isInput) return source.value;
      if (source instanceof HTMLAnchorElement) return source.href;
      return source.getAttribute('data-git-url') || source.textContent || '';
    }

    function apply(value) {
      const nextSrc = getFaviconUrl(value);

      icon.dataset.gitFaviconError = 'false';
      icon.onerror = function () {
        if (icon.dataset.gitFaviconError === 'true') return;
        icon.dataset.gitFaviconError = 'true';
        icon.src = FALLBACK_ICON;
      };

      icon.src = nextSrc;
    }

    function sync() {
      apply(readValue());
    }

    sync();

    if (isInput) {
      source.addEventListener('input', sync);
      source.addEventListener('change', sync);
    }

    return { sync };
  }

  function init(root) {
    const scope = root instanceof Element || root instanceof Document ? root : document;
    scope.querySelectorAll('[data-git-url-block]').forEach(bindBlock);
  }

  window.OWModGitLink = {
    FALLBACK_ICON,
    bindBlock,
    getFaviconUrl,
    init,
    normalizeHttpUrl,
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      init(document);
    });
  } else {
    init(document);
  }
})();
