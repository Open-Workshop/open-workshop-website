(function () {
  const root = document.querySelector('main.user.settings');
  if (!root) return;

  const ow = window.OW || {};
  const apiBase = (ow.api && ow.api.base) || document.body.getAttribute('manager-url') || '';
  const apiPaths = (ow.api && ow.api.paths) || {};
  const rightsList = (ow.rights && ow.rights.list) || [];
  const userId = root.dataset.userId;

  function apiUrl(path) {
    return `${apiBase}${path}`;
  }

  function formatPath(path, params) {
    return path.replace(/\{(\w+)\}/g, (match, key) => (params[key] !== undefined ? params[key] : match));
  }

  const pageProfileButton = document.querySelector('#page-profile-button');
  if (pageProfileButton && window.Pager) {
    Pager.updateSelect.call(pageProfileButton);
    window.addEventListener('popstate', function () {
      Pager.updateSelect.call(pageProfileButton);
    });
  }

  const avatarInput = document.getElementById('file-select-avatar');
  const avatarImg = document.getElementById('user-avatar-img');
  if (avatarInput && avatarImg) {
    avatarInput.addEventListener('change', function () {
      const file = avatarInput.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = function (e) {
        const image = new Image();
        image.src = e.target.result;

        image.onload = function () {
          const height = this.height;
          const width = this.width;

          if (Math.abs(width / height - 1) > 0.05) {
            avatarInput.value = '';
            avatarImg.src = avatarImg.getAttribute('startdata');
            new Toast({
              title: 'Неправильный аватар!',
              text: 'Аватар должен быть квадратным!',
              theme: 'warning',
              autohide: true,
              interval: 6000,
            });
          } else if (width < 60 || height < 60) {
            avatarInput.value = '';
            avatarImg.src = avatarImg.getAttribute('startdata');
            new Toast({
              title: 'Неправильный аватар!',
              text: 'Слишком маленькое разрешение аватара!',
              theme: 'warning',
              autohide: true,
              interval: 6000,
            });
          } else if (file.size > 2 * 1024 * 1024) {
            avatarInput.value = '';
            avatarImg.src = avatarImg.getAttribute('startdata');
            new Toast({
              title: 'Неправильный аватар!',
              text: 'Аватар не должен быть тяжелее 2МБ!',
              theme: 'warning',
              autohide: true,
              interval: 6000,
            });
          } else {
            avatarImg.src = e.target.result;
          }
        };
      };
    });
  }

  window.activateDeleteButton = function activateDeleteButton() {
    const $checkboxConfirm = $('input#checkbox-delete-confirm');
    $('#page-delete-account > div > button').prop('disabled', !$checkboxConfirm.is(':checked'));
  };

  window.usernameDeleteEditEvent = function usernameDeleteEditEvent() {
    const usernameDeleteElement = document.getElementById('username-access-delete');
    if (!usernameDeleteElement) return;

    const myText = usernameDeleteElement.value;
    if (usernameDeleteElement.getAttribute('startdata') != myText) {
      usernameDeleteElement.classList.add('limit');
    } else {
      usernameDeleteElement.classList.remove('limit');
    }
  };

  window.commitToDelete = function commitToDelete() {
    const usernameDeleteElement = document.getElementById('username-access-delete');
    if (!usernameDeleteElement) return;

    const myText = usernameDeleteElement.value;
    if (usernameDeleteElement.getAttribute('startdata') != myText) {
      new Toast({
        title: 'Ошибка',
        text: 'Ради безопасности введите свой никнейм в поле!',
        theme: 'warning',
        autohide: true,
        interval: 6000,
      });
      return;
    }

    const endpoint = apiPaths.profile.delete;
    const url = apiUrl(formatPath(endpoint.path, { user_id: userId }));
    fetch(url, { method: endpoint.method, credentials: 'include' }).then(function () {
      location.reload();
    });
  };

  if (document.getElementById('username-access-delete')) {
    window.usernameDeleteEditEvent();
  }

  window.saveProfile = async function saveProfile() {
    let tofetch = false;
    const editEndpoint = apiPaths.profile.edit;
    let url = apiUrl(formatPath(editEndpoint.path, { user_id: userId })) + '?';
    let formData = new FormData();

    const $username = $('#username');
    if ($username.val() != $username.attr('startdata')) {
      formData.append('username', $username.val());
      tofetch = true;
    }
    const $grade = $('#grade');
    if ($grade.val() != $grade.attr('startdata')) {
      formData.append('grade', $grade.val());
      tofetch = true;
    }
    const $about = $('#page-profile').find('textarea.editing');
    if ($about.val() != $about.attr('startdata')) {
      formData.append('about', $about.val());
      tofetch = true;
    }
    const $input = $('#file-select-avatar');
    if ($input.get(0) && $input.get(0).files.length > 0) {
      formData.append('avatar', $input.get(0).files[0]);
      tofetch = true;
    } else {
      formData.append('avatar', '');
    }

    const $emptyAvatar = $('#reset-avatar');
    if ($emptyAvatar.hasClass('toggled')) {
      formData.append('empty_avatar', true);
      tofetch = true;
    }
    const $mute = $('#mute-delta');
    if ($mute.length && $mute.val() > 0) {
      const $unitSize = $('#mute-delta-unit');
      const dateResult = new Date(Date.now() + $mute.val() * $unitSize.val() * 1000);
      dateResult.setHours(dateResult.getHours() + 3);
      formData.append('mute', dateResult.toISOString().slice(0, 19));
      tofetch = true;
    }

    if (tofetch) {
      try {
        const response = await fetch(url, {
          method: editEndpoint.method,
          body: formData,
          credentials: 'include',
        });
        if (!response.ok) {
          const text = await response.text();
          new Toast({
            title: 'Профиль',
            text: text.substring(1, text.length - 1),
            theme: 'warning',
            autohide: true,
            interval: 6000,
          });
        }
      } catch (error) {
        new Toast({
          title: 'Профиль',
          text: 'При запросе на сервер произошла непредвиденная ошибка...',
          theme: 'danger',
          autohide: true,
          interval: 6000,
        });
      }
    }

    let tofetchTWO = false;
    formData = new FormData();

    const editRightsEndpoint = apiPaths.profile.edit_rights;
    url = apiUrl(formatPath(editRightsEndpoint.path, { user_id: userId }));

    function addRight(nameCheckbox) {
      const checkbox = document.getElementById('checkbox-rights-edit-' + nameCheckbox);
      if (checkbox && checkbox.hasAttribute('startdata') != checkbox.checked) {
        tofetchTWO = true;
        formData.append(nameCheckbox, checkbox.checked);
      }
    }

    for (let i = 0; i < rightsList.length; i += 1) {
      addRight(rightsList[i]);
    }

    if (tofetchTWO) {
      try {
        const response = await fetch(url, {
          method: editRightsEndpoint.method,
          body: formData,
          credentials: 'include',
        });
        if (!response.ok) {
          const text = await response.text();
          new Toast({
            title: 'Права',
            text: text.substring(1, text.length - 1),
            theme: 'warning',
            autohide: true,
            interval: 6000,
          });
        }
      } catch (error) {
        new Toast({
          title: 'Права',
          text: 'При запросе на сервер произошла непредвиденная ошибка...',
          theme: 'danger',
          autohide: true,
          interval: 6000,
        });
      }
    }

    if (tofetch || tofetchTWO) {
      // saved
    } else {
      new Toast({
        title: 'Сохранение',
        text: 'Вы не внесли изменений которые можно сохранить',
        theme: 'warning',
        autohide: true,
        interval: 6000,
      });
    }
  };
})();
