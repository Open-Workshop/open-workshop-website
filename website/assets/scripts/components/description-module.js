(function () {
  const modules = new Map();

  const defaultHelpText =
    '[h1]Гайд По Форматированию![/h1]\n\nФорматирование работает как в [b]полном[/b] описании мода, так и в [i]коротком[/i].\n\nФорматирование поддерживает заголовки от 1 до 6 (от большего к меньшему).\nФорматирование в виде добавления ссылок как вида https://openworkshop.su , так и [url=https://openworkshop.su]текста с гиперссылкой[/url]\n\nТак же можно вставлять ссылки на изображения:\n[img]https://cdn.akamai.steamstatic.com/steam/apps/105600/header.jpg?t=1666290860[/img]\n\nА ещё можно создать список:\n[list]\n[*] Первый пункт\n[*] Второй пункт\n[/list]\n\n[h5]Удачи в разработке![/h5]';
  const defaultWarningText = 'Вы редактируете текст гайда. Эти правки не сохраняются для описания мода.';

  function normalizeButton(button) {
    if (!button) return $();
    return button.jquery ? button : $(button);
  }

  function showGuideWarning(module) {
    if (module.$descEditArea.attr('tutorial') === undefined || module.guideEditWarned) return;
    module.guideEditWarned = true;
    new Toast({
      title: 'Редактирование гайда',
      text: module.warningText,
      theme: 'warning',
      autohide: true,
      interval: 4500,
    });
  }

  function renderPreview(module) {
    if (!module || !module.$descView.length || !module.$descEditArea.length) return;
    module.$descView.html(Formating.syntax2HTML(module.$descEditArea.val()));
  }

  function setView(module, mode) {
    if (!module) return;
    if (module.viewToggle) module.viewToggle.checked = !!mode;
    if (module.viewToggleWrap) module.viewToggleWrap.dataset.mode = mode ? 'preview' : 'edit';

    if (mode) {
      module.$descEdit.hide();
      module.$descView.show();
      renderPreview(module);
    } else {
      module.$descEdit.show();
      module.$descView.hide();
    }
  }

  function getModule(moduleKey) {
    return modules.get(moduleKey) || null;
  }

  function init(options) {
    const moduleKey = options && options.moduleKey;
    if (!moduleKey) return null;

    const limit = options.limit != null ? String(options.limit) : null;
    const root = document.querySelector(`.mod-edit__content[data-desc-module="${moduleKey}"]`);
    if (!root) return null;

    const $root = $(root);
    const descEditSelector = limit ? `div[limit=${limit}]#desc-edit` : 'div#desc-edit';
    const $descEdit = $root.find(descEditSelector).first();
    const $descEditArea = $descEdit.find('textarea.editing').first();
    const $descView = $root.find('.mod-edit__description-view').first();
    const viewToggle = root.querySelector('.mod-edit__view-toggle-input');
    const viewToggleWrap = root.querySelector('.mod-edit__view-toggle');

    if (!$descEdit.length || !$descEditArea.length || !$descView.length) return null;

    const module = {
      moduleKey,
      $root,
      $descEdit,
      $descEditArea,
      $descView,
      viewToggle,
      viewToggleWrap,
      helpText: options.helpText || defaultHelpText,
      warningText: options.warningText || defaultWarningText,
      guideEditWarned: false,
    };
    modules.set(moduleKey, module);

    if (module.viewToggle && !module.viewToggle.dataset.descModuleBound) {
      module.viewToggle.dataset.descModuleBound = '1';
      module.viewToggle.addEventListener('change', function () {
        setView(module, module.viewToggle.checked);
      });
    }

    if (!module.$descEditArea.data('ow-desc-bound')) {
      module.$descEditArea.data('ow-desc-bound', true);
      module.$descEditArea.on('input', function () {
        showGuideWarning(module);
        if (module.viewToggle && module.viewToggle.checked) {
          renderPreview(module);
        }
      });
    }

    setView(module, false);
    return module;
  }

  function setViewByKey(moduleKey, mode) {
    setView(getModule(moduleKey), mode);
  }

  function getValue(moduleKey, useTutorialValue) {
    const module = getModule(moduleKey);
    if (!module || !module.$descEditArea.length) return '';
    if (useTutorialValue && module.$descEditArea.attr('tutorial') !== undefined) {
      return module.$descEditArea.attr('tutorial');
    }
    return module.$descEditArea.val();
  }

  function toggleHelp(button) {
    const $button = normalizeButton(button);
    const moduleKey = $button.closest('.mod-edit__content').attr('data-desc-module');
    const module = getModule(moduleKey);
    if (!module) return;

    module.guideEditWarned = false;

    if (module.$descEditArea.attr('tutorial') !== undefined) {
      $button.removeClass('toggle toggled');
      module.$descEditArea.val(module.$descEditArea.attr('tutorial'));
      module.$descEditArea.removeAttr('tutorial');
    } else {
      $button.removeClass('toggle').addClass('toggled');
      module.$descEditArea.attr('tutorial', module.$descEditArea.val());
      module.$descEditArea.val(module.helpText);
    }

    if (typeof fullDescUpdate === 'function') {
      fullDescUpdate(module.$descEditArea);
    }
    renderPreview(module);
  }

  window.OWDescriptionModules = {
    init,
    get: getModule,
    setView: setViewByKey,
    getValue,
    toggleHelp,
  };

  // Backward-compatible inline handler used in templates.
  window.toggleHelpMode = function toggleHelpMode(button) {
    window.OWDescriptionModules.toggleHelp(button);
  };
})();
