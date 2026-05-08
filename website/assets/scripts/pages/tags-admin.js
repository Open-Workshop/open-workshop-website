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
  const saveButtons = Array.from(root.querySelectorAll('[data-action="tags-save-all"]'));
  const pendingCountNodes = Array.from(root.querySelectorAll('[data-tags-pending-count]'));
  const pendingList = root.querySelector('[data-tags-pending-list]');
  const pendingEmpty = root.querySelector('[data-tags-pending-empty]');
  const saveProgress = window.OWUI && typeof window.OWUI.createSaveProgress === 'function'
    ? window.OWUI.createSaveProgress(root.querySelector('[data-save-progress-root]'))
    : null;
  const rowSelector = '[data-tags-row]';
  const groupRowSelector = '[data-groups-row]';
  const treeSectionSelector = '[data-tag-tree-section]';
  const treeStorageKey = 'open-workshop:tags-admin:tree-sections';
  const permissions = {
    add: root.dataset.tagsCanAdd === 'true',
    edit: root.dataset.tagsCanEdit === 'true',
    delete: root.dataset.tagsCanDelete === 'true',
  };
  const pendingTags = [];
  const pendingGroups = [];
  let pendingTagCounter = 1;
  let pendingGroupCounter = 1;
  let saveInProgress = false;
  let suppressNextUnload = false;

  function normalizeTagName(value) {
    return String(value || '').trim().replace(/\s+/g, ' ');
  }

  function normalizeOptionalId(value) {
    const normalized = Number(value || 0);
    return Number.isFinite(normalized) && normalized > 0 ? String(normalized) : '';
  }

  function isPendingGroupValue(value) {
    return /^pending-group-\d+$/.test(String(value || ''));
  }

  function normalizeGroupValue(value) {
    const rawValue = String(value || '').trim();
    if (isPendingGroupValue(rawValue)) return rawValue;
    return normalizeOptionalId(rawValue);
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

  function extractCreatedId(payload) {
    const normalized = Number(payload && payload.id);
    return Number.isFinite(normalized) && normalized > 0 ? normalized : 0;
  }

  function loadTreeState() {
    try {
      const parsed = JSON.parse(window.localStorage.getItem(treeStorageKey) || '{}');
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (error) {
      return {};
    }
  }

  function saveTreeState(state) {
    try {
      window.localStorage.setItem(treeStorageKey, JSON.stringify(state || {}));
    } catch (error) {
      // Tree state is a convenience, not a blocking feature.
    }
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
      parseAs: requestOptions.parseAs || 'json',
    });

    if (!result.ok) {
      throw new Error(extractResponseText(result, requestOptions.fallbackError || `Ошибка (${result.status})`));
    }

    return result;
  }

  function setTreeSectionExpanded(section, expanded, persist) {
    if (!section) return;

    section.classList.toggle('is-collapsed', !expanded);
    const toggle = section.querySelector('[data-tag-tree-toggle]');
    if (toggle) {
      toggle.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    }

    if (persist) {
      const sectionId = section.dataset.tagTreeSection;
      if (!sectionId) return;

      const state = loadTreeState();
      state[sectionId] = expanded;
      saveTreeState(state);
    }
  }

  function initTagTree() {
    const searchActive = root.dataset.tagsSearchActive === 'true';
    const state = loadTreeState();

    root.querySelectorAll(treeSectionSelector).forEach(function (section) {
      const sectionId = section.dataset.tagTreeSection;
      const defaultOpen = section.dataset.sectionDefaultOpen === 'true';
      const storedOpen = Object.prototype.hasOwnProperty.call(state, sectionId) ? state[sectionId] === true : null;
      const expanded = searchActive ? defaultOpen : (storedOpen === null ? defaultOpen : storedOpen);
      setTreeSectionExpanded(section, expanded, false);
    });
  }

  function getTagGroupSelects() {
    return Array.from(root.querySelectorAll('[data-tags-create-group], [data-tags-row-group]'));
  }

  function findPendingGroup(groupKey) {
    return pendingGroups.find(function (group) {
      return group.key === groupKey;
    }) || null;
  }

  function findGroupRow(groupId) {
    return Array.from(root.querySelectorAll(groupRowSelector)).find(function (form) {
      return String(getGroupRowId(form)) === String(groupId);
    }) || null;
  }

  function getGroupLabel(groupValue) {
    const normalizedValue = normalizeGroupValue(groupValue);
    if (!normalizedValue) return 'Без группы';

    if (isPendingGroupValue(normalizedValue)) {
      const group = findPendingGroup(normalizedValue);
      return group ? `${group.name} (новая группа)` : 'Новая группа';
    }

    const groupRow = findGroupRow(normalizedValue);
    if (groupRow) {
      const name = getGroupRowName(groupRow);
      if (name) return name;
    }

    const selects = getTagGroupSelects();
    for (const select of selects) {
      const option = Array.from(select.options).find(function (item) {
        return item.value === normalizedValue;
      });
      if (option) return option.textContent || `Группа #${normalizedValue}`;
    }

    return `Группа #${normalizedValue}`;
  }

  function appendPendingGroupOption(group) {
    getTagGroupSelects().forEach(function (select) {
      const exists = Array.from(select.options).some(function (option) {
        return option.value === group.key;
      });
      if (exists) return;

      const option = document.createElement('option');
      option.value = group.key;
      option.dataset.pendingGroup = 'true';
      option.textContent = `${group.name} (новая группа)`;
      select.appendChild(option);
    });
  }

  function removePendingGroupOption(groupKey) {
    getTagGroupSelects().forEach(function (select) {
      if (select.value === groupKey) {
        const row = select.closest(rowSelector);
        select.value = row ? normalizeGroupValue(row.dataset.tagsOriginalGroupId) : '';
      }

      Array.from(select.options).forEach(function (option) {
        if (option.value === groupKey) {
          option.remove();
        }
      });
    });

    pendingTags.forEach(function (tag) {
      if (tag.groupValue === groupKey) {
        tag.groupValue = '';
      }
    });
  }

  function syncCreateForms() {
    [createForm, groupCreateForm].forEach(function (form) {
      if (!form) return;
      form.querySelectorAll('button, input, select, textarea').forEach(function (element) {
        element.disabled = saveInProgress || !permissions.add;
      });
    });
  }

  function syncRowState(form) {
    if (!form || !form.matches(rowSelector)) return false;

    const input = form.querySelector('[data-tags-row-name]');
    const groupSelect = form.querySelector('[data-tags-row-group]');
    const deleteButton = form.querySelector('[data-action="tag-delete"]');
    const originalName = normalizeTagName(form.dataset.tagsOriginalName);
    const originalGroupValue = normalizeGroupValue(form.dataset.tagsOriginalGroupId);
    const currentName = normalizeTagName(input ? input.value : '');
    const currentGroupValue = normalizeGroupValue(groupSelect ? groupSelect.value : '');
    const deleted = form.dataset.tagsPendingDelete === 'true';
    const dirty = !deleted && (originalName !== currentName || originalGroupValue !== currentGroupValue);

    form.classList.toggle('is-dirty', dirty);
    form.classList.toggle('is-pending-delete', deleted);
    if (input) {
      input.disabled = saveInProgress || !permissions.edit || deleted;
    }
    if (groupSelect) {
      groupSelect.disabled = saveInProgress || !permissions.edit || deleted;
    }
    if (deleteButton) {
      deleteButton.disabled = saveInProgress || !permissions.delete;
      deleteButton.textContent = deleted ? 'Вернуть' : 'Удалить';
    }

    return dirty || deleted;
  }

  function syncAllRows() {
    root.querySelectorAll(rowSelector).forEach(function (form) {
      syncRowState(form);
    });
  }

  function syncGroupRowState(form) {
    if (!form || !form.matches(groupRowSelector)) return false;

    const input = form.querySelector('[data-groups-row-name]');
    const deleteButton = form.querySelector('[data-action="group-delete"]');
    const originalName = normalizeTagName(form.dataset.groupsOriginalName);
    const currentName = normalizeTagName(input ? input.value : '');
    const deleted = form.dataset.groupsPendingDelete === 'true';
    const dirty = !deleted && originalName !== currentName;

    form.classList.toggle('is-dirty', dirty);
    form.classList.toggle('is-pending-delete', deleted);
    if (input) {
      input.disabled = saveInProgress || !permissions.edit || deleted;
    }
    if (deleteButton) {
      deleteButton.disabled = saveInProgress || !permissions.delete;
      deleteButton.textContent = deleted ? 'Вернуть' : 'Удалить';
    }

    return dirty || deleted;
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

  function getRowGroupValue(form) {
    if (!form) return '';
    const select = form.querySelector('[data-tags-row-group]');
    return normalizeGroupValue(select ? select.value : '');
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

  function makeInvalid(message, form, target) {
    return { message, form, target };
  }

  function getInvalidPendingGroup(groupValue) {
    if (!isPendingGroupValue(groupValue)) return null;
    return findPendingGroup(groupValue) ? null : 'Выбрана новая группа, которой уже нет в очереди';
  }

  function collectChanges(options) {
    const validate = Boolean(options && options.validate);
    const changes = {
      newGroups: pendingGroups.slice(),
      newTags: pendingTags.slice(),
      tagEdits: [],
      tagDeletes: [],
      groupEdits: [],
      groupDeletes: [],
      invalid: null,
      count: 0,
      hasChanges: false,
    };

    changes.newGroups.forEach(function (group) {
      if (!changes.invalid && validate && !group.name) {
        changes.invalid = makeInvalid('Название новой группы не может быть пустым');
      }
    });

    changes.newTags.forEach(function (tag) {
      if (!changes.invalid && validate && !tag.name) {
        changes.invalid = makeInvalid('Название нового тега не может быть пустым');
      }
      const groupError = getInvalidPendingGroup(tag.groupValue);
      if (!changes.invalid && validate && groupError) {
        changes.invalid = makeInvalid(groupError);
      }
    });

    root.querySelectorAll(rowSelector).forEach(function (form) {
      const tagId = getRowId(form);
      const name = getRowName(form);
      const originalName = normalizeTagName(form.dataset.tagsOriginalName);
      const originalGroupValue = normalizeGroupValue(form.dataset.tagsOriginalGroupId);
      const groupValue = getRowGroupValue(form);
      const deleted = form.dataset.tagsPendingDelete === 'true';

      if (!tagId) return;

      if (deleted) {
        changes.tagDeletes.push({ id: tagId, name, form });
        return;
      }

      if (!changes.invalid && validate && permissions.edit && !name) {
        changes.invalid = makeInvalid('Название тега не может быть пустым', form, form.querySelector('[data-tags-row-name]'));
      }

      const groupError = getInvalidPendingGroup(groupValue);
      if (!changes.invalid && validate && groupError) {
        changes.invalid = makeInvalid(groupError, form, form.querySelector('[data-tags-row-group]'));
      }

      if (originalName !== name || originalGroupValue !== groupValue) {
        changes.tagEdits.push({
          id: tagId,
          name,
          originalName,
          groupValue,
          originalGroupValue,
          form,
        });
      }
    });

    root.querySelectorAll(groupRowSelector).forEach(function (form) {
      const groupId = getGroupRowId(form);
      const name = getGroupRowName(form);
      const originalName = normalizeTagName(form.dataset.groupsOriginalName);
      const deleted = form.dataset.groupsPendingDelete === 'true';

      if (!groupId) return;

      if (deleted) {
        changes.groupDeletes.push({ id: groupId, name, form });
        return;
      }

      if (!changes.invalid && validate && permissions.edit && !name) {
        changes.invalid = makeInvalid('Название группы не может быть пустым', form, form.querySelector('[data-groups-row-name]'));
      }

      if (originalName !== name) {
        changes.groupEdits.push({
          id: groupId,
          name,
          originalName,
          form,
        });
      }
    });

    changes.count = changes.newGroups.length +
      changes.newTags.length +
      changes.tagEdits.length +
      changes.tagDeletes.length +
      changes.groupEdits.length +
      changes.groupDeletes.length;
    changes.hasChanges = changes.count > 0;

    return changes;
  }

  function appendPendingItem(fragment, options) {
    const item = document.createElement('li');
    item.className = `tags-admin__pending-item tags-admin__pending-item--${options.kind || 'change'}`;

    const copy = document.createElement('div');
    copy.className = 'tags-admin__pending-copy';

    const title = document.createElement('span');
    title.className = 'tags-admin__pending-title';
    title.textContent = options.title || '';
    copy.appendChild(title);

    if (options.detail) {
      const detail = document.createElement('span');
      detail.className = 'tags-admin__pending-detail';
      detail.textContent = options.detail;
      copy.appendChild(detail);
    }

    item.appendChild(copy);

    if (options.removeKind && options.removeKey) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'small dark tags-admin__pending-remove';
      button.dataset.action = 'pending-remove';
      button.dataset.pendingKind = options.removeKind;
      button.dataset.pendingKey = options.removeKey;
      button.textContent = 'Убрать';
      item.appendChild(button);
    }

    fragment.appendChild(item);
  }

  function getTagEditDetail(change) {
    const parts = [];
    if (change.originalName !== change.name) {
      parts.push(`название: ${change.originalName || 'без названия'} -> ${change.name || 'без названия'}`);
    }
    if (change.originalGroupValue !== change.groupValue) {
      parts.push(`группа: ${getGroupLabel(change.originalGroupValue)} -> ${getGroupLabel(change.groupValue)}`);
    }
    return parts.join('; ');
  }

  function renderPendingList(changes) {
    if (!pendingList) return;

    pendingList.replaceChildren();
    pendingList.hidden = !changes.hasChanges;
    if (pendingEmpty) {
      pendingEmpty.hidden = changes.hasChanges;
    }
    if (!changes.hasChanges) return;

    const fragment = document.createDocumentFragment();

    changes.newGroups.forEach(function (group) {
      appendPendingItem(fragment, {
        kind: 'create',
        title: `Создать группу: ${group.name}`,
        detail: 'Сначала создадим группу, затем используем ее в тегах',
        removeKind: 'group',
        removeKey: group.key,
      });
    });

    changes.newTags.forEach(function (tag) {
      appendPendingItem(fragment, {
        kind: 'create',
        title: `Создать тег: ${tag.name}`,
        detail: `Группа: ${getGroupLabel(tag.groupValue)}`,
        removeKind: 'tag',
        removeKey: tag.key,
      });
    });

    changes.groupEdits.forEach(function (group) {
      appendPendingItem(fragment, {
        kind: 'edit',
        title: `Переименовать группу #${group.id}`,
        detail: `${group.originalName || 'без названия'} -> ${group.name || 'без названия'}`,
      });
    });

    changes.tagEdits.forEach(function (tag) {
      appendPendingItem(fragment, {
        kind: 'edit',
        title: `Изменить тег #${tag.id}`,
        detail: getTagEditDetail(tag),
      });
    });

    changes.tagDeletes.forEach(function (tag) {
      appendPendingItem(fragment, {
        kind: 'delete',
        title: `Удалить тег #${tag.id}`,
        detail: tag.name || 'без названия',
      });
    });

    changes.groupDeletes.forEach(function (group) {
      appendPendingItem(fragment, {
        kind: 'delete',
        title: `Удалить группу #${group.id}`,
        detail: group.name || 'без названия',
      });
    });

    pendingList.appendChild(fragment);
  }

  function syncCollector() {
    const changes = collectChanges();

    pendingCountNodes.forEach(function (node) {
      node.textContent = String(changes.count);
    });

    saveButtons.forEach(function (button) {
      button.disabled = saveInProgress || !changes.hasChanges;
      button.classList.toggle('disabled', saveInProgress || !changes.hasChanges);
      button.setAttribute('aria-busy', saveInProgress ? 'true' : 'false');
    });

    root.classList.toggle('has-pending-changes', changes.hasChanges);
    root.classList.toggle('is-saving', saveInProgress);
    renderPendingList(changes);
  }

  function syncAll() {
    syncCreateForms();
    syncAllRows();
    syncAllGroupRows();
    syncCollector();
  }

  function queueTagCreate(event) {
    event.preventDefault();

    if (!permissions.add) {
      showToast('Недоступно', 'Создание тегов недоступно для текущего аккаунта', 'warning');
      return;
    }

    const name = normalizeTagName(createInput ? createInput.value : '');
    const groupValue = normalizeGroupValue(createGroupSelect ? createGroupSelect.value : '');
    if (!name) {
      showToast('Ошибка', 'Введите название тега', 'warning');
      if (createInput) {
        createInput.focus();
      }
      return;
    }

    if (getInvalidPendingGroup(groupValue)) {
      showToast('Ошибка', 'Выбрана новая группа, которой уже нет в очереди', 'warning');
      return;
    }

    pendingTags.push({
      key: `pending-tag-${pendingTagCounter}`,
      name,
      groupValue,
    });
    pendingTagCounter += 1;

    if (createInput) {
      createInput.value = '';
      createInput.focus();
    }

    showToast('В очереди', `Тег «${name}» будет создан при сохранении`, 'success');
    syncAll();
  }

  function queueGroupCreate(event) {
    event.preventDefault();

    if (!permissions.add) {
      showToast('Недоступно', 'Создание групп недоступно для текущего аккаунта', 'warning');
      return;
    }

    const name = normalizeTagName(groupCreateInput ? groupCreateInput.value : '');
    if (!name) {
      showToast('Ошибка', 'Введите название группы', 'warning');
      if (groupCreateInput) {
        groupCreateInput.focus();
      }
      return;
    }

    const group = {
      key: `pending-group-${pendingGroupCounter}`,
      name,
    };
    pendingGroupCounter += 1;
    pendingGroups.push(group);
    appendPendingGroupOption(group);

    if (createGroupSelect) {
      createGroupSelect.value = group.key;
    }
    if (groupCreateInput) {
      groupCreateInput.value = '';
      groupCreateInput.focus();
    }

    showToast('В очереди', `Группа «${name}» будет создана при сохранении`, 'success');
    syncAll();
  }

  function removePendingTag(tagKey) {
    const index = pendingTags.findIndex(function (tag) {
      return tag.key === tagKey;
    });
    if (index < 0) return;

    pendingTags.splice(index, 1);
    syncCollector();
  }

  function removePendingGroup(groupKey) {
    const index = pendingGroups.findIndex(function (group) {
      return group.key === groupKey;
    });
    if (index < 0) return;

    pendingGroups.splice(index, 1);
    removePendingGroupOption(groupKey);
    syncAll();
  }

  function toggleTagDelete(form) {
    if (!form) return;
    if (!permissions.delete) {
      showToast('Недоступно', 'Удаление тегов недоступно для текущего аккаунта', 'warning');
      return;
    }

    if (form.dataset.tagsPendingDelete === 'true') {
      delete form.dataset.tagsPendingDelete;
    } else {
      form.dataset.tagsPendingDelete = 'true';
    }

    syncAll();
  }

  function toggleGroupDelete(form) {
    if (!form) return;
    if (!permissions.delete) {
      showToast('Недоступно', 'Удаление групп недоступно для текущего аккаунта', 'warning');
      return;
    }

    if (form.dataset.groupsPendingDelete === 'true') {
      delete form.dataset.groupsPendingDelete;
    } else {
      form.dataset.groupsPendingDelete = 'true';
    }

    syncAll();
  }

  function getMissingEndpointMessage(changes) {
    if (changes.newGroups.length > 0 && (!groupApi.add || !groupApi.add.path)) return 'В API не найден endpoint создания групп';
    if (changes.newTags.length > 0 && (!tagApi.add || !tagApi.add.path)) return 'В API не найден endpoint создания тегов';
    if (changes.tagEdits.length > 0 && (!tagApi.edit || !tagApi.edit.path)) return 'В API не найден endpoint редактирования тегов';
    if (changes.tagDeletes.length > 0 && (!tagApi.delete || !tagApi.delete.path)) return 'В API не найден endpoint удаления тегов';
    if (changes.groupEdits.length > 0 && (!groupApi.edit || !groupApi.edit.path)) return 'В API не найден endpoint редактирования групп';
    if (changes.groupDeletes.length > 0 && (!groupApi.delete || !groupApi.delete.path)) return 'В API не найден endpoint удаления групп';
    return '';
  }

  function buildSavePlan(changes) {
    const steps = [];
    if (changes.newGroups.length > 0) steps.push({ key: 'group-create', label: 'Создаем группы' });
    if (changes.newTags.length > 0) steps.push({ key: 'tag-create', label: 'Создаем теги' });
    if (changes.groupEdits.length > 0) steps.push({ key: 'group-edit', label: 'Обновляем группы' });
    if (changes.tagEdits.length > 0) steps.push({ key: 'tag-edit', label: 'Обновляем теги' });
    if (changes.tagDeletes.length > 0) steps.push({ key: 'tag-delete', label: 'Удаляем теги' });
    if (changes.groupDeletes.length > 0) steps.push({ key: 'group-delete', label: 'Удаляем группы' });
    steps.push({ key: 'finish', label: 'Завершаем сохранение' });
    steps.push({ key: 'reloading', label: 'Перезагружаем страницу' });
    return steps;
  }

  function waitForReloadPaint() {
    return new Promise(function (resolve) {
      window.requestAnimationFrame(function () {
        window.requestAnimationFrame(resolve);
      });
    });
  }

  function setProgressStep(stepKey, status, detail) {
    if (saveProgress && typeof saveProgress.setStep === 'function') {
      saveProgress.setStep(stepKey, status, detail);
    }
  }

  async function runOperationList(items, stepKey, label, operation) {
    for (let index = 0; index < items.length; index += 1) {
      setProgressStep(stepKey, 'active', `${label} ${index + 1}/${items.length}`);
      await operation(items[index]);
    }
    setProgressStep(stepKey, 'complete');
  }

  function resolveGroupIdForPayload(groupValue, createdGroupIds) {
    const normalizedValue = normalizeGroupValue(groupValue);
    if (!normalizedValue) return null;

    if (isPendingGroupValue(normalizedValue)) {
      const createdId = Number(createdGroupIds[normalizedValue] || 0);
      if (Number.isFinite(createdId) && createdId > 0) return createdId;
      throw new Error('Не удалось определить ID созданной группы');
    }

    const groupId = Number(normalizedValue);
    return Number.isFinite(groupId) && groupId > 0 ? groupId : null;
  }

  async function saveAllChanges() {
    if (saveInProgress) return;

    const changes = collectChanges({ validate: true });
    if (!changes.hasChanges) {
      showToast('Нечего сохранять', 'Нет изменений', 'info');
      return;
    }

    if (changes.invalid) {
      showToast('Проверьте изменения', changes.invalid.message, 'warning');
      markError(changes.invalid.form);
      if (changes.invalid.target && typeof changes.invalid.target.focus === 'function') {
        changes.invalid.target.focus();
      }
      return;
    }

    const missingEndpointMessage = getMissingEndpointMessage(changes);
    if (missingEndpointMessage) {
      showToast('Ошибка', missingEndpointMessage, 'danger');
      return;
    }

    const savePlan = buildSavePlan(changes);
    const createdGroupIds = {};
    let saveCompleted = false;
    saveInProgress = true;
    syncAll();

    if (saveProgress) {
      saveProgress.start({
        title: 'Сохраняем теги',
        message: 'Отправляем накопленные изменения. Не закрывайте страницу до завершения.',
        steps: savePlan,
      });
    }

    try {
      await runOperationList(changes.newGroups, 'group-create', 'Создаем группу', async function (group) {
        const result = await requestTag(groupApi.add, {
          data: { name: group.name },
          fallbackError: 'Не удалось создать группу',
          parseAs: 'json',
        });
        const groupId = extractCreatedId(result.data);
        if (!groupId) {
          throw new Error(`API не вернул ID группы «${group.name}»`);
        }
        createdGroupIds[group.key] = groupId;
      });

      await runOperationList(changes.newTags, 'tag-create', 'Создаем тег', async function (tag) {
        await requestTag(tagApi.add, {
          data: {
            name: tag.name,
            group_id: resolveGroupIdForPayload(tag.groupValue, createdGroupIds),
          },
          fallbackError: 'Не удалось создать тег',
          parseAs: 'json',
        });
      });

      await runOperationList(changes.groupEdits, 'group-edit', 'Обновляем группу', async function (group) {
        await requestTag(groupApi.edit, {
          pathParams: { group_id: group.id },
          data: { name: group.name },
          fallbackError: 'Не удалось сохранить группу',
          parseAs: 'json',
        });
      });

      await runOperationList(changes.tagEdits, 'tag-edit', 'Обновляем тег', async function (tag) {
        await requestTag(tagApi.edit, {
          pathParams: { tag_id: tag.id },
          data: {
            name: tag.name,
            group_id: resolveGroupIdForPayload(tag.groupValue, createdGroupIds),
          },
          fallbackError: 'Не удалось сохранить тег',
          parseAs: 'json',
        });
      });

      await runOperationList(changes.tagDeletes, 'tag-delete', 'Удаляем тег', async function (tag) {
        await requestTag(tagApi.delete, {
          pathParams: { tag_id: tag.id },
          fallbackError: 'Не удалось удалить тег',
          parseAs: 'text',
        });
      });

      await runOperationList(changes.groupDeletes, 'group-delete', 'Удаляем группу', async function (group) {
        await requestTag(groupApi.delete, {
          pathParams: { group_id: group.id },
          fallbackError: 'Не удалось удалить группу',
          parseAs: 'text',
        });
      });

      setProgressStep('finish', 'active', 'Изменения сохранены');
      setProgressStep('finish', 'complete', 'Изменения сохранены');
      setProgressStep('reloading', 'active', 'Перезагружаем страницу...');
      if (saveProgress && typeof saveProgress.setProgress === 'function') {
        saveProgress.setProgress(100);
      }

      showToast('Готово', 'Изменения сохранены', 'success');
      saveCompleted = true;
      await waitForReloadPaint();
      suppressNextUnload = true;
      window.location.reload();
    } catch (error) {
      if (saveProgress && typeof saveProgress.fail === 'function') {
        saveProgress.fail(error && error.message ? error.message : 'Не удалось сохранить изменения тегов');
      }
      showToast('Ошибка', error && error.message ? error.message : 'Не удалось сохранить изменения тегов', 'danger');
    } finally {
      saveInProgress = false;
      syncAll();
      if (!saveCompleted && saveProgress && typeof saveProgress.close === 'function') {
        saveProgress.close();
      }
    }
  }

  function hasUnsavedChanges() {
    if (saveInProgress) return true;
    return collectChanges().hasChanges;
  }

  if (createForm) {
    createForm.addEventListener('submit', queueTagCreate);
  }

  if (groupCreateForm) {
    groupCreateForm.addEventListener('submit', queueGroupCreate);
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
    syncCollector();
  });

  root.addEventListener('change', function (event) {
    const select = event.target instanceof Element ? event.target.closest('[data-tags-row-group]') : null;
    if (!select) return;

    syncRowState(select.closest(rowSelector));
    syncCollector();
  });

  root.addEventListener('submit', function (event) {
    const tagForm = event.target instanceof Element ? event.target.closest(rowSelector) : null;
    const groupForm = event.target instanceof Element ? event.target.closest(groupRowSelector) : null;
    if (!tagForm && !groupForm) return;

    event.preventDefault();
    syncCollector();
    showToast('В очереди', 'Изменение попадет в общий список сохранения', 'info');
  });

  root.addEventListener('click', function (event) {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;

    const treeToggle = target.closest('[data-tag-tree-toggle]');
    if (treeToggle) {
      const section = treeToggle.closest(treeSectionSelector);
      const expanded = treeToggle.getAttribute('aria-expanded') !== 'true';
      setTreeSectionExpanded(section, expanded, true);
      return;
    }

    const actionNode = target.closest('[data-action]');
    if (!actionNode) return;

    const action = actionNode.dataset.action;
    if (action === 'tags-save-all') {
      saveAllChanges();
      return;
    }

    if (action === 'pending-remove') {
      const kind = actionNode.dataset.pendingKind;
      const key = actionNode.dataset.pendingKey;
      if (kind === 'tag') {
        removePendingTag(key);
      } else if (kind === 'group') {
        removePendingGroup(key);
      }
      return;
    }

    if (action === 'tag-delete') {
      toggleTagDelete(actionNode.closest(rowSelector));
      return;
    }

    if (action === 'group-delete') {
      toggleGroupDelete(actionNode.closest(groupRowSelector));
    }
  });

  window.addEventListener('beforeunload', function (event) {
    if (suppressNextUnload) return;
    if (!hasUnsavedChanges()) return;

    event.preventDefault();
    event.returnValue = '';
    return '';
  });

  syncAll();
  initTagTree();
})();
