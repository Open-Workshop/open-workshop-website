(function () {
  const root = document.querySelector('main.user.settings');
  if (!root) return;

  const apiPaths = window.OWCore.getApiPaths();
  const ow = window.OWCore.getConfig ? window.OWCore.getConfig() : (window.OW || {});
  const rightsList = (ow.rights && ow.rights.list) || [];
  const userId = root.dataset.userId;
  const aboutView = document.querySelector('#page-profile article#mod-description');

  if (aboutView) {
    Formating.renderInto(aboutView, aboutView.innerHTML);
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

  function activateDeleteButton() {
    const checkboxConfirm = document.querySelector('input#checkbox-delete-confirm');
    const deleteButton = document.querySelector('#page-delete-account > div > button');
    if (!checkboxConfirm || !deleteButton) return;
    deleteButton.disabled = !checkboxConfirm.checked;
  }

  function usernameDeleteEditEvent() {
    const usernameDeleteElement = document.getElementById('username-access-delete');
    if (!usernameDeleteElement) return;

    const myText = usernameDeleteElement.value;
    if (usernameDeleteElement.getAttribute('startdata') != myText) {
      usernameDeleteElement.classList.add('limit');
    } else {
      usernameDeleteElement.classList.remove('limit');
    }
  }

  function commitToDelete() {
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
    const url = window.OWCore.apiUrl(
      window.OWCore.formatPath(endpoint.path, { user_id: userId }),
    );
    fetch(url, { method: endpoint.method, credentials: 'include' }).then(function () {
      location.reload();
    });
  }

  if (document.getElementById('username-access-delete')) {
    usernameDeleteEditEvent();
  }

  async function saveProfile() {
    let tofetch = false;
    const editEndpoint = apiPaths.profile.edit;
    let url =
      window.OWCore.apiUrl(window.OWCore.formatPath(editEndpoint.path, { user_id: userId })) +
      '?';
    let formData = new FormData();

    const username = document.getElementById('username');
    if (username && username.value != username.getAttribute('startdata')) {
      formData.append('username', username.value);
      tofetch = true;
    }
    const grade = document.getElementById('grade');
    if (grade && grade.value != grade.getAttribute('startdata')) {
      formData.append('grade', grade.value);
      tofetch = true;
    }
    const aboutRoot = document.querySelector('#page-profile .desc-edit');
    const aboutValue = window.OWDescEditors ? window.OWDescEditors.getValue(aboutRoot) : '';
    const aboutStartValue = window.OWDescEditors ? window.OWDescEditors.getStartValue(aboutRoot) : '';
    if (aboutValue != aboutStartValue) {
      formData.append('about', aboutValue);
      tofetch = true;
    }
    const avatarFileInput = document.getElementById('file-select-avatar');
    if (avatarFileInput && avatarFileInput.files.length > 0) {
      formData.append('avatar', avatarFileInput.files[0]);
      tofetch = true;
    } else {
      formData.append('avatar', '');
    }

    const emptyAvatar = document.getElementById('reset-avatar');
    if (emptyAvatar && emptyAvatar.classList.contains('toggled')) {
      formData.append('empty_avatar', true);
      tofetch = true;
    }
    const muteInput = document.getElementById('mute-delta');
    if (muteInput && Number(muteInput.value) > 0) {
      const unitSize = document.getElementById('mute-delta-unit');
      const unitValue = unitSize ? Number(unitSize.value) : 0;
      const dateResult = new Date(Date.now() + Number(muteInput.value) * unitValue * 1000);
      formData.append('mute', dateResult.toISOString().slice(0, 19));
      tofetch = true;
    }

    let profileSaved = !tofetch;
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
          profileSaved = false;
        } else {
          profileSaved = true;
        }
      } catch (error) {
        new Toast({
          title: 'Профиль',
          text: 'При запросе на сервер произошла непредвиденная ошибка...',
          theme: 'danger',
          autohide: true,
          interval: 6000,
        });
        profileSaved = false;
      }
    }

    let tofetchTWO = false;
    formData = new FormData();

    const editRightsEndpoint = apiPaths.profile.edit_rights;
    url = window.OWCore.apiUrl(
      window.OWCore.formatPath(editRightsEndpoint.path, { user_id: userId }),
    );

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

    let rightsSaved = !tofetchTWO;
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
          rightsSaved = false;
        } else {
          rightsSaved = true;
        }
      } catch (error) {
        new Toast({
          title: 'Права',
          text: 'При запросе на сервер произошла непредвиденная ошибка...',
          theme: 'danger',
          autohide: true,
          interval: 6000,
        });
        rightsSaved = false;
      }
    }

    if (tofetch || tofetchTWO) {
      if (profileSaved && rightsSaved) {
        location.reload();
      }
    } else {
      new Toast({
        title: 'Сохранение',
        text: 'Вы не внесли изменений которые можно сохранить',
        theme: 'warning',
        autohide: true,
        interval: 6000,
      });
    }
  }

  root.addEventListener('click', function (event) {
    const actionNode = event.target instanceof Element ? event.target.closest('[data-action]') : null;
    if (!actionNode) return;

    const action = actionNode.dataset.action;

    if (action === 'user-avatar-select') {
      const resetAvatar = document.getElementById('reset-avatar');
      if (resetAvatar) {
        resetAvatar.classList.remove('toggled');
      }
      if (avatarInput) {
        avatarInput.click();
      }
      return;
    }

    if (action === 'user-avatar-reset-toggle') {
      actionNode.classList.toggle('toggled');
      return;
    }

    if (action === 'user-delete-account') {
      commitToDelete();
      return;
    }

    if (action === 'user-save-profile') {
      saveProfile();
    }
  });

  root.addEventListener('input', function (event) {
    const target = event.target;
    if (!(target instanceof Element)) return;

    if (target.matches('[data-action="user-delete-name-input"]')) {
      usernameDeleteEditEvent();
    }
  });

  root.addEventListener('change', function (event) {
    const target = event.target;
    if (!(target instanceof Element)) return;

    if (target.matches('[data-action="user-delete-confirm-toggle"]')) {
      activateDeleteButton();
    }
  });
})();
