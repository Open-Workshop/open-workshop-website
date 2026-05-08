/* eslint-env browser */

(function () {
  const root = document.querySelector('[data-tags-admin-root]');
  if (!root || !window.OWCore || typeof window.OWCore.request !== 'function') return;

  const apiPaths = typeof window.OWCore.getApiPaths === 'function' ? window.OWCore.getApiPaths() : {};
  const tagApi = apiPaths.tag || {};
  const groupApi = apiPaths.tag_group || {};
  const createForm = root.querySelector('[data-tags-create-form]');
  const createInput = root.querySelector('[data-tags-create-input]');
  const createGroupSelect = root.querySelector('[data-tags-create-group]');
  const groupCreateForm = root.querySelector('[data-groups-create-form]');
  const groupCreateInput = root.querySelector('[data-groups-create-input]');
  const rowSelector = '[data-tags-row]';
  const groupRowSelector = '[data-groups-row]';
  const permissions = {
    add: root.dataset.tagsCanAdd === 'true',
    edit: root.dataset.tagsCanEdit === 'true',
    delete: root.dataset.tagsCanDelete === 'true',
  };

  function normalizeTagName(value) {
    return String(value || '').trim().replace(/\s+/g, ' ');
  }

  function normalizeOptionalId(value) {
    const normalized = Number(value || 0);
    return Number.isFinite(normalized) && normalized > 0 ? String(normalized) : '';
  }

  function extractResponseText(result, fallback) {
    const payload = result ? result.data : null;

    if (typeof payload === 'string') {
      const trimmed = payload.trim();
      if (!trimmed) return fallback;

      try {
        const parsed = JSON.parse(trimmed);
        if (typeof parsed === 'string') return parsed;
        if (parsed && typeof parsed.detail === 'string') return parsed.detail;
        if (parsed && typeof parsed.message === 'string') return parsed.message;
        if (parsed && typeof parsed.error === 'string') return parsed.error;
        if (parsed && typeof parsed.title === 'string') return parsed.title;
      } catch (error) {
        return trimmed.replace(/^"(.*)"$/, '$1');
      }
    }

    if (payload && typeof payload === 'object') {
      if (typeof payload.detail === 'string') return payload.detail;
      if (typeof payload.message === 'string') return payload.message;
      if (typeof payload.error === 'string') return payload.error;
      if (typeof payload.title === 'string') return payload.title;
    }

    return fallback;
  }

  function showToast(title, text, theme) {
    if (typeof Toast !== 'function') return;

    new Toast({
      title,
      text,
      theme: theme || 'success',
      autohide: true,
      interval: 4000,
    });
  }

  function getEndpointUrl(endpoint, pathParams) {
    if (!endpoint || !endpoint.path) return '';
    const path = window.OWCore.formatPath(endpoint.path, pathParams || {});
    return window.OWCore.apiUrl(path);
  }

  async function requestTag(endpoint, options) {
    const requestOptions = options || {};
    const url = getEndpointUrl(endpoint, requestOptions.pathParams);
    if (!url) {
      throw new Error(requestOptions.fallbackError || 'Не удалось определить endpoint');
    }

    const result = await window.OWCore.request(url, {
      method: requestOptions.method || endpoint.method || 'GET',
      data: requestOptions.data,
      credentials: 'include',
      parseAs: requestOptions.parseAs || 'text',
    });

    if (!result.ok) {
      throw new Error(extractResponseText(result, requestOptions.fallbackError || `Ошибка (${result.status})`));
    }

    return result;
  }

  function setBusy(form, busy) {
    if (!form) return;

    form.classList.toggle('is-busy', busy);
    form.setAttribute('aria-busy', busy ? 'true' : 'false');
    form.querySelectorAll('button, input, textarea, select').forEach(function (element) {
      element.disabled = busy;
    });

    if (!busy) {
      if (form.matches(rowSelector)) {
        syncRowState(form);
      } else if (form.matches(groupRowSelector)) {
        syncGroupRowState(form);
      }
    }
  }

  function syncRowState(form) {
    if (!form || !form.matches(rowSelector)) return false;

    const input = form.querySelector('[data-tags-row-name]');
    const groupSelect = form.querySelector('[data-tags-row-group]');
    const saveButton = form.querySelector('[data-action="tag-save"]');
    const deleteButton = form.querySelector('[data-action="tag-delete"]');
    const originalName = normalizeTagName(form.dataset.tagsOriginalName);
    const originalGroupId = normalizeOptionalId(form.dataset.tagsOriginalGroupId);
    const currentName = normalizeTagName(input ? input.value : '');
    const currentGroupId = normalizeOptionalId(groupSelect ? groupSelect.value : '');
    const dirty = originalName !== currentName || originalGroupId !== currentGroupId;

    form.classList.toggle('is-dirty', dirty);
    if (input) {
      input.disabled = !permissions.edit;
    }
    if (groupSelect) {
      groupSelect.disabled = !permissions.edit;
    }
    if (saveButton) {
      saveButton.disabled = !permissions.edit || !dirty;
    }
    if (deleteButton) {
      deleteButton.disabled = !permissions.delete;
    }

    return dirty;
  }

  function syncAllRows() {
    root.querySelectorAll(rowSelector).forEach(function (form) {
      syncRowState(form);
    });
  }

  function syncGroupRowState(form) {
    if (!form || !form.matches(groupRowSelector)) return false;

    const input = form.querySelector('[data-groups-row-name]');
    const saveButton = form.querySelector('[data-action="group-save"]');
    const deleteButton = form.querySelector('[data-action="group-delete"]');
    const originalName = normalizeTagName(form.dataset.groupsOriginalName);
    const currentName = normalizeTagName(input ? input.value : '');
    const dirty = originalName !== currentName;

    form.classList.toggle('is-dirty', dirty);
    if (input) {
      input.disabled = !permissions.edit;
    }
    if (saveButton) {
      saveButton.disabled = !permissions.edit || !dirty;
    }
    if (deleteButton) {
      deleteButton.disabled = !permissions.delete;
    }

    return dirty;
  }

  function syncAllGroupRows() {
    root.querySelectorAll(groupRowSelector).forEach(function (form) {
      syncGroupRowState(form);
    });
  }

  function getRowName(form) {
    if (!form) return '';
    const input = form.querySelector('[data-tags-row-name]');
    return normalizeTagName(input ? input.value : '');
  }

  function getRowId(form) {
    if (!form) return 0;
    const normalized = Number(form.dataset.tagId || 0);
    return Number.isFinite(normalized) ? normalized : 0;
  }

  function getRowGroupId(form) {
    if (!form) return null;
    const select = form.querySelector('[data-tags-row-group]');
    const groupId = normalizeOptionalId(select ? select.value : '');
    return groupId ? Number(groupId) : null;
  }

  function getGroupRowName(form) {
    if (!form) return '';
    const input = form.querySelector('[data-groups-row-name]');
    return normalizeTagName(input ? input.value : '');
  }

  function getGroupRowId(form) {
    if (!form) return 0;
    const normalized = Number(form.dataset.groupId || 0);
    return Number.isFinite(normalized) ? normalized : 0;
  }

  function markError(form) {
    if (!form) return;
    form.classList.add('is-error');
    window.setTimeout(function () {
      if (document.contains(form)) {
        form.classList.remove('is-error');
      }
    }, 2200);
  }

  async function createTag(event) {
    event.preventDefault();

    if (!permissions.add) {
      showToast('Недоступно', 'Создание тегов недоступно для текущего аккаунта', 'warning');
      return;
    }

    if (!tagApi.add) {
      showToast('Ошибка', 'В API не найден endpoint создания тегов', 'danger');
      return;
    }

    const form = event.currentTarget;
    const name = normalizeTagName(createInput ? createInput.value : '');
    const groupId = normalizeOptionalId(createGroupSelect ? createGroupSelect.value : '');
    if (!name) {
      showToast('Ошибка', 'Введите название тега', 'warning');
      if (createInput) {
        createInput.focus();
      }
      return;
    }

    setBusy(form, true);
    try {
      await requestTag(tagApi.add, {
        data: { name, group_id: groupId ? Number(groupId) : null },
        fallbackError: 'Не удалось создать тег',
        parseAs: 'text',
      });
      showToast('Готово', `Тег «${name}» создан`, 'success');
      window.location.reload();
    } catch (error) {
      markError(form);
      showToast('Ошибка', error && error.message ? error.message : 'Не удалось создать тег', 'danger');
    } finally {
      setBusy(form, false);
    }
  }

  async function saveTag(form) {
    if (!form) return;

    if (!permissions.edit) {
      showToast('Недоступно', 'Редактирование тегов недоступно для текущего аккаунта', 'warning');
      return;
    }

    const tagId = getRowId(form);
    const name = getRowName(form);
    const originalName = normalizeTagName(form.dataset.tagsOriginalName);
    const groupId = getRowGroupId(form);
    const originalGroupId = normalizeOptionalId(form.dataset.tagsOriginalGroupId);
    const currentGroupId = groupId === null ? '' : String(groupId);

    if (!tagId) {
      showToast('Ошибка', 'Не удалось определить ID тега', 'danger');
      return;
    }

    if (!name) {
      showToast('Ошибка', 'Название тега не может быть пустым', 'warning');
      const input = form.querySelector('[data-tags-row-name]');
      if (input) {
        input.focus();
      }
      return;
    }

    if (name === originalName && currentGroupId === originalGroupId) {
      showToast('Без изменений', 'Тег уже сохранён', 'warning');
      return;
    }

    if (!tagApi.edit) {
      showToast('Ошибка', 'В API не найден endpoint редактирования тегов', 'danger');
      return;
    }

    setBusy(form, true);
    try {
      await requestTag(tagApi.edit, {
        pathParams: { tag_id: tagId },
        data: { name, group_id: groupId },
        fallbackError: 'Не удалось сохранить тег',
        parseAs: 'text',
      });
      showToast('Готово', `Тег «${name}» сохранён`, 'success');
      window.location.reload();
    } catch (error) {
      markError(form);
      showToast('Ошибка', error && error.message ? error.message : 'Не удалось сохранить тег', 'danger');
    } finally {
      setBusy(form, false);
    }
  }

  async function deleteTag(form) {
    if (!form) return;

    if (!permissions.delete) {
      showToast('Недоступно', 'Удаление тегов недоступно для текущего аккаунта', 'warning');
      return;
    }

    const tagId = getRowId(form);
    const name = getRowName(form);

    if (!tagId) {
      showToast('Ошибка', 'Не удалось определить ID тега', 'danger');
      return;
    }

    if (!tagApi.delete) {
      showToast('Ошибка', 'В API не найден endpoint удаления тегов', 'danger');
      return;
    }

    const confirmed = window.confirm(`Удалить тег «${name || tagId}»?`);
    if (!confirmed) return;

    setBusy(form, true);
    try {
      await requestTag(tagApi.delete, {
        pathParams: { tag_id: tagId },
        fallbackError: 'Не удалось удалить тег',
        parseAs: 'text',
      });
      showToast('Готово', `Тег «${name || tagId}» удалён`, 'success');
      window.location.reload();
    } catch (error) {
      markError(form);
      showToast('Ошибка', error && error.message ? error.message : 'Не удалось удалить тег', 'danger');
    } finally {
      setBusy(form, false);
    }
  }

  async function createGroup(event) {
    event.preventDefault();

    if (!permissions.add) {
      showToast('Недоступно', 'Создание групп недоступно для текущего аккаунта', 'warning');
      return;
    }

    if (!groupApi.add) {
      showToast('Ошибка', 'В API не найден endpoint создания групп', 'danger');
      return;
    }

    const form = event.currentTarget;
    const name = normalizeTagName(groupCreateInput ? groupCreateInput.value : '');
    if (!name) {
      showToast('Ошибка', 'Введите название группы', 'warning');
      if (groupCreateInput) {
        groupCreateInput.focus();
      }
      return;
    }

    setBusy(form, true);
    try {
      await requestTag(groupApi.add, {
        data: { name },
        fallbackError: 'Не удалось создать группу',
        parseAs: 'text',
      });
      showToast('Готово', `Группа «${name}» создана`, 'success');
      window.location.reload();
    } catch (error) {
      markError(form);
      showToast('Ошибка', error && error.message ? error.message : 'Не удалось создать группу', 'danger');
    } finally {
      setBusy(form, false);
    }
  }

  async function saveGroup(form) {
    if (!form) return;

    if (!permissions.edit) {
      showToast('Недоступно', 'Редактирование групп недоступно для текущего аккаунта', 'warning');
      return;
    }

    const groupId = getGroupRowId(form);
    const name = getGroupRowName(form);
    const originalName = normalizeTagName(form.dataset.groupsOriginalName);

    if (!groupId) {
      showToast('Ошибка', 'Не удалось определить ID группы', 'danger');
      return;
    }

    if (!name) {
      showToast('Ошибка', 'Название группы не может быть пустым', 'warning');
      const input = form.querySelector('[data-groups-row-name]');
      if (input) {
        input.focus();
      }
      return;
    }

    if (name === originalName) {
      showToast('Без изменений', 'Группа уже сохранена', 'warning');
      return;
    }

    if (!groupApi.edit) {
      showToast('Ошибка', 'В API не найден endpoint редактирования групп', 'danger');
      return;
    }

    setBusy(form, true);
    try {
      await requestTag(groupApi.edit, {
        pathParams: { group_id: groupId },
        data: { name },
        fallbackError: 'Не удалось сохранить группу',
        parseAs: 'text',
      });
      showToast('Готово', `Группа «${name}» сохранена`, 'success');
      window.location.reload();
    } catch (error) {
      markError(form);
      showToast('Ошибка', error && error.message ? error.message : 'Не удалось сохранить группу', 'danger');
    } finally {
      setBusy(form, false);
    }
  }

  async function deleteGroup(form) {
    if (!form) return;

    if (!permissions.delete) {
      showToast('Недоступно', 'Удаление групп недоступно для текущего аккаунта', 'warning');
      return;
    }

    const groupId = getGroupRowId(form);
    const name = getGroupRowName(form);

    if (!groupId) {
      showToast('Ошибка', 'Не удалось определить ID группы', 'danger');
      return;
    }

    if (!groupApi.delete) {
      showToast('Ошибка', 'В API не найден endpoint удаления групп', 'danger');
      return;
    }

    const confirmed = window.confirm(`Удалить группу «${name || groupId}»?`);
    if (!confirmed) return;

    setBusy(form, true);
    try {
      await requestTag(groupApi.delete, {
        pathParams: { group_id: groupId },
        fallbackError: 'Не удалось удалить группу',
        parseAs: 'text',
      });
      showToast('Готово', `Группа «${name || groupId}» удалена`, 'success');
      window.location.reload();
    } catch (error) {
      markError(form);
      showToast('Ошибка', error && error.message ? error.message : 'Не удалось удалить группу', 'danger');
    } finally {
      setBusy(form, false);
    }
  }

  if (createForm) {
    createForm.addEventListener('submit', createTag);
  }

  if (groupCreateForm) {
    groupCreateForm.addEventListener('submit', createGroup);
  }

  root.addEventListener('input', function (event) {
    const input = event.target instanceof Element ? event.target.closest('[data-tags-row-name]') : null;
    const groupInput = event.target instanceof Element ? event.target.closest('[data-groups-row-name]') : null;
    if (!input && !groupInput) return;

    if (input) {
      syncRowState(input.closest(rowSelector));
    }
    if (groupInput) {
      syncGroupRowState(groupInput.closest(groupRowSelector));
    }
  });

  root.addEventListener('change', function (event) {
    const select = event.target instanceof Element ? event.target.closest('[data-tags-row-group]') : null;
    if (!select) return;

    syncRowState(select.closest(rowSelector));
  });

  root.addEventListener('submit', function (event) {
    const tagForm = event.target instanceof Element ? event.target.closest(rowSelector) : null;
    const groupForm = event.target instanceof Element ? event.target.closest(groupRowSelector) : null;
    if (!tagForm && !groupForm) return;

    event.preventDefault();
    if (tagForm) {
      saveTag(tagForm);
    } else {
      saveGroup(groupForm);
    }
  });

  root.addEventListener('click', function (event) {
    const deleteButton = event.target instanceof Element
      ? event.target.closest('[data-action="tag-delete"], [data-action="group-delete"]')
      : null;
    if (!deleteButton) return;

    const tagForm = deleteButton.closest(rowSelector);
    const groupForm = deleteButton.closest(groupRowSelector);
    if (tagForm) {
      deleteTag(tagForm);
    } else if (groupForm) {
      deleteGroup(groupForm);
    }
  });

  syncAllRows();
  syncAllGroupRows();
})();
