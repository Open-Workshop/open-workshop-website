/* eslint-env browser */

(function () {
  const runtime = window.OWEditRuntime;
  if (!runtime) return;

  runtime.define('game-edit-catalog-preview', function createGameEditCatalogPreview(options) {
    const settings = options || {};
    const container = runtime.resolveElement(settings.root);
    const titleInput = runtime.resolveElement(settings.titleInput);
    const descriptionRoot = runtime.resolveElement(settings.descriptionRoot);
    const descriptionEditorRoot = runtime.resolveElement(descriptionRoot, '.desc-edit');
    const logoImage = runtime.resolveElement(settings.logoImage);
    const mediaManager = settings.mediaManager || null;
    const gameId = Number(settings.gameId || 0);
    const fallbackImage = window.OWCore.getImageFallback();

    if (!container || !window.Cards || typeof window.Cards.create !== 'function') {
      return null;
    }

    let card = null;
    let descriptionNode = null;
    let titleNode = null;
    let logoNode = null;

    function getTitle() {
      return titleInput && 'value' in titleInput ? String(titleInput.value || '') : '';
    }

    function getDescription() {
      return runtime.getEditorValue(descriptionRoot);
    }

    function getLogoUrl() {
      if (mediaManager && typeof mediaManager.getState === 'function') {
        const mediaState = mediaManager.getState();
        if (mediaState && mediaState.logoUrl) {
          return String(mediaState.logoUrl);
        }
      }

      if (logoImage instanceof HTMLImageElement && logoImage.getAttribute('src')) {
        return String(logoImage.getAttribute('src') || '');
      }
      return fallbackImage;
    }

    function ensureCard() {
      if (card) return;

      card = window.Cards.create(
        {
          id: gameId,
          name: getTitle(),
          short_description: getDescription(),
          logo: getLogoUrl(),
        },
        0,
        false,
        '',
        true,
        [],
        false,
        {
          disableGameSelectButton: true,
        },
      );

      container.replaceChildren(card);

      descriptionNode = card.querySelector('article');
      titleNode = card.querySelector('#titlename' + gameId);
      logoNode = card.querySelector('#preview-logo-card-' + gameId);
    }

    function renderTitle() {
      ensureCard();
      if (!titleNode) return;

      const nextTitle = getTitle();
      titleNode.textContent = nextTitle;
      titleNode.setAttribute('title', nextTitle);
    }

    function renderDescription() {
      ensureCard();
      if (!descriptionNode) return;
      window.Formating.renderInto(descriptionNode, getDescription());
    }

    function renderLogo() {
      ensureCard();
      if (!logoNode) return;
      logoNode.setAttribute('src', getLogoUrl());
    }

    function update(partialState) {
      ensureCard();
      const payload = partialState || {};

      if (payload.title !== false) {
        renderTitle();
      }
      if (payload.description !== false) {
        renderDescription();
      }
      if (payload.logo !== false) {
        renderLogo();
      }
    }

    function bind() {
      ensureCard();
      renderTitle();
      renderDescription();
      renderLogo();

      if (titleInput) {
        titleInput.addEventListener('input', function () {
          update({ description: false, logo: false });
        });
        titleInput.addEventListener('change', function () {
          update({ description: false, logo: false });
        });
      }

      if (descriptionEditorRoot && window.OWDescEditors) {
        const editor = window.OWDescEditors.get(descriptionEditorRoot);
        if (editor) {
          editor.onChange(function () {
            update({ title: false, logo: false });
          });
        }
      }

      if (mediaManager && typeof mediaManager.subscribe === 'function') {
        mediaManager.subscribe(function () {
          update({ title: false, description: false });
        });
      }
    }

    return {
      bind,
      update,
    };
  });
})();
