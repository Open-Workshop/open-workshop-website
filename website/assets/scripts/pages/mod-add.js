(function () {
  const root = document.getElementById('main-container');
  if (!root) return;

  const ow = window.OW || {};
  const apiBase = (ow.api && ow.api.base) || document.body.getAttribute('manager-url') || '';
  const apiPaths = (ow.api && ow.api.paths) || {};
  const addModEndpoint = apiPaths.mod.add;

  const titleMod = $('input#mod-name-title');
  const descMod = $('textarea.editing');
  const fileMod = $('input#input-mod-file-upload');
  const gameOwnerMod = $('div.select-game-menu');

  window.uploadNewMod = function uploadNewMod() {
    function printError(targetText) {
      new Toast({
        title: 'Ошибка форматирования',
        text: targetText,
        theme: 'warning',
        autohide: true,
        interval: 6000,
      });
    }

    if (titleMod.val().length <= 0) {
      printError('Не указали название мода!');
      return;
    }

    const textDesc = descMod.val();
    if (textDesc.length <= 0) {
      printError('Описание мода не указано!');
      return;
    } else if (textDesc.length > 256) {
      printError('Описание мода слииишком длинное!');
      return;
    }

    if (!gameOwnerMod.attr('gameid')) {
      printError('Игра-владелец не выбрана!');
      return;
    }

    if (fileMod.get(0).files.length <= 0) {
      printError('Нужно выбрать файл первой версии!');
      return;
    }

    uploadStart();

    const formData = new FormData();
    formData.append('mod_source', 'local');
    formData.append('mod_game', gameOwnerMod.attr('gameid'));
    formData.append('mod_name', titleMod.val());
    formData.append('mod_short_description', descMod.val());
    formData.append('mod_description', descMod.val());
    formData.append('mod_public', '2');
    formData.append('mod_file', fileMod.prop('files')[0]);

    const xhr = new XMLHttpRequest();

    xhr.upload.addEventListener('progress', function (event) {
      if (event.lengthComputable) {
        progressUpdate((event.loaded / event.total) * 100);
      }
    });

    xhr.onload = function () {
      if (xhr.status < 200 || xhr.status >= 300) {
        new Toast({
          title: 'Ошибка загрузки (' + xhr.status + ')',
          text: xhr.responseText,
          theme: 'warning',
          autohide: true,
          interval: 6000,
        });
      } else {
        window.location.href = `/mod/${xhr.responseText}/edit`;
      }
      uploadComplete();
    };

    xhr.onerror = function () {
      new Toast({
        title: 'Сетевая ошибка',
        text: xhr.responseText,
        theme: 'danger',
        autohide: true,
        interval: 6000,
      });
      bar.hide();
    };

    xhr.open(addModEndpoint.method, apiBase + addModEndpoint.path, true);
    xhr.withCredentials = true;
    xhr.send(formData);
  };
})();
