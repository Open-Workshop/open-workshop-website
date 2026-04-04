(function () {
  const modules = new Map();

  const defaultHelpText = [
    '[h1]Гайд По Форматированию[/h1]',
    '',
    'Выделите текст, чтобы открыть bubble-панель форматирования.',
    '',
    '[b]Поддерживаются:[/b] заголовки, жирный, курсив, подчёркивание, зачёркивание, цитаты, ссылки, картинки и списки.',
    '',
    'Пример ссылки: [url=https://openworkshop.miskler.ru]Open Workshop[/url]',
    'Пример картинки: [img]https://cdn.akamai.steamstatic.com/steam/apps/294100/header.jpg[/img]',
    '',
    '[list]',
    '[*] Первый пункт',
    '[*] Второй пункт',
    '[/list]',
  ].join('\n');
  const defaultWarningText = 'Вы редактируете текст гайда. Эти правки не сохранятся в описание.';

  function showGuideWarning(module) {
    if (!module || module.helpValue === null || module.guideEditWarned) return;
    module.guideEditWarned = true;

    new Toast({
      title: 'Редактирование гайда',
      text: module.warningText,
      theme: 'warning',
      autohide: true,
      interval: 4500,
    });
  }

  function getModule(moduleKey) {
    return modules.get(moduleKey) || null;
  }

  function init(options) {
    const moduleKey = options && options.moduleKey;
    if (!moduleKey) return null;

    const root = document.querySelector(`.mod-edit__content[data-desc-module="${moduleKey}"]`);
    if (!root) return null;

    const descRoot = root.querySelector('.desc-edit');
    const helpButton = root.querySelector('[data-desc-help-toggle]');
    const editor = window.OWDescEditors ? window.OWDescEditors.init(descRoot) : null;
    if (!descRoot || !editor) return null;

    const module = {
      moduleKey,
      root,
      descRoot,
      editor,
      helpButton,
      helpText: options.helpText || defaultHelpText,
      warningText: options.warningText || defaultWarningText,
      helpValue: null,
      guideEditWarned: false,
      removeEditorListener: null,
    };

    if (module.removeEditorListener) {
      module.removeEditorListener();
    }

    module.removeEditorListener = editor.onChange(function () {
      showGuideWarning(module);
    });

    if (helpButton && !helpButton.dataset.descHelpBound) {
      helpButton.dataset.descHelpBound = '1';
      helpButton.addEventListener('click', function () {
        toggleHelp(moduleKey);
      });
    }

    modules.set(moduleKey, module);
    return module;
  }

  function getValue(moduleKey, useHelpFallback) {
    const module = getModule(moduleKey);
    if (!module) return '';
    if (useHelpFallback && module.helpValue !== null) {
      return module.helpValue;
    }
    return module.editor.getValue();
  }

  function toggleHelp(moduleKey) {
    const module = getModule(moduleKey);
    if (!module) return;

    module.guideEditWarned = false;

    if (module.helpValue !== null) {
      module.editor.setValue(module.helpValue, { silent: true });
      module.helpValue = null;
      if (module.helpButton) {
        module.helpButton.classList.remove('toggled');
      }
      return;
    }

    module.helpValue = module.editor.getValue();
    module.editor.setValue(module.helpText, { silent: true });
    if (module.helpButton) {
      module.helpButton.classList.add('toggled');
    }
  }

  window.OWDescriptionModules = {
    init,
    get: getModule,
    getValue,
    toggleHelp,
  };

  window.toggleHelpMode = function toggleHelpMode(button) {
    const root = button instanceof Element
      ? button.closest('.mod-edit__content')
      : (button && button.jquery ? button.closest('.mod-edit__content').get(0) : null);
    const moduleKey = root ? root.getAttribute('data-desc-module') : null;
    if (!moduleKey) return;
    toggleHelp(moduleKey);
  };
})();
