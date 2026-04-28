(function () {
  const root = document.querySelector('main.user.settings');
  if (!root) return;

  const apiPaths = window.OWCore.getApiPaths();
  const ow = window.OWCore.getConfig ? window.OWCore.getConfig() : {};
  const rightsList = (ow.rights && ow.rights.list) || [];
  const userId = root.dataset.userId;
  const aboutView = document.querySelector('#page-profile article#mod-description');
  const avatarUploadEndpoint = apiPaths.mod && apiPaths.mod.file ? apiPaths.mod.file : null;

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

  function extractApiMessage(result, fallback) {
    const payload = result ? result.data : null;

    if (typeof payload === 'string') {
      return payload;
    }

    if (payload && typeof payload === 'object') {
      if (typeof payload.detail === 'string') return payload.detail;
      if (typeof payload.message === 'string') return payload.message;
      if (typeof payload.error === 'string') return payload.error;
      if (typeof payload.title === 'string') return payload.title;
    }

    return fallback;
  }

  async function requestJson(pathOrUrl, options, fallbackMessage) {
    const result = await window.OWCore.request(pathOrUrl, {
      ...(options || {}),
      parseAs: 'json',
      credentials: 'include',
    });

    if (!result.ok) {
      throw new Error(extractApiMessage(result, fallbackMessage));
    }

    return result.data;
  }

  async function deleteAvatar() {
    const endpoint = apiPaths.profile.avatar_delete;
    const url = window.OWCore.apiUrl(
      window.OWCore.formatPath(endpoint.path, { user_id: userId }),
    );
    const response = await fetch(url, {
      method: endpoint.method,
      credentials: 'include',
    });

    if (!response.ok) {
      const text = await response.text().catch(function () {
        return '';
      });
      throw new Error(text || `Ошибка (${response.status})`);
    }
  }

  async function uploadAvatar(file) {
    if (!avatarUploadEndpoint) {
      throw new Error('В приложении не настроен endpoint для загрузки аватара');
    }

    const uploadPayload = {
      kind: 'profile_avatar',
      owner_type: 'profile',
      owner_id: Number(userId),
      mode: 'replace',
    };

    const uploadResult = await window.OWCore.request(
      window.OWCore.apiUrl(avatarUploadEndpoint.path),
      {
        method: avatarUploadEndpoint.method,
        data: uploadPayload,
        parseAs: 'json',
        credentials: 'include',
        headers: {
          'X-Requested-With': 'XMLHttpRequest',
          Accept: 'application/json',
        },
      },
    );

    if (!uploadResult.ok) {
      throw new Error(extractApiMessage(uploadResult, 'Не удалось инициализировать загрузку аватара'));
    }

    const transferUrl = uploadResult.data && uploadResult.data.transfer_url;
    if (!transferUrl) {
      throw new Error('Не удалось получить ссылку загрузки аватара');
    }

    const response = await fetch(transferUrl, {
      method: 'POST',
      body: file,
      headers: {
        'Content-Type': 'application/octet-stream',
      },
      credentials: 'omit',
    });

    if (!response.ok) {
      const text = await response.text().catch(function () {
        return '';
      });
      throw new Error(text || `Ошибка (${response.status})`);
    }
  }

  function clearAvatarSelection() {
    if (avatarInput) {
      avatarInput.value = '';
    }

    if (avatarImg) {
      const startData = avatarImg.getAttribute('startdata');
      if (startData) {
        avatarImg.src = startData;
      }
    }
  }

  if (document.getElementById('username-access-delete')) {
    usernameDeleteEditEvent();
  }

  async function saveProfile() {
    const editEndpoint = apiPaths.profile.edit;
    const profilePayload = {};

    const username = document.getElementById('username');
    if (username && username.value != username.getAttribute('startdata')) {
      profilePayload.username = username.value;
    }
    const grade = document.getElementById('grade');
    if (grade && grade.value != grade.getAttribute('startdata')) {
      profilePayload.grade = grade.value;
    }
    const aboutRoot = document.querySelector('#page-profile .desc-edit');
    const aboutValue = window.OWDescEditors ? window.OWDescEditors.getValue(aboutRoot) : '';
    const aboutStartValue = window.OWDescEditors ? window.OWDescEditors.getStartValue(aboutRoot) : '';
    if (aboutValue != aboutStartValue) {
      profilePayload.about = aboutValue;
    }

    const emptyAvatar = document.getElementById('reset-avatar');
    const muteInput = document.getElementById('mute-delta');
    if (muteInput && Number(muteInput.value) > 0) {
      const unitSize = document.getElementById('mute-delta-unit');
      const unitValue = unitSize ? Number(unitSize.value) : 0;
      const dateResult = new Date(Date.now() + Number(muteInput.value) * unitValue * 1000);
      profilePayload.mute_until = dateResult.toISOString();
    }

    const avatarFileInput = document.getElementById('file-select-avatar');
    const avatarFile = avatarFileInput && avatarFileInput.files.length > 0 ? avatarFileInput.files[0] : null;
    const resetAvatar = Boolean(emptyAvatar && emptyAvatar.classList.contains('toggled'));

    let profileSaved = Object.keys(profilePayload).length === 0;
    if (!profileSaved) {
      try {
        await requestJson(
          window.OWCore.apiUrl(window.OWCore.formatPath(editEndpoint.path, { user_id: userId })),
          {
            method: editEndpoint.method,
            data: profilePayload,
          },
          'Профиль',
        );
        profileSaved = true;
      } catch (error) {
        new Toast({
          title: 'Профиль',
          text: error && error.message ? error.message : 'При запросе на сервер произошла непредвиденная ошибка...',
          theme: 'warning',
          autohide: true,
          interval: 6000,
        });
        profileSaved = false;
      }
    }

    const editRightsEndpoint = apiPaths.profile.edit_rights;
    const rightsPayload = {};

    function addRight(nameCheckbox) {
      const checkbox = document.getElementById('checkbox-rights-edit-' + nameCheckbox);
      if (checkbox && checkbox.hasAttribute('startdata') != checkbox.checked) {
        rightsPayload[nameCheckbox] = checkbox.checked;
      }
    }

    for (let i = 0; i < rightsList.length; i += 1) {
      addRight(rightsList[i]);
    }

    let rightsSaved = Object.keys(rightsPayload).length === 0;
    if (!rightsSaved) {
      try {
        await requestJson(
          window.OWCore.apiUrl(window.OWCore.formatPath(editRightsEndpoint.path, { user_id: userId })),
          {
            method: editRightsEndpoint.method,
            data: rightsPayload,
          },
          'Права',
        );
        rightsSaved = true;
      } catch (error) {
        new Toast({
          title: 'Права',
          text: error && error.message ? error.message : 'При запросе на сервер произошла непредвиденная ошибка...',
          theme: 'warning',
          autohide: true,
          interval: 6000,
        });
        rightsSaved = false;
      }
    }

    let avatarSaved = !avatarFile && !resetAvatar;
    if (resetAvatar) {
      try {
        await deleteAvatar();
        avatarSaved = true;
      } catch (error) {
        new Toast({
          title: 'Аватар',
          text: error && error.message ? error.message : 'Не удалось сбросить аватар',
          theme: 'warning',
          autohide: true,
          interval: 6000,
        });
        avatarSaved = false;
      }
    } else if (avatarFile) {
      try {
        await uploadAvatar(avatarFile);
        avatarSaved = true;
      } catch (error) {
        new Toast({
          title: 'Аватар',
          text: error && error.message ? error.message : 'Не удалось загрузить аватар',
          theme: 'warning',
          autohide: true,
          interval: 6000,
        });
        avatarSaved = false;
      }
    }

    if (!Object.keys(profilePayload).length && !Object.keys(rightsPayload).length && !avatarFile && !resetAvatar) {
      new Toast({
        title: 'Сохранение',
        text: 'Вы не внесли изменений которые можно сохранить',
        theme: 'warning',
        autohide: true,
        interval: 6000,
      });
      return;
    }

    if (profileSaved && rightsSaved && avatarSaved) {
      location.reload();
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
      if (actionNode.classList.contains('toggled')) {
        clearAvatarSelection();
      }
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
