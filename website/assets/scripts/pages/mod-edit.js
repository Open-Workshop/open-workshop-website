/* eslint-env browser */

(function () {
  const runtime = window.OWEditRuntime;
  const root = document.getElementById('main-mod-edit');
  if (!runtime || !root) return;

  const modId = Number(root.dataset.modId || 0);
  const config = window.OWCore.getConfig ? window.OWCore.getConfig() : {};
  const apiPaths = window.OWCore.getApiPaths();
  const publicIcons = (config.assets && config.assets.icons && config.assets.icons.public) || {
    0: '/assets/images/svg/white/eye.svg',
    1: '/assets/images/svg/white/link.svg',
    2: '/assets/images/svg/white/lock.svg',
  };
  const publicTitles = {
    0: 'Доступен всем',
    1: 'Доступен по ссылке',
    2: 'Доступен только владельцам',
  };

  function getDescRoot(moduleKey) {
    return root.querySelector(`.mod-edit__content[data-desc-module="${moduleKey}"] .desc-edit`);
  }

  function initDescriptionModules() {
    if (!window.OWDescriptionModules) return;

    window.OWDescriptionModules.init({
      moduleKey: 'full',
      limit: 10000,
    });
    window.OWDescriptionModules.init({
      moduleKey: 'catalog',
      limit: 256,
    });
  }

  function bindPublicToggle(button) {
    const publicButton = runtime.resolveElement(button);
    const publicIcon = publicButton ? publicButton.querySelector('img') : null;

    function sync() {
      if (!publicButton || !publicIcon) return;

      const mode = runtime.getAttributeValue(publicButton, 'public-mode') || '0';
      publicIcon.setAttribute('src', publicIcons[mode] || publicIcons[0]);
      publicButton.setAttribute('title', publicTitles[mode] || publicTitles[0]);
    }

    function toggle() {
      if (!publicButton) return;
      const currentMode = Number.parseInt(runtime.getAttributeValue(publicButton, 'public-mode') || '0', 10);
      const nextMode = Number.isFinite(currentMode) ? (currentMode + 1) % 3 : 0;
      publicButton.setAttribute('public-mode', String(nextMode));
      sync();
    }

    sync();
    return {
      sync,
      toggle,
    };
  }

  function initModEditPage() {
    runtime.initPage(root, { fadeInDelay: 500 });
    runtime.bindPager(document.getElementById('start-page-button'));
    initDescriptionModules();

    const api = runtime.requireFactory('mod-edit-api')({
      modId,
      apiPaths,
    });

    const mediaManager = runtime.requireFactory('mod-edit-media-manager')({
      root: root.querySelector('#media-manager'),
    });

    const authorsManager = runtime.requireFactory('mod-edit-authors-manager')({
      root: root.querySelector('#mod-authors-manager'),
      api,
    });

    const catalogPreview = runtime.requireFactory('mod-edit-catalog-preview')({
      root: root.querySelector('.mod-edit__catalog-cards'),
      titleInput: root.querySelector('.title-mod'),
      descriptionRoot: getDescRoot('catalog'),
      mediaManager,
      modId,
      sizeText: root.querySelector('.mod-edit__catalog-cards')?.dataset.modSize || '',
      gameId: root.querySelector('.mod-edit__catalog-cards')?.dataset.gameId || '',
    });

    if (catalogPreview) {
      catalogPreview.bind();
    }

    const uploadFlow = runtime.requireFactory('mod-edit-upload-flow')({
      api,
      uploadButton: root.querySelector('[data-action="mod-upload-version"]'),
      progressRoot: root.querySelector('[data-upload-progress-root]'),
    });

    const saveService = runtime.requireFactory('mod-edit-save-service')({
      api,
      saveButton: root.querySelector('[data-action="mod-save"]'),
      deleteButton: root.querySelector('[data-action="mod-delete"]'),
      deleteConfirmInput: root.querySelector('#delete-mod-confirm'),
      titleInput: root.querySelector('.title-mod'),
      gitUrlInput: root.querySelector('#mod-git-url'),
      publicButton: root.querySelector('[data-action="mod-toggle-public"]'),
      adultCheckbox: root.querySelector('#mod-adult'),
      fullDescriptionRoot: getDescRoot('full'),
      catalogDescriptionRoot: getDescRoot('catalog'),
      mediaManager,
      authorsManager,
      tagsEditorId: 'mod-tags-editor',
      dependenciesEditorId: 'mod-dependencies-editor',
      conflictsEditorId: 'mod-conflicts-editor',
      progressRoot: root.querySelector('[data-save-progress-root]'),
    });

    const publicController = bindPublicToggle(root.querySelector('[data-action="mod-toggle-public"]'));

    root.addEventListener('click', function (event) {
      const actionNode = event.target instanceof Element ? event.target.closest('[data-action]') : null;
      if (!actionNode) return;

      const action = actionNode.dataset.action;

      if (action === 'mod-toggle-public') {
        publicController.toggle();
        return;
      }

      if (action === 'mod-save') {
        saveService.save();
        return;
      }

      if (action === 'mod-upload-version') {
        const fileInput = document.getElementById('input-mod-file-upload');
        const file = fileInput && fileInput.files ? fileInput.files[0] : null;
        uploadFlow.start(file);
        return;
      }

      if (action === 'mod-delete') {
        saveService.deleteMod();
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initModEditPage);
  } else {
    initModEditPage();
  }
})();
