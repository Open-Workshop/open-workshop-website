/* eslint-env browser */

(function () {
  const runtime = window.OWEditRuntime;
  if (!runtime) return;

  runtime.define('mod-edit-media-manager', function createModEditMediaManager(options) {
    const root = runtime.resolveElement(options && options.root);
    if (!root) return null;
    const fallbackImage = window.OWCore.getImageFallback();

    const stage = root.querySelector('[data-media-stage]');
    const list = root.querySelector('.media-manager__list');
    const emptyNode = root.querySelector('[data-media-empty]');
    const footer = root.querySelector('.media-manager__footer');
    const pagination = root.querySelector('[data-media-pagination]');
    const countNode = root.querySelector('[data-media-count]');
    const logoStateNode = root.querySelector('[data-media-logo-state]');
    const dropzone = root.querySelector('[data-media-dropzone]');
    const fileInput = root.querySelector('[data-media-input="file"]');
    const addFileButton = root.querySelector('[data-media-action="add-file"]');
    const prevButton = root.querySelector('[data-media-action="prev-page"]');
    const nextButton = root.querySelector('[data-media-action="next-page"]');

    if (!stage || !list || !emptyNode) return null;

    const PAGINATION_WINDOW = 4;
    const state = {
      items: [],
      deletedIds: new Set(),
      subscribers: new Set(),
      nextKey: 0,
      storageHost: '',
      activeKey: '',
      isDragOver: false,
      dragDepth: 0,
      paginationDragKey: '',
      paginationDropKey: '',
      paginationDropPlacement: 'after',
      paginationSuppressClick: false,
      paginationSuppressClickTimer: null,
    };

    if (root.dataset.storageOrigin) {
      try {
        state.storageHost = new URL(root.dataset.storageOrigin).hostname;
      } catch (error) {
        state.storageHost = '';
      }
    }

    function nextKey(prefix) {
      state.nextKey += 1;
      return `${prefix || 'media'}-${state.nextKey}`;
    }

    function normalizeUrl(value) {
      return String(value || '').trim();
    }

    function parseSortOrder(value, fallback) {
      const parsed = Number.parseInt(String(value || ''), 10);
      return Number.isFinite(parsed) ? parsed : fallback;
    }

    function isStorageUrl(value) {
      if (!value || !state.storageHost) return false;
      try {
        const parsed = new URL(value, window.location.origin);
        return parsed.hostname === state.storageHost;
      } catch (error) {
        return false;
      }
    }

    function getSourceLabel(item) {
      if (item.source === 'file') {
        return `Файл: ${item.fileName || ''}`;
      }
      return isStorageUrl(item.startUrl || item.url) ? 'Storage' : 'URL';
    }

    function getResolvedUrl(item) {
      if (item.source === 'file') {
        return item.objectUrl || fallbackImage;
      }

      const currentUrl = normalizeUrl(item.url);
      if (currentUrl) return currentUrl;
      if (item.startUrl) return item.startUrl;
      return fallbackImage;
    }

    function findItem(key) {
      return state.items.find(function (item) {
        return item.key === key;
      }) || null;
    }

    function findNode(key) {
      return list.querySelector(`[data-media-key="${key}"]`);
    }

    function getActiveIndex() {
      const index = state.items.findIndex(function (item) {
        return item.key === state.activeKey;
      });
      return index >= 0 ? index : 0;
    }

    function ensureActiveItem(preferredKey) {
      if (state.items.length === 0) {
        state.activeKey = '';
        return;
      }

      if (preferredKey && findItem(preferredKey)) {
        state.activeKey = preferredKey;
        return;
      }

      if (findItem(state.activeKey)) {
        return;
      }

      state.activeKey = state.items[0].key;
    }

    function setActiveIndex(index) {
      if (state.items.length === 0) {
        state.activeKey = '';
        renderCarousel();
        return;
      }

      const nextIndex = Math.max(0, Math.min(index, state.items.length - 1));
      state.activeKey = state.items[nextIndex].key;
      renderCarousel();
    }

    function getPaginationRange(activeIndex) {
      const total = state.items.length;
      const visibleCount = Math.min(PAGINATION_WINDOW, total);
      let start = 0;

      if (total > visibleCount) {
        start = activeIndex - Math.floor(visibleCount / 2);
        if (start < 0) {
          start = 0;
        }
        if (start + visibleCount > total) {
          start = total - visibleCount;
        }
      }

      return {
        start,
        end: start + visibleCount,
      };
    }

    function createMediaItemNode(item) {
      const node = document.createElement('div');
      node.className = 'media-item';
      node.dataset.mediaKey = item.key;
      node.dataset.sortOrder = String(item.sortOrder);

      const preview = document.createElement('a');
      preview.className = 'media-item__preview without-caption image-link';
      preview.target = '_blank';
      preview.href = getResolvedUrl(item);

      const backdrop = document.createElement('img');
      backdrop.className = 'media-item__backdrop';
      backdrop.src = getResolvedUrl(item);
      backdrop.alt = '';
      backdrop.setAttribute('aria-hidden', 'true');
      backdrop.dataset.fallbackSrc = fallbackImage;

      const image = document.createElement('img');
      image.className = 'media-item__image';
      image.src = getResolvedUrl(item);
      image.alt = 'Изображение мода';
      image.dataset.fallbackSrc = fallbackImage;

      preview.appendChild(backdrop);
      preview.appendChild(image);

      const toolbar = document.createElement('div');
      toolbar.className = 'media-item__toolbar';

      const logoToggle = document.createElement('label');
      logoToggle.className = 'media-item__logo-toggle';

      const logoCheckbox = document.createElement('input');
      logoCheckbox.type = 'checkbox';
      logoCheckbox.className = 'media-item__logo-checkbox';
      logoCheckbox.checked = item.type === 'logo';

      const logoLabel = document.createElement('span');
      logoLabel.className = 'media-item__logo-label';
      logoLabel.textContent = 'Лого';

      const deleteButton = document.createElement('button');
      deleteButton.className = 'button-style button-style-small media-item__delete';
      deleteButton.type = 'button';
      deleteButton.dataset.mediaAction = 'delete';
      deleteButton.title = 'Удалить изображение';
      deleteButton.setAttribute('aria-label', 'Удалить изображение');

      logoToggle.appendChild(logoCheckbox);
      logoToggle.appendChild(logoLabel);
      toolbar.appendChild(logoToggle);
      toolbar.appendChild(deleteButton);

      const source = document.createElement('div');
      source.className = 'media-item__source ow-muted';
      source.dataset.mediaRole = 'source';
      source.textContent = getSourceLabel(item);

      node.appendChild(preview);
      node.appendChild(toolbar);
      node.appendChild(source);
      return node;
    }

    function syncItemNode(item) {
      const node = findNode(item.key);
      if (!node) return;

      node.dataset.sortOrder = String(item.sortOrder);

      const preview = node.querySelector('.media-item__preview');
      const backdrop = node.querySelector('.media-item__backdrop');
      const image = node.querySelector('.media-item__image');
      const logoCheckbox = node.querySelector('.media-item__logo-checkbox');
      const source = node.querySelector('[data-media-role="source"]');
      const nextUrl = getResolvedUrl(item);

      if (preview) {
        preview.href = nextUrl;
      }
      if (backdrop) {
        backdrop.src = nextUrl;
      }
      if (image) {
        image.src = nextUrl;
      }
      if (logoCheckbox) {
        logoCheckbox.checked = item.type === 'logo';
      }
      if (source) {
        source.textContent = getSourceLabel(item);
      }
    }

    function insertNode(node, prepend) {
      if (prepend) {
        list.insertBefore(node, list.firstChild);
        return;
      }
      list.appendChild(node);
    }

    function syncSortOrders() {
      state.items.forEach(function (item, index) {
        item.sortOrder = index;
        const node = findNode(item.key);
        if (node) {
          node.dataset.sortOrder = String(index);
        }
      });
    }

    function syncMainListOrder() {
      if (!list) return;

      const nodes = state.items
        .map(function (item) {
          return findNode(item.key);
        })
        .filter(function (node) {
          return Boolean(node);
        });

      if (nodes.length > 0) {
        list.replaceChildren.apply(list, nodes);
      }
    }

    function getPaginationButtonNodes() {
      if (!pagination) return [];
      return Array.from(pagination.querySelectorAll('[data-media-page-key]'));
    }

    function updatePaginationDragState() {
      if (!pagination) return;

      getPaginationButtonNodes().forEach(function (node) {
        const key = node.dataset.mediaPageKey || '';
        const isSource = key === state.paginationDragKey;
        const isTarget = key === state.paginationDropKey;
        node.classList.toggle('is-draggable', state.items.length > 1);
        node.classList.toggle('is-drag-source', isSource);
        node.classList.toggle('is-drop-before', isTarget && state.paginationDropPlacement === 'before');
        node.classList.toggle('is-drop-after', isTarget && state.paginationDropPlacement === 'after');
      });
    }

    function clearPaginationDragState() {
      if (!state.paginationDragKey && !state.paginationDropKey) return;

      state.paginationDragKey = '';
      state.paginationDropKey = '';
      state.paginationDropPlacement = 'after';
      updatePaginationDragState();
    }

    function setPaginationDropState(sourceKey, targetKey, placement) {
      state.paginationDragKey = sourceKey || '';
      state.paginationDropKey = targetKey || '';
      state.paginationDropPlacement = placement === 'before' ? 'before' : 'after';
      updatePaginationDragState();
    }

    function renderPagination() {
      if (!pagination) return;

      const count = state.items.length;
      pagination.replaceChildren();
      pagination.hidden = count === 0;
      if (footer) {
        footer.hidden = false;
      }

      if (count === 0) {
        clearPaginationDragState();
        return;
      }

      const activeIndex = getActiveIndex();
      const range = getPaginationRange(activeIndex);
      const draggable = count > 1;

      for (let index = range.start; index < range.end; index += 1) {
        const item = state.items[index];
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'media-manager__page';
        button.dataset.mediaPage = String(index);
        button.dataset.mediaPageKey = item.key;
        button.textContent = String(index + 1);
        button.draggable = draggable;
        button.title = draggable
          ? `Изображение ${index + 1}. Перетащите, чтобы изменить порядок`
          : `Изображение ${index + 1}`;
        button.setAttribute('aria-label', `Изображение ${index + 1}`);
        button.classList.toggle('is-active', index === activeIndex);
        button.classList.toggle('is-draggable', draggable);
        pagination.appendChild(button);
      }

      updatePaginationDragState();
    }

    function updateIndicators() {
      const count = state.items.length;
      if (countNode) {
        countNode.textContent = `${count} шт`;
      }

      emptyNode.hidden = count > 0;

      const logoItem = state.items.find(function (item) {
        return item.type === 'logo';
      });

      if (logoStateNode) {
        if (logoItem) {
          logoStateNode.textContent = 'Логотип выбран';
          logoStateNode.classList.add('has-logo');
        } else {
          logoStateNode.textContent = 'Логотип не выбран';
          logoStateNode.classList.remove('has-logo');
        }
      }
    }

    function renderCarousel() {
      ensureActiveItem();

      const count = state.items.length;
      const activeIndex = getActiveIndex();
      list.style.transform = count > 0 ? `translateX(-${activeIndex * 100}%)` : 'translateX(0)';

      if (prevButton) {
        prevButton.disabled = activeIndex <= 0;
      }
      if (nextButton) {
        nextButton.disabled = activeIndex >= count - 1;
      }

      stage.classList.toggle('is-dragover', state.isDragOver);
      if (dropzone) {
        dropzone.hidden = !state.isDragOver;
      }

      renderPagination();
    }

    function getResourceChanges() {
      const changes = {
        new: [],
        changed: [],
        deleted: Array.from(state.deletedIds),
      };

      state.items.forEach(function (item) {
        if (item.isNew) {
          if (item.source === 'file') {
            if (item.file) {
              changes.new.push({
                type: item.type,
                file: item.file,
                sortOrder: item.sortOrder,
              });
            }
            return;
          }

          const url = normalizeUrl(item.url);
          if (url) {
            changes.new.push({
              type: item.type,
              url,
              sortOrder: item.sortOrder,
            });
          }
          return;
        }

        const typeChanged = item.type !== item.startType;
        const sortOrderChanged = item.sortOrder !== item.startSortOrder;

        if (typeChanged || sortOrderChanged) {
          const nextChange = { id: item.id };
          if (typeChanged) {
            nextChange.type = item.type;
          }
          if (sortOrderChanged) {
            nextChange.sortOrder = item.sortOrder;
          }
          changes.changed.push(nextChange);
        }
      });

      return changes;
    }

    function getState() {
      return {
        items: state.items.map(function (item) {
          return {
            key: item.key,
            id: item.id,
            type: item.type,
            source: item.source,
            isNew: item.isNew,
            urlEditable: item.urlEditable,
            sortOrder: item.sortOrder,
            startSortOrder: item.startSortOrder,
            previewUrl: getResolvedUrl(item),
            invalidUrl: Boolean(item.invalidUrl),
          };
        }),
        count: state.items.length,
        hasLogo: state.items.some(function (item) {
          return item.type === 'logo';
        }),
        logoUrl: (function () {
          const logoItem = state.items.find(function (item) {
            return item.type === 'logo';
          });
          return logoItem ? getResolvedUrl(logoItem) : null;
        })(),
        hasInvalidUrls: state.items.some(function (item) {
          return Boolean(item.invalidUrl);
        }),
        changes: getResourceChanges(),
      };
    }

    function notify(reason) {
      ensureActiveItem();
      updateIndicators();
      renderCarousel();

      const snapshot = getState();
      state.subscribers.forEach(function (listener) {
        listener(snapshot, reason || 'update');
      });
    }

    function subscribe(listener) {
      if (typeof listener !== 'function') {
        return function noop() {};
      }

      state.subscribers.add(listener);
      listener(getState(), 'init');
      return function unsubscribe() {
        state.subscribers.delete(listener);
      };
    }

    function enforceSingleLogo(activeItem) {
      if (!activeItem || activeItem.type !== 'logo') return;

      state.items.forEach(function (item) {
        if (item.key !== activeItem.key && item.type === 'logo') {
          item.type = 'screenshot';
          syncItemNode(item);
        }
      });
    }

    function createStateItem(data) {
      const isNew = Boolean(data.isNew);
      const startSortOrder = isNew
        ? null
        : parseSortOrder(
          data.startSortOrder,
          parseSortOrder(data.sortOrder, 0),
        );
      const sortOrder = parseSortOrder(
        data.sortOrder,
        startSortOrder === null ? 0 : startSortOrder,
      );

      return {
        key: data.key || nextKey(data.isNew ? 'new' : 'existing'),
        id: data.id || '',
        type: data.type || 'screenshot',
        startType: data.startType || data.type || 'screenshot',
        source: data.source || 'url',
        startUrl: data.startUrl || '',
        url: data.url || '',
        urlEditable: Boolean(data.urlEditable),
        isNew,
        file: data.file || null,
        fileName: data.fileName || '',
        objectUrl: data.objectUrl || '',
        invalidUrl: Boolean(data.invalidUrl),
        startSortOrder,
        sortOrder,
      };
    }

    function addItem(item, prepend) {
      state.items[prepend ? 'unshift' : 'push'](item);
      insertNode(createMediaItemNode(item), Boolean(prepend));
      syncSortOrders();

      if (item.type === 'logo') {
        enforceSingleLogo(item);
      }

      ensureActiveItem(item.key);
      notify('add');
    }

    function removeItem(item) {
      if (!item) return;

      const removedIndex = state.items.findIndex(function (candidate) {
        return candidate.key === item.key;
      });
      const nextIndex = Math.max(0, Math.min(removedIndex, state.items.length - 2));
      const nextActiveItem = state.items[nextIndex] || null;

      state.items = state.items.filter(function (candidate) {
        return candidate.key !== item.key;
      });

      if (item.objectUrl) {
        URL.revokeObjectURL(item.objectUrl);
      }

      if (!item.isNew && item.id) {
        state.deletedIds.add(String(item.id));
      }

      const node = findNode(item.key);
      if (node) {
        node.remove();
      }

      syncSortOrders();
      ensureActiveItem(nextActiveItem ? nextActiveItem.key : '');
      notify('delete');
    }

    function addFileItems(files) {
      const nextFiles = Array.from(files || []);
      const validFiles = nextFiles.filter(function (file) {
        return String(file && file.type || '').startsWith('image/');
      });

      if (validFiles.length === 0) {
        runtime.showToast('Нужен файл', 'Выберите изображение', 'info');
        return;
      }

      if (validFiles.length !== nextFiles.length) {
        runtime.showToast('Часть файлов пропущена', 'Можно загружать только изображения', 'warning');
      }

      for (let index = validFiles.length - 1; index >= 0; index -= 1) {
        const file = validFiles[index];
        const objectUrl = URL.createObjectURL(file);
        addItem(createStateItem({
          type: 'screenshot',
          source: 'file',
          isNew: true,
          file,
          fileName: file.name,
          objectUrl,
        }), true);
      }
    }

    function parseExistingItems() {
      const items = Array.from(list.querySelectorAll('.media-item')).map(function (node) {
        const preview = node.querySelector('.media-item__preview');
        const logoCheckbox = node.querySelector('.media-item__logo-checkbox');
        const startUrl = normalizeUrl(node.dataset.startUrl || (preview ? preview.getAttribute('href') : ''));
        const startSortOrder = parseSortOrder(node.dataset.sortOrder, 0);

        return createStateItem({
          id: String(node.dataset.id || ''),
          type: logoCheckbox && logoCheckbox.checked ? 'logo' : String(node.dataset.startType || 'screenshot'),
          startType: String(node.dataset.startType || (logoCheckbox && logoCheckbox.checked ? 'logo' : 'screenshot')),
          source: String(node.dataset.source || 'url'),
          startUrl,
          url: startUrl,
          urlEditable: false,
          isNew: false,
          startSortOrder,
          sortOrder: startSortOrder,
        });
      });

      state.items = items;
      state.activeKey = items[0] ? items[0].key : '';

      Array.from(list.querySelectorAll('.media-item')).forEach(function (node) {
        node.remove();
      });

      state.items.forEach(function (item) {
        insertNode(createMediaItemNode(item), false);
      });

      updateIndicators();
      renderCarousel();
    }

    function canHandleTransfer(dataTransfer) {
      if (!dataTransfer) return false;
      if (dataTransfer.files && dataTransfer.files.length > 0) {
        return true;
      }
      const types = dataTransfer.types ? Array.from(dataTransfer.types) : [];
      return types.indexOf('Files') !== -1;
    }

    function setDragState(nextValue) {
      state.isDragOver = Boolean(nextValue);
      renderCarousel();
    }

    function reorderItems(sourceKey, targetKey, placement) {
      if (!sourceKey || !targetKey || sourceKey === targetKey) return;

      const sourceIndex = state.items.findIndex(function (item) {
        return item.key === sourceKey;
      });
      const targetIndex = state.items.findIndex(function (item) {
        return item.key === targetKey;
      });

      if (sourceIndex < 0 || targetIndex < 0) return;

      let insertIndex = placement === 'before' ? targetIndex : targetIndex + 1;
      if (sourceIndex === insertIndex || (sourceIndex + 1 === insertIndex && placement === 'before')) {
        return;
      }

      const movedItems = state.items.splice(sourceIndex, 1);
      const movedItem = movedItems[0];

      if (sourceIndex < insertIndex) {
        insertIndex -= 1;
      }

      state.items.splice(insertIndex, 0, movedItem);
      syncMainListOrder();
      syncSortOrders();
      ensureActiveItem();
      notify('reorder');
    }

    function getPaginationDropInfo(clientX) {
      if (!pagination) return null;

      const nodes = getPaginationButtonNodes();
      if (nodes.length === 0) return null;

      for (let index = 0; index < nodes.length; index += 1) {
        const node = nodes[index];
        const rect = node.getBoundingClientRect();
        if (clientX < rect.left + rect.width / 2) {
          return {
            key: node.dataset.mediaPageKey || '',
            placement: 'before',
          };
        }
      }

      const lastNode = nodes[nodes.length - 1];
      return {
        key: lastNode.dataset.mediaPageKey || '',
        placement: 'after',
      };
    }

    function suppressPaginationClick() {
      state.paginationSuppressClick = true;
      if (state.paginationSuppressClickTimer) {
        window.clearTimeout(state.paginationSuppressClickTimer);
      }
      state.paginationSuppressClickTimer = window.setTimeout(function () {
        state.paginationSuppressClick = false;
        state.paginationSuppressClickTimer = null;
      }, 0);
    }

    list.addEventListener('change', function (event) {
      const target = event.target;
      if (!(target instanceof Element)) return;

      if (target.classList.contains('media-item__logo-checkbox')) {
        const node = target.closest('[data-media-key]');
        const item = node ? findItem(node.dataset.mediaKey || '') : null;
        if (!item) return;

        item.type = target.checked ? 'logo' : 'screenshot';
        if (item.type === 'logo') {
          enforceSingleLogo(item);
        }
        syncItemNode(item);
        notify('type');
      }
    });

    list.addEventListener('click', function (event) {
      const button = event.target instanceof Element ? event.target.closest('[data-media-action="delete"]') : null;
      if (!button) return;

      const node = button.closest('[data-media-key]');
      const item = node ? findItem(node.dataset.mediaKey || '') : null;
      removeItem(item);
    });

    if (pagination) {
      pagination.addEventListener('click', function (event) {
        if (state.paginationDragKey || state.paginationSuppressClick) return;

        const target = event.target instanceof Element ? event.target.closest('[data-media-page]') : null;
        if (!target) return;

        const index = Number.parseInt(target.dataset.mediaPage || '', 10);
        if (!Number.isFinite(index)) return;
        setActiveIndex(index);
      });

      pagination.addEventListener('dragstart', function (event) {
        const button = event.target instanceof Element ? event.target.closest('[data-media-page-key]') : null;
        if (!button || !event.dataTransfer || !button.draggable) return;

        const key = button.dataset.mediaPageKey || '';
        if (!findItem(key)) return;

        state.paginationDragKey = key;
        state.paginationDropKey = key;
        state.paginationDropPlacement = 'after';
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', key);
        updatePaginationDragState();
      });

      pagination.addEventListener('dragover', function (event) {
        if (!state.paginationDragKey || !event.dataTransfer) return;

        const dropInfo = getPaginationDropInfo(event.clientX);
        if (!dropInfo) return;

        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
        setPaginationDropState(state.paginationDragKey, dropInfo.key, dropInfo.placement);
      });

      pagination.addEventListener('drop', function (event) {
        if (!state.paginationDragKey || !event.dataTransfer) return;

        const dropInfo = getPaginationDropInfo(event.clientX);
        if (!dropInfo) return;

        event.preventDefault();
        suppressPaginationClick();
        const targetKey = dropInfo.key;
        const sourceKey = state.paginationDragKey;
        clearPaginationDragState();
        reorderItems(sourceKey, targetKey, dropInfo.placement);
      });

      pagination.addEventListener('dragend', function () {
        clearPaginationDragState();
      });
    }

    if (prevButton) {
      prevButton.addEventListener('click', function () {
        setActiveIndex(getActiveIndex() - 1);
      });
    }

    if (nextButton) {
      nextButton.addEventListener('click', function () {
        setActiveIndex(getActiveIndex() + 1);
      });
    }

    if (addFileButton && fileInput) {
      addFileButton.addEventListener('click', function () {
        fileInput.click();
      });
    }

    if (fileInput) {
      fileInput.addEventListener('change', function () {
        const files = fileInput.files;
        if (!files || files.length === 0) return;
        addFileItems(files);
        fileInput.value = '';
      });
    }

    stage.addEventListener('dragenter', function (event) {
      if (!canHandleTransfer(event.dataTransfer)) return;
      event.preventDefault();
      state.dragDepth += 1;
      setDragState(true);
    });

    stage.addEventListener('dragover', function (event) {
      if (!canHandleTransfer(event.dataTransfer)) return;
      event.preventDefault();
      setDragState(true);
    });

    stage.addEventListener('dragleave', function (event) {
      if (!canHandleTransfer(event.dataTransfer)) return;
      event.preventDefault();
      state.dragDepth = Math.max(0, state.dragDepth - 1);
      if (state.dragDepth === 0) {
        setDragState(false);
      }
    });

    stage.addEventListener('drop', function (event) {
      if (!canHandleTransfer(event.dataTransfer)) return;
      event.preventDefault();
      state.dragDepth = 0;
      setDragState(false);
      addFileItems(event.dataTransfer ? event.dataTransfer.files : null);
    });

    window.addEventListener('beforeunload', function () {
      if (state.paginationSuppressClickTimer) {
        window.clearTimeout(state.paginationSuppressClickTimer);
      }
      state.items.forEach(function (item) {
        if (item.objectUrl) {
          URL.revokeObjectURL(item.objectUrl);
        }
      });
    });

    parseExistingItems();

    return {
      root,
      subscribe,
      getState,
      setActiveIndex,
    };
  });
})();
