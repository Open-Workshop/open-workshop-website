/* eslint-env browser */

(function () {
  if (window.OWPickerEditors) return;

  function resolveElement(target) {
    if (!target) return null;
    if (target instanceof Element) return target;
    if (typeof target === 'string') return document.querySelector(target);
    return null;
  }

  function showToast(title, text, theme) {
    if (typeof window.Toast !== 'function') return;
    new Toast({
      title,
      text,
      theme,
      autohide: true,
      interval: 5000,
    });
  }

  function normalizeName(value) {
    return String(value || '').trim().replace(/\s+/g, ' ');
  }

  function getNameKey(value) {
    return normalizeName(value).toLocaleLowerCase('ru-RU');
  }

  function getClosestImportHeight(root) {
    return root.closest('[import-height]') || root;
  }

  function requestLayout(root) {
    const target = getClosestImportHeight(root);
    target.dispatchEvent(new Event('event-height', { bubbles: true }));
  }

  const registry = new Map();

  function closeAll(exceptKey) {
    registry.forEach(function (editor, key) {
      if (key === exceptKey) return;
      editor.close();
    });
  }

  function registerGlobalHandlers() {
    if (document.body.dataset.owPickerEditorsBound === 'true') return;
    document.body.dataset.owPickerEditorsBound = 'true';

    document.addEventListener('click', function (event) {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest('[data-picker-editor]')) return;
      closeAll();
    });

    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') {
        closeAll();
      }
    });
  }

  function create(config) {
    const root = resolveElement(config.root);
    if (!root) return null;

    const key = String(config.key || root.id || 'picker-' + (registry.size + 1));
    const existing = registry.get(key);
    if (existing) return existing;

    registerGlobalHandlers();

    const selectedList = root.querySelector('[data-picker-slot="selected"]');
    const resultsList = root.querySelector('[data-picker-slot="results"]');
    const toggleButton = root.querySelector('[data-picker-toggle]');
    const popup = root.querySelector('[data-picker-popup]');
    const searchInput = root.querySelector('[data-picker-search]');
    const createButton = root.querySelector('[data-picker-create]');
    const showMoreNode = root.querySelector('[data-picker-show-more]');

    if (!selectedList || !resultsList || !toggleButton || !popup || !searchInput) {
      return null;
    }

    const state = {
      pendingCounter: 0,
      requestCounter: 0,
      context: { ...(config.context || {}) },
    };

    function getItems(listNode) {
      return Array.from(listNode.querySelectorAll('[data-picker-id]'));
    }

    function getItemId(node) {
      return String(node.dataset.pickerId || '');
    }

    function getItemName(node) {
      if (typeof config.getItemName === 'function') {
        return normalizeName(config.getItemName(node));
      }

      if (node.dataset.pickerName) {
        return normalizeName(node.dataset.pickerName);
      }

      const title = node.querySelector('.picker-editor__item-title');
      return title ? normalizeName(title.textContent) : normalizeName(node.textContent);
    }

    function isSaved(node) {
      return node.dataset.pickerSaved === 'true';
    }

    function isPending(node) {
      return node.dataset.pickerPending === 'true' || node.classList.contains('is-pending');
    }

    function isVisible(node) {
      return !node.classList.contains('is-hidden');
    }

    function mapNode(node) {
      return {
        id: getItemId(node),
        name: getItemName(node),
      };
    }

    function findById(listNode, itemId) {
      return getItems(listNode).find(function (node) {
        return getItemId(node) === String(itemId);
      }) || null;
    }

    function findByName(listNode, nameKey) {
      return getItems(listNode).find(function (node) {
        return getNameKey(getItemName(node)) === nameKey;
      }) || null;
    }

    function insertItem(listNode, element) {
      const emptyNode = listNode.querySelector('.picker-editor__empty');
      if (emptyNode) {
        listNode.insertBefore(element, emptyNode);
      } else {
        listNode.appendChild(element);
      }
    }

    function updateEmptyState(listNode) {
      const hasVisibleItems = getItems(listNode).some(isVisible);
      listNode.classList.toggle('is-empty', !hasVisibleItems);
    }

    function updateShowMoreCount(databaseSize, resultsLength) {
      if (!showMoreNode) return;

      const overflowCount = (Number.isFinite(Number(databaseSize)) ? Number(databaseSize) : resultsLength) - resultsLength;
      showMoreNode.textContent = 'И ещё ' + overflowCount + ' шт...';
      if (overflowCount <= 0) {
        showMoreNode.setAttribute('hidden', '');
      } else {
        showMoreNode.removeAttribute('hidden');
      }
    }

    function syncListState() {
      updateEmptyState(selectedList);
      updateEmptyState(resultsList);
    }

    function notifySelectionChange() {
      syncListState();
      requestLayout(root);

      root.dispatchEvent(new CustomEvent('ow:picker-selection-change', {
        bubbles: true,
        detail: {
          editor: api,
          key,
          state: getState(),
          context: getContext(),
        },
      }));

      if (typeof config.onSelectionChange === 'function') {
        config.onSelectionChange(api);
      }
    }

    function createItem(options) {
      const element = config.renderItem({
        ...options,
        id: String(options.id),
        name: normalizeName(options.name),
      });

      if (!element.classList.contains('picker-editor__item')) {
        element.classList.add('picker-editor__item');
      }

      element.dataset.pickerId = String(options.id);
      element.dataset.pickerName = normalizeName(options.name);
      element.dataset.pickerSlot = String(options.slot || '');
      element.dataset.pickerSaved = options.saved ? 'true' : 'false';
      element.dataset.pickerPending = options.pendingCreate ? 'true' : 'false';

      element.classList.toggle('is-selected', Boolean(options.selected));
      element.classList.toggle('is-pending', Boolean(options.pendingCreate));
      element.classList.remove('is-hidden');
      element.__pickerData = options.data || null;

      return element;
    }

    function isSelected(itemId) {
      const selectedNode = findById(selectedList, itemId);
      return Boolean(selectedNode && isVisible(selectedNode));
    }

    function syncResultSelection(itemId) {
      const resultNode = findById(resultsList, itemId);
      if (resultNode) {
        resultNode.classList.toggle('is-selected', isSelected(itemId));
      }
    }

    function clearResults() {
      getItems(resultsList).forEach(function (node) {
        node.remove();
      });
    }

    function syncPendingToResults(queryKey) {
      getItems(selectedList)
        .filter(function (node) {
          return isPending(node) && isVisible(node);
        })
        .forEach(function (node) {
          const itemName = getItemName(node);
          if (queryKey !== '' && !getNameKey(itemName).includes(queryKey)) {
            return;
          }

          const itemId = getItemId(node);
          const existing = findById(resultsList, itemId);
          if (existing) {
            existing.classList.add('is-selected');
            return;
          }

          insertItem(resultsList, createItem({
            slot: 'results',
            id: itemId,
            name: itemName,
            selected: true,
            pendingCreate: true,
            showRemoveIcon: false,
          }));
        });
    }

    async function refresh() {
      if (typeof config.fetchSearchResults !== 'function') {
        syncListState();
        return;
      }

      const queryValue = normalizeName(searchInput.value);
      const queryKey = getNameKey(queryValue);
      const requestId = ++state.requestCounter;

      root.classList.add('is-loading');
      resultsList.classList.add('is-loading');

      try {
        const payload = await config.fetchSearchResults(queryValue, api);
        if (requestId !== state.requestCounter) return;

        const results = Array.isArray(payload && payload.results) ? payload.results : [];
        const databaseSize = payload && payload.databaseSize;

        clearResults();
        results.forEach(function (item) {
          insertItem(resultsList, createItem({
            slot: 'results',
            id: item.id,
            name: item.name,
            data: item,
            selected: isSelected(item.id),
            showRemoveIcon: false,
          }));
        });

        syncPendingToResults(queryKey);
        updateShowMoreCount(databaseSize, results.length);
        syncListState();
      } catch (error) {
        if (requestId !== state.requestCounter) return;
        showToast('Ошибка', error.message || String(error), 'danger');
      } finally {
        if (requestId === state.requestCounter) {
          root.classList.remove('is-loading');
          resultsList.classList.remove('is-loading');
        }
      }
    }

    function toggle(itemNode) {
      const target = resolveElement(itemNode);
      if (!target) return;

      const itemId = getItemId(target);
      if (itemId === '') return;

      const itemName = getItemName(target);
      const selectedNode = findById(selectedList, itemId);
      const visibleSelectedNode = selectedNode && isVisible(selectedNode) ? selectedNode : null;

      if (visibleSelectedNode) {
        if (isSaved(visibleSelectedNode)) {
          visibleSelectedNode.classList.add('is-hidden');
        } else {
          visibleSelectedNode.remove();
        }
      } else if (selectedNode) {
        selectedNode.classList.remove('is-hidden');
      } else {
        insertItem(selectedList, createItem({
          slot: 'selected',
          id: itemId,
          name: itemName,
          data: target.__pickerData || null,
          pendingCreate: isPending(target),
          showRemoveIcon: true,
        }));
      }

      syncResultSelection(itemId);
      notifySelectionChange();
    }

    function queueCreate() {
      const itemName = normalizeName(searchInput.value);
      const itemNameKey = getNameKey(itemName);

      if (itemName === '') {
        showToast('Пустое имя', config.emptyNameMessage || 'Введите название', 'info');
        return;
      }

      const selectedNode = findByName(selectedList, itemNameKey);
      if (selectedNode) {
        if (isVisible(selectedNode)) {
          showToast('Уже добавлено', config.duplicateMessage || 'Этот элемент уже выбран', 'info');
          return;
        }

        selectedNode.classList.remove('is-hidden');
        syncResultSelection(getItemId(selectedNode));
        notifySelectionChange();
        return;
      }

      const resultNode = findByName(resultsList, itemNameKey);
      if (resultNode) {
        if (resultNode.classList.contains('is-selected')) {
          showToast('Уже добавлено', config.duplicateMessage || 'Этот элемент уже выбран', 'info');
          return;
        }

        toggle(resultNode);
        return;
      }

      state.pendingCounter += 1;
      const pendingId = String(config.pendingPrefix || 'pending-item') + '-' + state.pendingCounter;

      insertItem(selectedList, createItem({
        slot: 'selected',
        id: pendingId,
        name: itemName,
        pendingCreate: true,
        showRemoveIcon: true,
      }));

      insertItem(resultsList, createItem({
        slot: 'results',
        id: pendingId,
        name: itemName,
        pendingCreate: true,
        selected: true,
        showRemoveIcon: false,
      }));

      notifySelectionChange();
    }

    async function setDefaultSelected(ids) {
      if (typeof config.fetchItemsByIds !== 'function' || !Array.isArray(ids) || ids.length === 0) {
        notifySelectionChange();
        return;
      }

      const items = await config.fetchItemsByIds(ids, api);
      items.forEach(function (item) {
        const itemId = String(item.id || '');
        const existing = findById(selectedList, itemId);
        if (existing) {
          existing.dataset.pickerSaved = 'true';
          existing.classList.remove('is-hidden');
          existing.__pickerData = item;
        } else {
          insertItem(selectedList, createItem({
            slot: 'selected',
            id: itemId,
            name: item.name,
            data: item,
            saved: true,
            showRemoveIcon: true,
          }));
        }
        syncResultSelection(itemId);
      });

      notifySelectionChange();
    }

    function clearVisibleSelection() {
      getItems(selectedList)
        .filter(isVisible)
        .forEach(function (node) {
          toggle(node);
        });
    }

    function finalizeCreated(tempId, realId) {
      [selectedList, resultsList].forEach(function (listNode) {
        const node = findById(listNode, tempId);
        if (!node) return;
        node.dataset.pickerId = String(realId);
        node.dataset.pickerPending = 'false';
        node.classList.remove('is-pending');
      });
    }

    function getState() {
      const selectedItems = getItems(selectedList);

      return {
        all: selectedItems.map(mapNode),
        visible: selectedItems.filter(isVisible).map(mapNode),
        savedAll: selectedItems.filter(function (node) {
          return isSaved(node) && !isPending(node);
        }).map(mapNode),
        savedVisible: selectedItems.filter(function (node) {
          return isSaved(node) && !isPending(node) && isVisible(node);
        }).map(mapNode),
        savedHidden: selectedItems.filter(function (node) {
          return isSaved(node) && !isPending(node) && !isVisible(node);
        }).map(mapNode),
        unsavedVisible: selectedItems.filter(function (node) {
          return !isSaved(node) && !isPending(node) && isVisible(node);
        }).map(mapNode),
        pendingVisible: selectedItems.filter(function (node) {
          return isPending(node) && isVisible(node);
        }).map(mapNode),
      };
    }

    function getContext() {
      return { ...state.context };
    }

    function setContext(nextContext) {
      state.context = {
        ...state.context,
        ...(nextContext || {}),
      };
    }

    async function open() {
      closeAll(key);
      root.classList.add('is-open');
      root.dispatchEvent(new CustomEvent('ow:picker-open-change', {
        bubbles: true,
        detail: {
          editor: api,
          key,
          open: true,
        },
      }));
      if (typeof config.onOpen === 'function') {
        await config.onOpen(api);
      } else {
        await refresh();
      }
    }

    function close() {
      if (!root.classList.contains('is-open')) return;
      root.classList.remove('is-open');
      root.dispatchEvent(new CustomEvent('ow:picker-open-change', {
        bubbles: true,
        detail: {
          editor: api,
          key,
          open: false,
        },
      }));
    }

    function isOpen() {
      return root.classList.contains('is-open');
    }

    root.addEventListener('click', function (event) {
      const target = event.target;
      if (!(target instanceof Element)) return;

      const createTrigger = target.closest('[data-picker-create]');
      if (createTrigger && root.contains(createTrigger)) {
        queueCreate();
        return;
      }

      const toggleTrigger = target.closest('[data-picker-toggle]');
      if (toggleTrigger && root.contains(toggleTrigger)) {
        if (isOpen()) {
          close();
        } else {
          open();
        }
        return;
      }

      const item = target.closest('[data-picker-id]');
      if (item && root.contains(item)) {
        toggle(item);
      }
    });

    searchInput.addEventListener('input', function () {
      refresh();
    });

    syncListState();

    const api = {
      key,
      root,
      open,
      close,
      isOpen,
      refresh,
      toggle,
      queueCreate,
      setDefaultSelected,
      clearVisibleSelection,
      finalizeCreated,
      getState,
      getContext,
      setContext,
    };

    registry.set(key, api);
    root.dataset.owPickerEditorKey = key;

    return api;
  }

  window.OWPickerEditors = {
    create,
    get(key) {
      return registry.get(String(key)) || null;
    },
    closeAll,
    requestLayout,
  };
})();
