/* eslint-env browser */

(function () {
  const runtime = window.OWEditRuntime;
  if (!runtime) return;

  runtime.define('mod-edit-catalog-preview', function createModEditCatalogPreview(options) {
    const settings = options || {};
    const container = runtime.resolveElement(settings.root);
    const titleInput = runtime.resolveElement(settings.titleInput);
    const descriptionRoot = runtime.resolveElement(settings.descriptionRoot);
    const mediaManager = settings.mediaManager || null;
    const modId = Number(settings.modId || 0);

    if (!container || !window.Cards || typeof window.Cards.create !== 'function') {
      return null;
    }

    const sizeText = String(settings.sizeText || '');
    const gameId = String(settings.gameId || '');
    const doplink = gameId ? `?sgame=no&game=${encodeURIComponent(gameId)}` : '';
    const tags = sizeText
      ? [{ text: '📦', description: 'Размер мода', value: sizeText }]
      : [];

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
      const mediaState = mediaManager && typeof mediaManager.getState === 'function'
        ? mediaManager.getState()
        : null;
      return (mediaState && mediaState.logoUrl) || '/assets/images/loading.webp';
    }

    function ensureCard() {
      if (card) return;

      card = window.Cards.create(
        {
          id: modId,
          name: getTitle(),
          short_description: getDescription(),
          logo: getLogoUrl(),
          doplink,
        },
        0,
        true,
        '',
        false,
        tags,
      );

      container.replaceChildren(card);

      descriptionNode = card.querySelector('article');
      titleNode = card.querySelector(`#titlename${modId}`);
      logoNode = card.querySelector(`#preview-logo-card-${modId}`);
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

      if (descriptionRoot && window.OWDescEditors) {
        const editor = window.OWDescEditors.get(descriptionRoot);
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
