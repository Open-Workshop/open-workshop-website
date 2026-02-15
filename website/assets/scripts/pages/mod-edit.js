(function () {
  const root = document.getElementById('main-mod-edit');
  if (!root) return;

  const modID = parseInt(root.dataset.modId, 10);
  const ow = window.OW || {};
  const apiPaths = window.OWCore.getApiPaths();
  const publicIcons = (ow.assets && ow.assets.icons && ow.assets.icons.public) || {
    0: '/assets/images/svg/white/eye.svg',
    1: '/assets/images/svg/white/link.svg',
    2: '/assets/images/svg/white/lock.svg',
  };
  const stageLabels = {
    uploading: 'Загрузка файла...',
    uploaded: 'Файл загружен',
    repacking: 'Перепаковка файла...',
    packed: 'Ожидание сохранения...',
    downloading: 'Скачивание файла...',
    downloaded: 'Файл скачан',
  };

  const publicTitles = {
    0: 'Доступен всем',
    1: 'Доступен по ссылке',
    2: 'Доступен только владельцам',
  };

  const mediaManagerState = {
    deleted: new Set(),
  };

  function showUploadProgress() {
    const wrap = document.getElementById('mod-upload-progress-wrap');
    if (wrap) wrap.hidden = false;
  }

  function setUploadStatus(text) {
    const el = document.getElementById('mod-upload-status');
    if (el) el.textContent = text || '';
  }

  function setUploadProgress(percent) {
    const el = document.getElementById('mod-upload-progress');
    if (el) el.value = percent || 0;
  }

  function updateStage(stage) {
    if (!stage) return;
    const label = stageLabels[stage] || stage;
    setUploadStatus(label);
  }

  function parseJwt(token) {
    const parts = token.split('.');
    if (parts.length < 2) return null;
    let payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padding = payload.length % 4;
    if (padding) {
      payload += '='.repeat(4 - padding);
    }
    try {
      const decoded = atob(payload);
      return JSON.parse(decoded);
    } catch (err) {
      return null;
    }
  }

  function getWebSocketUrl(baseUrl, path, token) {
    const wsBase = baseUrl.replace(/^http/, 'ws');
    const url = new URL(path, wsBase);
    url.searchParams.set('token', token);
    return url.toString();
  }

  async function fetchModInfo() {
    const baseUrl = window.OWCore.apiUrl(
      window.OWCore.formatPath(apiPaths.mod.info.path, { mod_id: modID }),
    );
    const url = new URL(baseUrl, window.location.origin);
    url.searchParams.set('dates', 'true');
    const resp = await fetch(url.toString(), { credentials: 'include' }).catch(() => null);
    if (!resp || !resp.ok) return null;
    return resp.json().catch(() => null);
  }

  async function startUpdateTransfer(formData) {
    const endpoint = apiPaths.mod.file;
    const url = window.OWCore.apiUrl(window.OWCore.formatPath(endpoint.path, { mod_id: modID }));
    const managerResp = await fetch(url, {
      method: endpoint.method,
      body: formData,
      credentials: 'include',
      headers: {
        'X-Requested-With': 'XMLHttpRequest',
        Accept: 'application/json',
      },
    });

    if (managerResp.ok) {
      const payload = await managerResp.json().catch(() => ({}));
      if (payload && payload.transfer_url) {
        return payload;
      }
      throw new Error('Ответ менеджера некорректен');
    }

    if (managerResp.status === 307 || managerResp.status === 302) {
      const redirectUrl = managerResp.headers.get('Location');
      if (!redirectUrl) {
        throw new Error('Redirect URL не получен');
      }
      return { transfer_url: redirectUrl };
    }

    const text = await managerResp.text();
    throw new Error(text || `Ошибка (${managerResp.status})`);
  }

  function getLogoUrlFromMedia() {
    const items = document.querySelectorAll('.media-item');
    for (const item of items) {
      const typeSelect = item.querySelector('.media-item__type');
      const type = typeSelect ? typeSelect.value : item.dataset.startType;
      if (type !== 'logo') continue;
      const link = item.querySelector('.media-item__preview');
      if (link && link.getAttribute('href')) return link.getAttribute('href');
      const img = item.querySelector('img');
      if (img && img.src) return img.src;
    }
    return null;
  }

  function updateCatalogLogo() {
    const logoHref = getLogoUrlFromMedia();
    if (!logoHref) return;
    $(`img#preview-logo-card-${modID}`).attr('src', logoHref);
  }

  function ensureCatalogPreviewApi() {
    if (window.Catalog) return;

    window.Catalog = {
      masonry: function () {},
      cardShow: function (cardClick) {
        const $cards = $(cardClick).closest('div.cards');
        if (!$cards.length) return;
        $cards.addClass('showing');
        $cards.find('.card').removeClass('show');
        $(cardClick).closest('.card').addClass('show');
      },
      cardsCancel: function () {
        const $cards = $('div.mod-edit__catalog-cards');
        if (!$cards.length) return;
        $cards.removeClass('showing');
        $cards.find('.card').removeClass('show');
      },
    };
  }

  function buildCatalogPreviewCard(shortDescription, titleValue) {
    const cardsContainer = document.querySelector('div.mod-edit__catalog-cards');
    if (!cardsContainer || !window.Cards || typeof window.Cards.create !== 'function') return null;

    ensureCatalogPreviewApi();

    const sizeText = cardsContainer.dataset.modSize || '';
    const gameId = cardsContainer.dataset.gameId || '';
    const doplink = gameId ? `?sgame=no&game=${encodeURIComponent(gameId)}` : '';
    const logoHref = getLogoUrlFromMedia() || '/assets/images/loading.webp';
    const tags = sizeText
      ? [{ text: '📦', description: 'Размер мода', value: sizeText }]
      : [];

    const card = window.Cards.create(
      {
        id: modID,
        name: titleValue || '',
        short_description: shortDescription || '',
        logo: logoHref,
        doplink,
      },
      0,
      true,
      '',
      false,
      tags,
    );

    cardsContainer.innerHTML = '';
    cardsContainer.appendChild(card);
    return card;
  }

  $(document).ready(function () {
    setTimeout(function () {
      $('#main-mod-edit').css('opacity', 1);
    }, 500);

    const startBtn = document.querySelector('#start-page-button');
    if (startBtn && window.Pager) {
      Pager.updateSelect.call(startBtn);
      window.addEventListener('popstate', function () {
        Pager.updateSelect.call(startBtn);
      });
    }

    initMediaManager();
    initDescriptionModules();
    initCatalogPreview();
    initPublicToggle();
    initDeleteModControl();
  });

  function initCatalogPreview() {
    const $shortDescD = $('.mod-edit__content[data-desc-module="catalog"] div[limit=256] textarea.editing').first();
    const $titleInput = $('input.title-mod');
    if (!$shortDescD.length) return;

    const initialShortDesc = $shortDescD.val();
    const initialTitle = $titleInput.length ? $titleInput.val() : '';
    const card = buildCatalogPreviewCard(initialShortDesc, initialTitle);
    if (!card) return;

    const $cardDescD = $(card).find('article').first();
    const $cardTitle = $(card).find(`#titlename${modID}`).first();

    $cardDescD.attr('cashData', initialShortDesc);
    $cardDescD.html(Formating.syntax2HTML(initialShortDesc));
    $cardTitle.attr('cashData', initialTitle);
    $cardTitle.attr('title', initialTitle);
    $cardTitle.text(initialTitle);

    setInterval(function () {
      const dataText = $shortDescD.val();
      if ($cardDescD.attr('cashData') != dataText) {
        $cardDescD.attr('cashData', dataText);
        $cardDescD.html(Formating.syntax2HTML(dataText));
      }

      const nextTitle = $titleInput.length ? $titleInput.val() : '';
      if ($cardTitle.attr('cashData') != nextTitle) {
        $cardTitle.attr('cashData', nextTitle);
        $cardTitle.attr('title', nextTitle);
        $cardTitle.text(nextTitle);
      }
    }, 300);

    updateCatalogLogo();
  }

  function initMediaManager() {
    const manager = document.getElementById('media-manager');
    if (!manager) return;

    const list = manager.querySelector('.media-manager__list');
    const empty = manager.querySelector('[data-media-empty]');
    const countEl = manager.querySelector('[data-media-count]');
    const modeButtons = manager.querySelectorAll('[data-media-mode]');
    const urlRow = manager.querySelector('[data-media-row="url"]');
    const fileRow = manager.querySelector('[data-media-row="file"]');
    const urlInput = manager.querySelector('[data-media-input="url"]');
    const fileInput = manager.querySelector('[data-media-input="file"]');
    const typeInput = manager.querySelector('[data-media-input="type"]');
    const typeFileInput = manager.querySelector('[data-media-input="type-file"]');
    const addUrlButton = manager.querySelector('[data-media-action="add"]');
    const addFileButton = manager.querySelector('[data-media-action="add-file"]');

    if (!list) return;

    let mode = 'url';

    function updateCount() {
      const count = list.querySelectorAll('.media-item').length;
      if (countEl) countEl.textContent = count;
      if (empty) empty.style.display = count ? 'none' : 'flex';
    }

    function setMode(nextMode) {
      mode = nextMode;
      modeButtons.forEach((btn) => {
        btn.classList.toggle('is-active', btn.dataset.mediaMode === mode);
      });
      if (urlRow) urlRow.hidden = mode !== 'url';
      if (fileRow) fileRow.hidden = mode !== 'file';
    }

    function updateBadge(item, type) {
      const badge = item.querySelector('[data-media-badge]');
      if (!badge) return;
      badge.textContent = type === 'logo' ? 'Логотип' : 'Скриншот';
    }

    function enforceSingleLogo(activeSelect) {
      const selects = list.querySelectorAll('.media-item__type');
      selects.forEach((select) => {
        if (select !== activeSelect && select.value === 'logo') {
          select.value = 'screenshot';
          updateBadge(select.closest('.media-item'), 'screenshot');
        }
      });
    }

    function createItem({ url, type, source, file }) {
      const id = `new-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      const previewUrl = url || '/assets/images/image-not-found.webp';
      const item = document.createElement('div');
      item.className = 'media-item';
      item.dataset.id = id;
      item.dataset.startUrl = url || '';
      item.dataset.startType = type;
      item.dataset.source = source;
      item.dataset.new = '1';
      if (source === 'file') item._file = file;

      item.innerHTML = `
        <a href="${previewUrl}" class="media-item__preview without-caption image-link" target="_blank">
          <img src="${previewUrl}" alt="Изображение мода" onerror="this.src='/assets/images/image-not-found.webp'">
          <span class="media-item__badge" data-media-badge></span>
        </a>
        <div class="media-item__meta">
          <div class="media-item__controls">
            <select class="media-item__type">
              <option value="logo">Логотип</option>
              <option value="screenshot">Скриншот</option>
            </select>
            <button class="button-style button-style-small media-item__delete" type="button" data-media-action="delete" title="Удалить изображение">Удалить</button>
          </div>
          <input type="url" class="media-item__url" placeholder="URL изображения">
          <div class="media-item__source ow-muted"></div>
        </div>
      `;

      const typeSelect = item.querySelector('.media-item__type');
      const urlField = item.querySelector('.media-item__url');
      const sourceField = item.querySelector('.media-item__source');
      typeSelect.value = type;
      updateBadge(item, type);

      if (source === 'file') {
        urlField.value = '';
        urlField.placeholder = 'Файл загружен';
        urlField.disabled = true;
        if (sourceField) sourceField.textContent = `Файл: ${file ? file.name : ''}`;
        if (file) {
          const objectUrl = previewUrl;
          item.dataset.objectUrl = objectUrl;
        }
      } else {
        urlField.value = url;
        urlField.disabled = false;
        if (sourceField) sourceField.textContent = 'URL';
      }

      return item;
    }

    modeButtons.forEach((btn) => {
      btn.addEventListener('click', () => setMode(btn.dataset.mediaMode));
    });

    list.addEventListener('change', (event) => {
      const target = event.target;
      if (target.classList.contains('media-item__type')) {
        if (target.value === 'logo') enforceSingleLogo(target);
        updateBadge(target.closest('.media-item'), target.value);
        updateCatalogLogo();
      }
    });

    list.addEventListener('input', (event) => {
      const target = event.target;
      if (target.classList.contains('media-item__url')) {
        const url = target.value.trim();
        const item = target.closest('.media-item');
        const preview = item.querySelector('.media-item__preview');
        const img = item.querySelector('img');
        if (url) {
          if (preview) preview.setAttribute('href', url);
          if (img) img.setAttribute('src', url);
        }
        const typeSelect = item.querySelector('.media-item__type');
        if (typeSelect && typeSelect.value === 'logo') updateCatalogLogo();
      }
    });

    list.addEventListener('click', (event) => {
      const button = event.target.closest('[data-media-action="delete"]');
      if (!button) return;
      const item = button.closest('.media-item');
      if (!item) return;

      if (item.dataset.objectUrl) {
        URL.revokeObjectURL(item.dataset.objectUrl);
      }

      if (item.dataset.new === '1') {
        item.remove();
      } else {
        mediaManagerState.deleted.add(item.dataset.id);
        item.remove();
      }
      updateCount();
      updateCatalogLogo();
    });

    if (addUrlButton) {
      addUrlButton.addEventListener('click', () => {
        const url = urlInput ? urlInput.value.trim() : '';
        if (!url) {
          new Toast({ title: 'Нужна ссылка', text: 'Введите URL изображения', theme: 'info' });
          return;
        }
        const type = typeInput ? typeInput.value : 'screenshot';
        const item = createItem({ url, type, source: 'url' });
        list.prepend(item);
        if (urlInput) urlInput.value = '';
        updateCount();
        updateCatalogLogo();
      });
    }

    if (addFileButton) {
      addFileButton.addEventListener('click', () => {
        const file = fileInput && fileInput.files ? fileInput.files[0] : null;
        if (!file) {
          new Toast({ title: 'Нужен файл', text: 'Выберите изображение', theme: 'info' });
          return;
        }
        const type = typeFileInput ? typeFileInput.value : 'screenshot';
        const objectUrl = URL.createObjectURL(file);
        const item = createItem({ url: objectUrl, type, source: 'file', file });
        list.prepend(item);
        if (fileInput) fileInput.value = '';
        updateCount();
        updateCatalogLogo();
      });
    }

    updateCount();
    setMode(mode);
  }

  function initPublicToggle() {
    window.toggleNextPublic(false);
  }

  function initDescriptionModules() {
    if (!window.OWDescriptionModules) return;
    window.OWDescriptionModules.init({
      moduleKey: 'full',
      limit: 10000,
    });
    window.OWDescriptionModules.init({
      moduleKey: 'catalog',
      limit: 256,
    });
    window.OWDescriptionModules.setView('full', false);
    window.OWDescriptionModules.setView('catalog', false);
  }

  const publicButton = $('button.public-mod-toggle');
  const publicIcon = publicButton.find('img');

  window.toggleNextPublic = function toggleNextPublic(next = true) {
    if (next) {
      publicButton.attr('public-mode', (parseInt(publicButton.attr('public-mode'), 10) + 1) % 3);
    }
    const mode = publicButton.attr('public-mode');
    publicIcon.attr('src', publicIcons[mode]);
    publicButton.attr('title', publicTitles[mode]);
  };

  window.fullEditView = function fullEditView(mode) {
    if (!window.OWDescriptionModules) return;
    window.OWDescriptionModules.setView('full', mode);
  };

  function initDeleteModControl() {
    const confirmInput = document.getElementById('delete-mod-confirm');
    const deleteButton = document.getElementById('delete-mod-button');
    if (!confirmInput || !deleteButton) return;
    const sync = () => {
      deleteButton.disabled = !confirmInput.checked;
    };
    confirmInput.addEventListener('change', sync);
    sync();
  }

  async function send(url, method, body = null) {
    try {
      const res = await fetch(url, { method, body, credentials: 'include' });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw data || 'Ошибка запроса';
      return data;
    } catch (e) {
      new Toast({ title: 'Ошибка', text: e, theme: 'danger' });
      throw e;
    }
  }

  function diff(value, start) {
    return { val: value, changed: value != start };
  }

  function collectModChanges() {
    const title = $('input.title-mod');
    const shortDesc = $('.mod-edit__content[data-desc-module="catalog"] div[limit=256] textarea.editing').first();
    const fullDesc = $('.mod-edit__content[data-desc-module="full"] div[limit=10000] textarea.editing').first();
    const pub = $('button.public-mod-toggle');
    const shortDescValue = window.OWDescriptionModules
      ? window.OWDescriptionModules.getValue('catalog', true)
      : (shortDesc.length ? shortDesc.val() : '');
    const fullDescValue = window.OWDescriptionModules
      ? window.OWDescriptionModules.getValue('full', true)
      : (fullDesc.length ? fullDesc.val() : '');

    return {
      mod_name: diff(title.val(), title.attr('startdata')),
      mod_short_description: diff(shortDescValue, shortDesc.attr('startdata')),
      mod_description: diff(fullDescValue, fullDesc.attr('startdata')),
      mod_public: diff(pub.attr('public-mode'), pub.attr('startdata')),
    };
  }

  function buildFormData(changes) {
    const fd = new FormData();
    for (const [k, v] of Object.entries(changes)) if (v.changed) fd.append(k, v.val);
    return fd;
  }

  async function updateMod(changes) {
    if (!Object.values(changes).some((v) => v.changed)) return;
    const endpoint = apiPaths.mod.edit;
    const url = window.OWCore.apiUrl(window.OWCore.formatPath(endpoint.path, { mod_id: modID }));
    await send(url, endpoint.method, buildFormData(changes));
  }

  function getChangesLogos() {
    const list = document.querySelector('#media-manager .media-manager__list');
    const res = { new: [], changed: [], deleted: Array.from(mediaManagerState.deleted) };
    if (!list) return res;

    list.querySelectorAll('.media-item').forEach((item) => {
      const isNew = item.dataset.new === '1';
      const typeSelect = item.querySelector('.media-item__type');
      const type = typeSelect ? typeSelect.value : item.dataset.startType;

      if (isNew) {
        if (item.dataset.source === 'file') {
          if (item._file) res.new.push({ type, file: item._file });
        } else {
          const urlInput = item.querySelector('.media-item__url');
          const url = urlInput ? urlInput.value.trim() : item.dataset.startUrl;
          if (url) res.new.push({ type, url });
        }
        return;
      }

      const startType = item.dataset.startType;
      const startUrl = item.dataset.startUrl;
      const urlInput = item.querySelector('.media-item__url');
      const currentUrl = urlInput ? urlInput.value.trim() : startUrl;
      const resolvedUrl = currentUrl || startUrl;
      const typeChanged = type && startType && type !== startType;
      const urlChanged = resolvedUrl && startUrl && resolvedUrl !== startUrl;

      if (typeChanged || urlChanged) {
        const c = { id: item.dataset.id };
        if (typeChanged) c.type = type;
        if (urlChanged) c.url = resolvedUrl;
        res.changed.push(c);
      }
    });
    return res;
  }

  async function modUpdateLogos(logos) {
    const addEndpoint = apiPaths.resource.add;
    const editEndpoint = apiPaths.resource.edit;
    const delEndpoint = apiPaths.resource.delete;

    for (const l of logos.new) {
      const fd = new FormData();
      fd.append('owner_type', 'mods');
      fd.append('resource_type', l.type);
      fd.append('resource_owner_id', modID);
      if (l.url) fd.append('resource_url', l.url);
      if (l.file) fd.append('resource_file', l.file);
      await send(window.OWCore.apiUrl(addEndpoint.path), addEndpoint.method, fd);
    }

    for (const l of logos.changed) {
      const fd = new FormData();
      if (l.type) fd.append('resource_type', l.type);
      if (l.url) fd.append('resource_url', l.url);
      const url = window.OWCore.apiUrl(
        window.OWCore.formatPath(editEndpoint.path, { resource_id: l.id }),
      );
      await send(url, editEndpoint.method, fd);
    }

    for (const id of logos.deleted) {
      const url = window.OWCore.apiUrl(
        window.OWCore.formatPath(delEndpoint.path, { resource_id: id }),
      );
      await send(url, delEndpoint.method);
    }
  }

  window.uploadModVersion = async function uploadModVersion() {
    const input = document.getElementById('mod-file-input');
    if (!input || !input.files || !input.files[0]) {
      new Toast({ title: 'Файл не выбран', text: 'Выберите архив мода', theme: 'info' });
      return;
    }
    const file = input.files[0];

    showUploadProgress();
    setUploadProgress(0);
    updateStage('uploading');

    const prevInfo = await fetchModInfo();
    const prevDate = prevInfo && prevInfo.result ? prevInfo.result.date_update_file : null;

    const formData = new FormData();
    formData.append('pack_format', 'zip');
    formData.append('pack_level', '3');

    let transfer;
    try {
      transfer = await startUpdateTransfer(formData);
    } catch (err) {
      new Toast({ title: 'Ошибка', text: err.message || err, theme: 'danger' });
      setUploadStatus('Ошибка получения ссылки');
      return;
    }

    const uploadUrl = transfer.transfer_url;
    if (!uploadUrl) {
      new Toast({ title: 'Ошибка', text: 'Не удалось получить ссылку загрузки', theme: 'danger' });
      setUploadStatus('Ошибка получения ссылки');
      return;
    }

    const parsedUpload = new URL(uploadUrl);
    if (file && file.name) {
      parsedUpload.searchParams.set('filename', file.name);
    }
    const token = parsedUpload.searchParams.get('token');
    const tokenPayload = token ? parseJwt(token) : null;
    const jobId = transfer.job_id || (tokenPayload ? tokenPayload.job_id : null);
    const rawWsUrl =
      transfer.ws_url ||
      (jobId && token ? getWebSocketUrl(parsedUpload.origin, `/transfer/ws/${jobId}`, token) : null);
    const wsUrl = rawWsUrl ? rawWsUrl.replace(/^http/, 'ws') : null;

    let finalizeStarted = false;
    const finalizeStart = Date.now();
    const maxFinalizeMs = 20 * 60 * 1000;

    function startFinalizePoll() {
      if (finalizeStarted) return;
      finalizeStarted = true;
      setUploadProgress(100);
      updateStage('packed');

      const poll = async () => {
        if (Date.now() - finalizeStart > maxFinalizeMs) {
          setUploadStatus('Обработка занимает слишком долго');
          new Toast({
            title: 'Обработка занимает слишком долго',
            text: 'Попробуйте обновить страницу через несколько минут.',
            theme: 'warning',
            autohide: true,
            interval: 6000,
          });
          return;
        }
        const info = await fetchModInfo();
        const nextDate = info && info.result ? info.result.date_update_file : null;
        if (nextDate && nextDate !== prevDate) {
          setUploadStatus('Новая версия сохранена');
          new Toast({ title: 'Готово', text: 'Новая версия загружена', theme: 'success' });
          location.reload();
          return;
        }
        setTimeout(poll, 3000);
      };

      poll();
    }

    if (wsUrl) {
      try {
        const ws = new WebSocket(wsUrl);
        ws.onmessage = (event) => {
          let data = null;
          try {
            data = JSON.parse(event.data);
          } catch (e) {
            return;
          }
          if (data.event === 'stage') {
            updateStage(data.stage);
          }
          if (data.event === 'progress') {
            if (data.total) {
              const percent = Math.min(100, Math.round((data.bytes / data.total) * 100));
              setUploadProgress(percent);
            }
            if (data.stage) updateStage(data.stage);
          }
          if (data.event === 'complete') {
            startFinalizePoll();
          }
          if (data.event === 'error') {
            setUploadStatus('Ошибка загрузки');
            new Toast({ title: 'Ошибка', text: data.message || 'Ошибка загрузки', theme: 'danger' });
          }
        };
      } catch (e) {
        // WS is optional
      }
    }

    try {
      const resp = await fetch(parsedUpload.toString(), {
        method: 'POST',
        body: file,
        headers: {
          'Content-Type': 'application/octet-stream',
        },
        credentials: 'omit',
      });
      if (!resp.ok) {
        const text = await resp.text();
        throw new Error(text || `Ошибка (${resp.status})`);
      }
      startFinalizePoll();
    } catch (err) {
      new Toast({ title: 'Ошибка', text: err.message || err, theme: 'danger' });
      setUploadStatus('Ошибка загрузки');
    }
  };

  window.deleteMod = async function deleteMod() {
    const confirmInput = document.getElementById('delete-mod-confirm');
    if (confirmInput && !confirmInput.checked) return;
    if (!confirm('Удалить мод без возможности восстановления?')) return;
    const endpoint = apiPaths.mod.delete;
    const url = window.OWCore.apiUrl(endpoint.path);
    const body = new URLSearchParams({ mod_id: String(modID) });
    await send(url, endpoint.method, body);
    new Toast({ title: 'Удалено', text: 'Мод удален', theme: 'success' });
    location.href = '/';
  };

  function getChangesTags() {
    const box = $('div#tags-edit-selected-tags');
    const res = { new: [], deleted: [] };

    box.find('div').each(function () {
      const el = $(this);
      if (el.hasAttr('saved')) {
        if (el.hasClass('none-display')) res.deleted.push(el.attr('tagid'));
      } else {
        res.new.push(el.attr('tagid'));
      }
    });
    return res;
  }

  async function modUpdateTags(tags) {
    const addEndpoint = apiPaths.mod.tags_add;
    const delEndpoint = apiPaths.mod.tags_delete;
    for (const id of tags.new) {
      const url = window.OWCore.apiUrl(
        window.OWCore.formatPath(addEndpoint.path, { mod_id: modID, tag_id: id }),
      );
      await send(url, addEndpoint.method);
    }
    for (const id of tags.deleted) {
      const url = window.OWCore.apiUrl(
        window.OWCore.formatPath(delEndpoint.path, { mod_id: modID, tag_id: id }),
      );
      await send(url, delEndpoint.method);
    }
  }

  function getChangesDependence() {
    const box = $('#mod-dependence-selected');
    const res = { new: [], deleted: [] };

    box.find('div.mod-dependence').each(function () {
      const el = $(this);
      if (el.hasAttr('saved')) {
        if (el.hasClass('none-display')) res.deleted.push(el.attr('modid'));
      } else {
        res.new.push(el.attr('modid'));
      }
    });
    return res;
  }

  async function modUpdateDependecie(dep) {
    const addEndpoint = apiPaths.mod.dependencies_add;
    const delEndpoint = apiPaths.mod.dependencies_delete;
    for (const id of dep.new) {
      const url = window.OWCore.apiUrl(
        window.OWCore.formatPath(addEndpoint.path, { mod_id: modID, dependencie_id: id }),
      );
      await send(url, addEndpoint.method);
    }
    for (const id of dep.deleted) {
      const url = window.OWCore.apiUrl(
        window.OWCore.formatPath(delEndpoint.path, { mod_id: modID, dependencie_id: id }),
      );
      await send(url, delEndpoint.method);
    }
  }

  window.saveChanges = async function saveChanges() {
    const base = collectModChanges();
    const logos = getChangesLogos();
    const tags = getChangesTags();
    const deps = getChangesDependence();

    const has =
      Object.values(base).some((v) => v.changed) ||
      logos.new.length ||
      logos.changed.length ||
      logos.deleted.length ||
      tags.new.length ||
      tags.deleted.length ||
      deps.new.length ||
      deps.deleted.length;

    if (!has) {
      new Toast({ title: 'Нечего сохранять', text: 'Нет изменений', theme: 'info' });
      return;
    }

    await updateMod(base);
    if (logos.new.length || logos.changed.length || logos.deleted.length) await modUpdateLogos(logos);
    if (tags.new.length || tags.deleted.length) await modUpdateTags(tags);
    if (deps.new.length || deps.deleted.length) await modUpdateDependecie(deps);

    new Toast({ title: 'Готово', text: 'Изменения сохранены', theme: 'success' });
    location.reload();
  };
})();
