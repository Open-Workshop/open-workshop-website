(function () {
  const root = document.querySelector('main.user-rating-history');
  if (!root || !window.OWCore || typeof window.OWCore.request !== 'function') {
    return;
  }

  const apiPaths = typeof window.OWCore.getApiPaths === 'function'
    ? window.OWCore.getApiPaths()
    : {};
  const userId = Number(root.dataset.userId || 0);
  const pageSize = Math.max(1, Number(root.dataset.ratingHistoryPageSize || 50) || 50);
  const table = root.querySelector('[data-rating-history-table]');
  const itemsRoot = root.querySelector('[data-rating-history-items]');
  const emptyState = root.querySelector('[data-rating-history-empty]');
  const statusNode = root.querySelector('[data-rating-history-status]');
  const totalNode = root.querySelector('[data-rating-history-total]');

  if (!table || !itemsRoot || !emptyState || !statusNode || !totalNode) {
    return;
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

  function setStatus(text, isError) {
    if (!statusNode) return;
    statusNode.textContent = text;
    statusNode.hidden = false;
    statusNode.classList.toggle('user-rating-history__loading--error', Boolean(isError));
  }

  function hideStatus() {
    if (!statusNode) return;
    statusNode.hidden = true;
    statusNode.classList.remove('user-rating-history__loading--error');
  }

  function setTotal(total) {
    if (!totalNode) return;
    totalNode.textContent = String(total);
    totalNode.hidden = false;
  }

  function clearNode(node) {
    if (!node) return;
    while (node.firstChild) {
      node.removeChild(node.firstChild);
    }
  }

  function formatSignedNumber(value, fractionDigits) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      return '—';
    }

    const rounded = fractionDigits > 0 ? numeric.toFixed(fractionDigits) : String(Math.trunc(numeric));
    return numeric > 0 ? `+${rounded}` : rounded;
  }

  function formatDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return String(value || '—');
    }

    return new Intl.DateTimeFormat('ru-RU', {
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(date);
  }

  function getSignClass(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric === 0) {
      return 'neutral';
    }
    return numeric > 0 ? 'positive' : 'negative';
  }

  function getTargetTypeLabel(value) {
    if (value === 'mod') return 'Мод';
    if (value === 'profile') return 'Профиль';
    return value ? String(value) : 'Цель';
  }

  function getTargetHref(item) {
    const targetType = String(item && item.target_type || '');
    const targetId = Number(item && item.target_id || 0);

    if (targetType === 'mod' && targetId > 0) {
      return `/mod/${targetId}`;
    }

    if (targetType === 'profile' && targetId > 0) {
      return `/user/${targetId}`;
    }

    return '';
  }

  function createTextCell(text, className) {
    const cell = document.createElement('td');
    if (className) {
      cell.className = className;
    }
    cell.textContent = text;
    return cell;
  }

  function createTargetCell(item) {
    const cell = document.createElement('td');
    const href = getTargetHref(item);
    const targetType = String(item && item.target_type || '');
    const targetName = String(item && item.target_name || 'Без названия');

    const content = href ? document.createElement('a') : document.createElement('span');
    if (href) {
      content.href = href;
    }
    content.className = 'user-rating-history__target';
    content.setAttribute('translate', 'no');

    const typeBadge = document.createElement('span');
    typeBadge.className = `user-rating-history__type user-rating-history__type--${targetType || 'unknown'}`;
    typeBadge.textContent = getTargetTypeLabel(targetType);

    const name = document.createElement('span');
    name.className = 'user-rating-history__name';
    name.textContent = targetName;
    name.setAttribute('translate', 'no');

    content.append(typeBadge, name);
    cell.appendChild(content);
    return cell;
  }

  function createDateCell(value) {
    const cell = document.createElement('td');
    cell.className = 'user-rating-history__date-cell';

    const time = document.createElement('time');
    time.className = 'tag-link user-rating-history__time';
    time.dateTime = String(value || '');
    time.title = String(value || '');
    time.textContent = formatDate(value);
    time.setAttribute('translate', 'no');

    cell.appendChild(time);
    return cell;
  }

  function createHistoryRow(item) {
    const row = document.createElement('tr');
    const voteValue = Number(item && item.value);
    const voteSign = getSignClass(voteValue);

    row.className = `user-rating-history__row user-rating-history__row--${voteSign}`;

    row.appendChild(createTargetCell(item));
    row.appendChild(createTextCell(formatSignedNumber(voteValue, 0), `user-rating-history__value user-rating-history__value--${voteSign}`));
    row.appendChild(createDateCell(item && item.created_at));

    return row;
  }

  function renderHistory(payload) {
    const items = Array.isArray(payload && payload.items) ? payload.items : [];
    const pagination = payload && payload.pagination && typeof payload.pagination === 'object'
      ? payload.pagination
      : {};
    const total = Number.isFinite(Number(pagination.total))
      ? Number(pagination.total)
      : items.length;

    clearNode(itemsRoot);
    setTotal(total);

    if (!items.length) {
      if (table) table.hidden = true;
      if (emptyState) emptyState.hidden = false;
      hideStatus();
      return;
    }

    items.forEach(function (item) {
      itemsRoot.appendChild(createHistoryRow(item));
    });

    if (table) table.hidden = false;
    if (emptyState) emptyState.hidden = true;
    hideStatus();
  }

  async function loadHistory() {
    const endpoint = apiPaths.profile && apiPaths.profile.rating_history;
    if (!endpoint) {
      setStatus('Не удалось определить endpoint истории голосов', true);
      if (table) table.hidden = true;
      if (emptyState) emptyState.hidden = true;
      return;
    }

    if (!userId) {
      setStatus('Некорректный идентификатор профиля', true);
      if (table) table.hidden = true;
      if (emptyState) emptyState.hidden = true;
      return;
    }

    setStatus('Загружаем историю голосов…', false);

    try {
      const url = new URL(window.OWCore.apiUrl(window.OWCore.formatPath(endpoint.path, { user_id: userId })));
      url.searchParams.set('page_size', String(pageSize));

      const result = await window.OWCore.request(url.toString(), {
        method: endpoint.method || 'GET',
        credentials: 'include',
        parseAs: 'json',
      });

      if (!result.ok) {
        throw new Error(extractApiMessage(result, 'Не удалось загрузить историю голосов'));
      }

      renderHistory(result.data || {});
    } catch (error) {
      if (table) table.hidden = true;
      if (emptyState) emptyState.hidden = true;
      setStatus((error && error.message) ? error.message : 'Не удалось загрузить историю голосов', true);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadHistory, { once: true });
  } else {
    loadHistory();
  }
})();
