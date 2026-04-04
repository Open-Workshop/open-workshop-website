import PhotoSwipeLightbox from './photoswipe-lightbox.esm.js';
import PhotoSwipe from './photoswipe.esm.js';

(function () {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return;
  }

  const GALLERY_SELECTOR = '[data-photoswipe-gallery]';
  const ITEM_SELECTOR = 'a.image-link';
  const DEFAULT_WIDTH = 1600;
  const DEFAULT_HEIGHT = 900;

  let lightbox = null;

  function toPositiveInt(value) {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  }

  function getImageFromLink(link) {
    return link ? link.querySelector('img') : null;
  }

  function resolveSlideSize(link) {
    const image = getImageFromLink(link);
    let width = toPositiveInt(link.dataset.pswpWidth);
    let height = toPositiveInt(link.dataset.pswpHeight);

    if ((!width || !height) && image) {
      width = toPositiveInt(image.naturalWidth) || toPositiveInt(image.width);
      height = toPositiveInt(image.naturalHeight) || toPositiveInt(image.height);
    }

    if (!width || !height) {
      width = DEFAULT_WIDTH;
      height = DEFAULT_HEIGHT;
    }

    link.dataset.pswpWidth = String(width);
    link.dataset.pswpHeight = String(height);

    return { width, height };
  }

  function hydrateLink(link) {
    if (!(link instanceof HTMLAnchorElement)) return;

    const image = getImageFromLink(link);
    const href = link.getAttribute('href');

    if (href && !link.dataset.pswpSrc) {
      link.dataset.pswpSrc = href;
    }

    resolveSlideSize(link);

    if (image && image.alt && !link.dataset.pswpAlt) {
      link.dataset.pswpAlt = image.alt;
    }
  }

  function hydrateGallery(gallery) {
    if (!(gallery instanceof Element)) return;
    gallery.querySelectorAll(ITEM_SELECTOR).forEach(hydrateLink);
  }

  function initLightbox() {
    if (lightbox || !document.querySelector(GALLERY_SELECTOR)) return;

    lightbox = new PhotoSwipeLightbox({
      gallery: GALLERY_SELECTOR,
      children: ITEM_SELECTOR,
      pswpModule: PhotoSwipe,
      showHideAnimationType: 'zoom',
      wheelToZoom: true,
      bgOpacity: 0.92,
      paddingFn: function () {
        return { top: 24, bottom: 24, left: 24, right: 24 };
      },
    });

    lightbox.addFilter('domItemData', function (itemData, element, linkEl) {
      const link = linkEl || element;
      if (!(link instanceof HTMLAnchorElement)) {
        return itemData;
      }

      hydrateLink(link);

      const size = resolveSlideSize(link);
      const image = getImageFromLink(link);

      return {
        ...itemData,
        src: link.dataset.pswpSrc || link.getAttribute('href') || itemData.src,
        width: size.width,
        height: size.height,
        alt: link.dataset.pswpAlt || (image ? image.getAttribute('alt') || '' : ''),
      };
    });

    lightbox.init();
  }

  function bindImageLoadHydration() {
    document.addEventListener(
      'load',
      function (event) {
        const target = event.target;
        if (!(target instanceof HTMLImageElement)) return;

        const link = target.closest(ITEM_SELECTOR);
        if (link) {
          hydrateLink(link);
        }
      },
      true,
    );
  }

  function observeGalleries() {
    if (!window.MutationObserver) return;

    const observer = new MutationObserver(function (mutations) {
      mutations.forEach(function (mutation) {
        mutation.addedNodes.forEach(function (node) {
          if (!(node instanceof Element)) return;

          if (node.matches(GALLERY_SELECTOR)) {
            hydrateGallery(node);
            initLightbox();
            return;
          }

          if (node.matches && node.matches(ITEM_SELECTOR)) {
            hydrateLink(node);
            return;
          }

          if (node.querySelectorAll) {
            node.querySelectorAll(GALLERY_SELECTOR).forEach(hydrateGallery);
            node.querySelectorAll(ITEM_SELECTOR).forEach(hydrateLink);
            initLightbox();
          }
        });
      });
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  function boot() {
    document.querySelectorAll(GALLERY_SELECTOR).forEach(hydrateGallery);
    bindImageLoadHydration();
    initLightbox();
    observeGalleries();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
