/* eslint-env browser */

(function () {
  const runtime = window.OWEditRuntime;
  if (!runtime) return;

  runtime.define('mod-edit-media-manager', function createModEditMediaManager(options) {
    const root = runtime.resolveElement(options && options.root);
    if (!root) return null;

    const list = root.querySelector('.media-manager__list');
    const emptyNode = list ? list.querySelector('[data-media-empty]') : null;
    const countNode = root.querySelector('[data-media-count]');
    const logoStateNode = root.querySelector('[data-media-logo-state]');
    const modeButtons = root.querySelectorAll('[data-media-mode]');
    const urlRow = root.querySelector('[data-media-row="url"]');
    const fileRow = root.querySelector('[data-media-row="file"]');
    const dropzone = root.querySelector('[data-media-dropzone]');
    const urlInput = root.querySelector('[data-media-input="url"]');
    const fileInput = root.querySelector('[data-media-input="file"]');
    const typeInput = root.querySelector('[data-media-input="type"]');
    const typeFileInput = root.querySelector('[data-media-input="type-file"]');
    const addUrlButton = root.querySelector('[data-media-action="add"]');
    const addFileButton = root.querySelector('[data-media-action="add-file"]');

    if (!list || !emptyNode) return null;

    const state = {
      items: [],
      deletedIds: new Set(),
      subscribers: new Set(),
      nextKey: 0,
      mode: 'url',
      storageHost: '',
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

    function isHttpUrl(value) {
      if (!value) return false;
      try {
        const parsed = new URL(value);
        return parsed.protocol === 'http:' || parsed.protocol === 'https:';
      } catch (error) {
        return false;
      }
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

    function getTypeLabel(type) {
      return type === 'logo' ? 'Логотип' : 'Скриншот';
    }

    function getSourceLabel(item) {
      if (item.source === 'file') {
        return `Файл: ${item.fileName || ''}`;
      }
      return item.urlEditable ? 'URL' : 'Storage';
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

    function createMediaTypeSelect(item) {
      const select = document.createElement('select');
      select.className = 'media-item__type';
      select.setAttribute('data-media-role', 'type');

      [
        { value: 'logo', label: 'Логотип' },
        { value: 'screenshot', label: 'Скриншот' },
      ].forEach(function (optionData) {
        const option = document.createElement('option');
        option.value = optionData.value;
        option.textContent = optionData.label;
        if (item.type === optionData.value) {
          option.selected = true;
        }
        select.appendChild(option);
      });

      return select;
    }

    function createMediaItemNode(item) {
      const node = document.createElement('div');
      node.className = 'media-item';
      node.dataset.mediaKey = item.key;

      const preview = document.createElement('a');
      preview.className = 'media-item__preview without-caption image-link';
      preview.target = '_blank';
      preview.href = getResolvedUrl(item);

      const image = document.createElement('img');
      image.src = getResolvedUrl(item);
      image.alt = 'Изображение мода';
      image.dataset.fallbackSrc = '/assets/images/image-not-found.webp';

      const badge = document.createElement('span');
      badge.className = 'media-item__badge';
      badge.setAttribute('data-media-badge', '');
      badge.textContent = getTypeLabel(item.type);

      preview.appendChild(image);
      preview.appendChild(badge);

      const meta = document.createElement('div');
      meta.className = 'media-item__meta';

      const controls = document.createElement('div');
      controls.className = 'media-item__controls';

      const typeSelect = createMediaTypeSelect(item);

      const deleteButton = document.createElement('button');
      deleteButton.className = 'button-style button-style-small media-item__delete';
      deleteButton.type = 'button';
      deleteButton.dataset.mediaAction = 'delete';
      deleteButton.title = 'Удалить изображение';
      deleteButton.textContent = 'Удалить';

      controls.appendChild(typeSelect);
      controls.appendChild(deleteButton);
      meta.appendChild(controls);

      if (item.urlEditable) {
        const itemUrlInput = document.createElement('input');
        itemUrlInput.type = 'url';
        itemUrlInput.className = 'media-item__url';
        itemUrlInput.placeholder = 'URL изображения';
        itemUrlInput.value = item.url;
        itemUrlInput.dataset.mediaRole = 'url';
        itemUrlInput.classList.toggle('is-invalid', Boolean(item.invalidUrl));
        meta.appendChild(itemUrlInput);
      }

      const source = document.createElement('div');
      source.className = 'media-item__source ow-muted';
      source.dataset.mediaRole = 'source';
      source.textContent = getSourceLabel(item);
      meta.appendChild(source);

      node.appendChild(preview);
      node.appendChild(meta);
      return node;
    }

    function syncItemNode(item) {
      const node = findNode(item.key);
      if (!node) return;

      const preview = node.querySelector('.media-item__preview');
      const image = node.querySelector('img');
      const badge = node.querySelector('[data-media-badge]');
      const typeSelect = node.querySelector('.media-item__type');
      const itemUrlInput = node.querySelector('.media-item__url');
      const source = node.querySelector('[data-media-role="source"]');
      const nextUrl = getResolvedUrl(item);

      if (preview) {
        preview.href = nextUrl;
      }
      if (image) {
        image.src = nextUrl;
      }
      if (badge) {
        badge.textContent = getTypeLabel(item.type);
      }
      if (typeSelect) {
        typeSelect.value = item.type;
      }
      if (itemUrlInput) {
        itemUrlInput.value = item.url;
        itemUrlInput.classList.toggle('is-invalid', Boolean(item.invalidUrl));
      }
      if (source) {
        source.textContent = getSourceLabel(item);
      }
    }

    function insertNode(node, prepend) {
      if (prepend) {
        list.insertBefore(node, list.firstChild === emptyNode ? emptyNode : list.firstChild);
        return;
      }
      list.insertBefore(node, emptyNode);
    }

    function updateIndicators() {
      const count = state.items.length;
      if (countNode) {
        countNode.textContent = String(count);
      }

      emptyNode.style.display = count > 0 ? 'none' : 'flex';

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

        const resolvedUrl = item.urlEditable ? (normalizeUrl(item.url) || item.startUrl) : item.startUrl;
        const typeChanged = item.type !== item.startType;
        const urlChanged = item.urlEditable && resolvedUrl !== item.startUrl;

        if (typeChanged || urlChanged) {
          const nextChange = { id: item.id };
          if (typeChanged) {
            nextChange.type = item.type;
          }
          if (urlChanged) {
            nextChange.url = resolvedUrl;
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
      updateIndicators();
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

    function setMode(nextMode) {
      state.mode = nextMode === 'file' ? 'file' : 'url';
      root.dataset.mode = state.mode;

      modeButtons.forEach(function (button) {
        button.classList.toggle('is-active', button.dataset.mediaMode === state.mode);
      });

      if (urlRow) urlRow.hidden = state.mode !== 'url';
      if (fileRow) fileRow.hidden = state.mode !== 'file';
      if (dropzone) dropzone.hidden = state.mode !== 'file';
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
      notify('add');
    }

    function removeItem(item) {
      if (!item) return;

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

      notify('delete');
    }

    function addUrlItem() {
      const rawUrl = normalizeUrl(urlInput ? urlInput.value : '');
      if (!rawUrl) {
        runtime.showToast('Нужна ссылка', 'Введите URL изображения', 'info');
        return;
      }
      if (!isHttpUrl(rawUrl)) {
        if (urlInput) urlInput.classList.add('is-invalid');
        runtime.showToast('Некорректный URL', 'Разрешены только http/https ссылки', 'warning');
        return;
      }

      const item = createStateItem({
        type: typeInput ? typeInput.value : 'screenshot',
        source: 'url',
        url: rawUrl,
        urlEditable: !isStorageUrl(rawUrl),
        isNew: true,
        invalidUrl: false,
      });

      addItem(item, true);

      if (urlInput) {
        urlInput.value = '';
        urlInput.classList.remove('is-invalid');
      }
    }

    function addFileItem(file) {
      if (!file) {
        runtime.showToast('Нужен файл', 'Выберите изображение', 'info');
        return;
      }
      if (!String(file.type || '').startsWith('image/')) {
        runtime.showToast('Неверный формат', 'Можно загружать только изображения', 'warning');
        return;
      }

      const objectUrl = URL.createObjectURL(file);
      const item = createStateItem({
        type: typeFileInput ? typeFileInput.value : 'screenshot',
        source: 'file',
        isNew: true,
        file,
        fileName: file.name,
        objectUrl,
      });

      addItem(item, true);
    }

    function parseExistingItems() {
      const items = Array.from(list.querySelectorAll('.media-item')).map(function (node) {
        const preview = node.querySelector('.media-item__preview');
        const itemUrlInput = node.querySelector('.media-item__url');
        const typeSelect = node.querySelector('.media-item__type');
        const startUrl = normalizeUrl(node.dataset.startUrl || (preview ? preview.getAttribute('href') : ''));

        return createStateItem({
          id: String(node.dataset.id || ''),
          type: typeSelect ? typeSelect.value : String(node.dataset.startType || 'screenshot'),
          startType: String(node.dataset.startType || (typeSelect ? typeSelect.value : 'screenshot')),
          source: String(node.dataset.source || 'url'),
          startUrl,
          url: itemUrlInput ? normalizeUrl(itemUrlInput.value) : startUrl,
          urlEditable: Boolean(itemUrlInput),
          isNew: false,
        });
      });

      state.items = items;
      Array.from(list.querySelectorAll('.media-item')).forEach(function (node) {
        node.remove();
      });
      state.items.forEach(function (item) {
        insertNode(createMediaItemNode(item), false);
      });
      updateIndicators();
    }

    list.addEventListener('change', function (event) {
      const target = event.target;
      if (!(target instanceof Element)) return;

      if (target.classList.contains('media-item__type')) {
        const node = target.closest('[data-media-key]');
        const item = node ? findItem(node.dataset.mediaKey || '') : null;
        if (!item) return;

        item.type = target.value === 'logo' ? 'logo' : 'screenshot';
        if (item.type === 'logo') {
          enforceSingleLogo(item);
        }
        syncItemNode(item);
        notify('type');
      }
    });

    list.addEventListener('input', function (event) {
      const target = event.target;
      if (!(target instanceof HTMLInputElement) || !target.classList.contains('media-item__url')) return;

      const node = target.closest('[data-media-key]');
      const item = node ? findItem(node.dataset.mediaKey || '') : null;
      if (!item) return;

      const value = normalizeUrl(target.value);
      item.url = value;
      item.invalidUrl = value !== '' && !isHttpUrl(value);
      syncItemNode(item);
      notify('url');
    });

    list.addEventListener('click', function (event) {
      const button = event.target instanceof Element ? event.target.closest('[data-media-action="delete"]') : null;
      if (!button) return;

      const node = button.closest('[data-media-key]');
      const item = node ? findItem(node.dataset.mediaKey || '') : null;
      removeItem(item);
    });

    modeButtons.forEach(function (button) {
      button.addEventListener('click', function () {
        setMode(button.dataset.mediaMode);
      });
    });

    if (addUrlButton) {
      addUrlButton.addEventListener('click', addUrlItem);
    }

    if (urlInput) {
      urlInput.addEventListener('keydown', function (event) {
        if (event.key === 'Enter') {
          event.preventDefault();
          addUrlItem();
        }
      });
      urlInput.addEventListener('input', function () {
        const value = normalizeUrl(urlInput.value);
        if (!value || isHttpUrl(value)) {
          urlInput.classList.remove('is-invalid');
        }
      });
    }

    if (addFileButton && fileInput) {
      addFileButton.addEventListener('click', function () {
        fileInput.click();
      });
    }

    if (fileInput) {
      fileInput.addEventListener('change', function () {
        if (state.mode !== 'file') return;
        const file = fileInput.files && fileInput.files[0];
        if (!file) return;
        addFileItem(file);
        fileInput.value = '';
      });
    }

    if (dropzone && fileInput) {
      dropzone.addEventListener('click', function () {
        fileInput.click();
      });
      dropzone.addEventListener('keydown', function (event) {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          fileInput.click();
        }
      });

      ['dragenter', 'dragover'].forEach(function (eventName) {
        dropzone.addEventListener(eventName, function (event) {
          event.preventDefault();
          dropzone.classList.add('is-dragover');
        });
      });

      ['dragleave', 'drop'].forEach(function (eventName) {
        dropzone.addEventListener(eventName, function (event) {
          event.preventDefault();
          dropzone.classList.remove('is-dragover');
        });
      });

      dropzone.addEventListener('drop', function (event) {
        const files = event.dataTransfer ? event.dataTransfer.files : null;
        const file = files && files.length > 0 ? files[0] : null;
        if (file) {
          addFileItem(file);
        }
      });
    }

    window.addEventListener('beforeunload', function () {
      state.items.forEach(function (item) {
        if (item.objectUrl) {
          URL.revokeObjectURL(item.objectUrl);
        }
      });
    });

    parseExistingItems();
    setMode(state.mode);

    return {
      root,
      subscribe,
      getState,
      setMode,
    };
  });
})();
