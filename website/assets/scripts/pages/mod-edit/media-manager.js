/* eslint-env browser */

(function () {
  const runtime = window.OWEditRuntime;
  if (!runtime) return;

  runtime.define('mod-edit-media-manager', function createModEditMediaManager(options) {
    const root = runtime.resolveElement(options && options.root);
    if (!root) return null;

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
        return item.objectUrl || '/assets/images/image-not-found.webp';
      }

      const currentUrl = normalizeUrl(item.url);
      if (currentUrl) return currentUrl;
      if (item.startUrl) return item.startUrl;
      return '/assets/images/image-not-found.webp';
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

      const preview = document.createElement('a');
      preview.className = 'media-item__preview without-caption image-link';
      preview.target = '_blank';
      preview.href = getResolvedUrl(item);

      const backdrop = document.createElement('img');
      backdrop.className = 'media-item__backdrop';
      backdrop.src = getResolvedUrl(item);
      backdrop.alt = '';
      backdrop.setAttribute('aria-hidden', 'true');
      backdrop.dataset.fallbackSrc = '/assets/images/image-not-found.webp';

      const image = document.createElement('img');
      image.className = 'media-item__image';
      image.src = getResolvedUrl(item);
      image.alt = 'Изображение мода';
      image.dataset.fallbackSrc = '/assets/images/image-not-found.webp';

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

    function renderPagination() {
      if (!pagination) return;

      if (footer) {
        footer.hidden = false;
      }
      pagination.replaceChildren();
      pagination.hidden = state.items.length === 0;

      if (state.items.length === 0) {
        return;
      }

      const activeIndex = getActiveIndex();
      const range = getPaginationRange(activeIndex);

      for (let index = range.start; index < range.end; index += 1) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'media-manager__page';
        button.dataset.mediaPage = String(index);
        button.textContent = String(index + 1);
        button.classList.toggle('is-active', index === activeIndex);
        pagination.appendChild(button);
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
              });
            }
            return;
          }

          const url = normalizeUrl(item.url);
          if (url) {
            changes.new.push({
              type: item.type,
              url,
            });
          }
          return;
        }

        const typeChanged = item.type !== item.startType;

        if (typeChanged) {
          const nextChange = { id: item.id };
          nextChange.type = item.type;
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
      return {
        key: data.key || nextKey(data.isNew ? 'new' : 'existing'),
        id: data.id || '',
        type: data.type || 'screenshot',
        startType: data.startType || data.type || 'screenshot',
        source: data.source || 'url',
        startUrl: data.startUrl || '',
        url: data.url || '',
        urlEditable: Boolean(data.urlEditable),
        isNew: Boolean(data.isNew),
        file: data.file || null,
        fileName: data.fileName || '',
        objectUrl: data.objectUrl || '',
        invalidUrl: Boolean(data.invalidUrl),
      };
    }

    function addItem(item, prepend) {
      state.items[prepend ? 'unshift' : 'push'](item);
      insertNode(createMediaItemNode(item), Boolean(prepend));

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

        return createStateItem({
          id: String(node.dataset.id || ''),
          type: logoCheckbox && logoCheckbox.checked ? 'logo' : String(node.dataset.startType || 'screenshot'),
          startType: String(node.dataset.startType || (logoCheckbox && logoCheckbox.checked ? 'logo' : 'screenshot')),
          source: String(node.dataset.source || 'url'),
          startUrl,
          url: startUrl,
          urlEditable: false,
          isNew: false,
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
        const target = event.target instanceof Element ? event.target.closest('[data-media-page]') : null;
        if (!target) return;

        const index = Number.parseInt(target.dataset.mediaPage || '', 10);
        if (!Number.isFinite(index)) return;
        setActiveIndex(index);
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
