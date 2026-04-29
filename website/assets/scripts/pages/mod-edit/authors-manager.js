/* eslint-env browser */

(function () {
  const runtime = window.OWEditRuntime;
  const core = window.OWCore;
  if (!runtime || !core) return;

  function parseAuthors(value) {
    if (!value) return [];

    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      return [];
    }
  }

  function getDisplayName(author) {
    const username = String(author && author.username ? author.username : '').trim();
    const userId = Number(author && author.id);
    if (username !== '') return username;
    if (Number.isInteger(userId) && userId > 0) return `Пользователь #${userId}`;
    return 'Неизвестный пользователь';
  }

  function normalizeAuthor(author) {
    const userId = Number(author && author.id);
    if (!Number.isInteger(userId) || userId <= 0) return null;

    return {
      id: userId,
      username: getDisplayName(author),
      grade: String(author && author.grade ? author.grade : '').trim(),
      owner: Boolean(author && author.owner),
    };
  }

  function cloneAuthors(items) {
    return items.map(function (item) {
      return {
        id: item.id,
        username: item.username,
        grade: item.grade,
        owner: Boolean(item.owner),
      };
    });
  }

  function ensureSingleOwner(items) {
    const authors = cloneAuthors(items);
    if (authors.length === 0) return authors;

    let hasOwner = false;
    authors.forEach(function (author) {
      if (author.owner && !hasOwner) {
        hasOwner = true;
        return;
      }
      author.owner = false;
    });

    if (!hasOwner) {
      authors[0].owner = true;
    }

    return authors;
  }

  function parseAuthorId(value) {
    const rawValue = String(value || '').trim();
    if (rawValue === '') return null;

    const directMatch = rawValue.match(/^(\d+)$/);
    if (directMatch) {
      return Number(directMatch[1]);
    }

    const userMatch = rawValue.match(/\/user\/(\d+)(?:\/)?$/i);
    if (userMatch) {
      return Number(userMatch[1]);
    }

    const profileMatch = rawValue.match(/\/profiles\/(\d+)(?:\/)?$/i);
    if (profileMatch) {
      return Number(profileMatch[1]);
    }

    return Number.NaN;
  }

  runtime.define('mod-edit-authors-manager', function createModEditAuthorsManager(options) {
    const settings = options || {};
    const root = runtime.resolveElement(settings.root);
    const api = settings.api || null;
    if (!root) return null;

    const list = root.querySelector('[data-authors-list]');
    const listEmptyNode = root.querySelector('[data-authors-list-empty]');
    const countNode = root.querySelector('[data-authors-count]');
    const searchContainer = root.querySelector('[data-authors-search]');
    const input = root.querySelector('[data-authors-input]');
    const suggestionsList = root.querySelector('[data-authors-suggestions]');
    const suggestionsEmpty = root.querySelector('[data-authors-suggestions-empty]');
    const addButton = root.querySelector('[data-action="authors-add"]');
    if (
      !list ||
      !listEmptyNode ||
      !countNode ||
      !searchContainer ||
      !suggestionsList ||
      !suggestionsEmpty ||
      !(input instanceof HTMLInputElement) ||
      !(addButton instanceof HTMLButtonElement)
    ) {
      return null;
    }

    const apiPaths = core.getApiPaths();
    const avatarPath = apiPaths.profile && apiPaths.profile.avatar ? apiPaths.profile.avatar.path : '';
    const initialAuthors = ensureSingleOwner(
      parseAuthors(root.dataset.authors)
        .map(normalizeAuthor)
        .filter(Boolean),
    );

    const state = {
      initialAuthors: cloneAuthors(initialAuthors),
      authors: cloneAuthors(initialAuthors),
      addInProgress: false,
    };
    let searchTimer = 0;
    let searchRequestId = 0;
    let lastSearchQuery = '';
    let lastSearchProfiles = [];

    function buildAvatarUrl(userId) {
      if (!avatarPath) return '/assets/images/no-avatar.jpg';
      return core.apiUrl(core.formatPath(avatarPath, { user_id: userId }));
    }

    function getOwnerId(items) {
      const owner = items.find(function (item) {
        return item.owner;
      });
      return owner ? owner.id : 0;
    }

    function normalizeSearchQuery(value) {
      return String(value || '').trim().replace(/^@+/, '');
    }

    function setDropdownOpen(isOpen) {
      searchContainer.classList.toggle('is-open', Boolean(isOpen));
      input.setAttribute('aria-expanded', Boolean(isOpen) ? 'true' : 'false');
    }

    function setSuggestionsMessage(message) {
      suggestionsList.replaceChildren(suggestionsEmpty);
      suggestionsEmpty.textContent = String(message || 'Введите ник для поиска');
      suggestionsList.classList.add('is-empty');
      setDropdownOpen(true);
    }

    function clearSuggestions() {
      if (searchTimer) {
        window.clearTimeout(searchTimer);
        searchTimer = 0;
      }
      searchRequestId += 1;
      lastSearchQuery = '';
      lastSearchProfiles = [];
      suggestionsList.replaceChildren(suggestionsEmpty);
      suggestionsEmpty.textContent = 'Введите ник для поиска';
      suggestionsList.classList.add('is-empty');
      setDropdownOpen(false);
    }

    function isAuthorSelected(authorId) {
      const nextId = Number(authorId);
      if (!Number.isInteger(nextId) || nextId <= 0) return false;
      return state.authors.some(function (author) {
        return Number(author.id) === nextId;
      });
    }

    function createSuggestionNode(profile) {
      const profileId = Number(profile && profile.id);
      const username = getDisplayName(profile);
      const grade = String(profile && profile.grade ? profile.grade : '').trim();
      const node = document.createElement('div');
      node.className = 'picker-editor__item picker-editor__item--row mod-authors__suggestion';
      node.dataset.authorSuggestionId = String(profileId);
      node.setAttribute('role', 'option');
      node.setAttribute('tabindex', '0');
      node.setAttribute('translate', 'no');

      const avatar = document.createElement('img');
      avatar.className = 'picker-editor__item-media mod-authors__suggestion-avatar';
      avatar.src = buildAvatarUrl(profileId);
      avatar.alt = 'Аватар пользователя';
      avatar.dataset.fallbackSrc = '/assets/images/no-avatar.jpg';
      node.appendChild(avatar);

      const content = document.createElement('div');
      content.className = 'mod-authors__suggestion-content';

      const name = document.createElement('h3');
      name.className = 'picker-editor__item-title';
      name.textContent = username;
      name.setAttribute('translate', 'no');
      content.appendChild(name);

      const meta = document.createElement('div');
      meta.className = 'mod-authors__suggestion-meta';

      const idChip = document.createElement('span');
      idChip.className = 'tag-link mod-authors__meta-chip';
      idChip.textContent = `ID ${profileId}`;
      meta.appendChild(idChip);

      if (grade !== '') {
        const gradeChip = document.createElement('span');
        gradeChip.className = 'tag-link-red mod-authors__grade';
        gradeChip.textContent = grade;
        meta.appendChild(gradeChip);
      }

      content.appendChild(meta);
      node.appendChild(content);

      node.__profile = {
        id: profileId,
        username,
        grade,
        owner: false,
      };

      node.addEventListener('click', function () {
        selectSuggestedAuthor(node.__profile);
      });

      node.addEventListener('keydown', function (event) {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        selectSuggestedAuthor(node.__profile);
      });

      return node;
    }

    function renderSuggestionResults(items) {
      const profiles = Array.isArray(items) ? items : [];
      const visibleProfiles = profiles.filter(function (profile) {
        const profileId = Number(profile && profile.id);
        return Number.isInteger(profileId) && profileId > 0 && !isAuthorSelected(profileId);
      });

      suggestionsList.replaceChildren();
      if (visibleProfiles.length === 0) {
        suggestionsList.appendChild(suggestionsEmpty);
        suggestionsEmpty.textContent = profiles.length > 0 ? 'Пользователь уже добавлен' : 'Ничего не найдено';
        suggestionsList.classList.add('is-empty');
        setDropdownOpen(true);
        return;
      }

      suggestionsList.classList.remove('is-empty');
      visibleProfiles.slice(0, 10).forEach(function (profile) {
        suggestionsList.appendChild(createSuggestionNode(profile));
      });
      setDropdownOpen(true);
    }

    function refreshSuggestionsIfVisible() {
      if (!searchContainer.classList.contains('is-open')) return;

      const query = normalizeSearchQuery(input.value);
      if (query === '') {
        clearSuggestions();
        return;
      }

      scheduleSuggestions();
    }

    async function resolveSearchProfiles(query) {
      if (lastSearchQuery === query && Array.isArray(lastSearchProfiles)) {
        return lastSearchProfiles.slice();
      }

      if (!api || typeof api.searchProfiles !== 'function') {
        return [];
      }

      const profiles = await api.searchProfiles(query);
      lastSearchQuery = query;
      lastSearchProfiles = Array.isArray(profiles) ? profiles.slice() : [];
      return lastSearchProfiles.slice();
    }

    async function updateSuggestions() {
      const query = normalizeSearchQuery(input.value);
      const authorId = parseAuthorId(query);
      if (query === '' || (Number.isInteger(authorId) && authorId > 0)) {
        clearSuggestions();
        return;
      }

      if (!api || typeof api.searchProfiles !== 'function') {
        setSuggestionsMessage('API профилей недоступен');
        return;
      }

      setDropdownOpen(true);
      if (query.length < 2) {
        setSuggestionsMessage('Введите минимум 2 символа');
        return;
      }

      setSuggestionsMessage('Поиск...');
      const requestId = ++searchRequestId;

      try {
        const profiles = await resolveSearchProfiles(query);
        if (requestId !== searchRequestId) return;
        renderSuggestionResults(profiles);
      } catch (error) {
        if (requestId !== searchRequestId) return;
        lastSearchQuery = '';
        lastSearchProfiles = [];
        setSuggestionsMessage('Не удалось загрузить подсказки');
      }
    }

    function scheduleSuggestions() {
      if (searchTimer) {
        window.clearTimeout(searchTimer);
      }

      searchTimer = window.setTimeout(function () {
        updateSuggestions();
      }, 250);
    }

    function selectSuggestedAuthor(profile) {
      if (!profile) return;

      const added = addAuthor(profile);
      if (!added) return;

      input.value = '';
      clearSuggestions();
      input.focus();
    }

    function syncIndicators() {
      if (countNode) {
        countNode.textContent = `${state.authors.length} шт`;
      }
      listEmptyNode.hidden = state.authors.length > 0;
    }

    function createAuthorNode(author) {
      const node = document.createElement('div');
      node.className = 'mod-authors__item element';
      node.dataset.authorId = String(author.id);
      node.classList.toggle('is-owner', author.owner);

      const avatar = document.createElement('img');
      avatar.className = 'mod-authors__avatar';
      avatar.src = buildAvatarUrl(author.id);
      avatar.alt = 'Аватар пользователя';
      avatar.dataset.fallbackSrc = '/assets/images/no-avatar.jpg';

      const content = document.createElement('div');
      content.className = 'mod-authors__content';

      const name = document.createElement('a');
      name.className = 'mod-authors__name';
      name.href = `/user/${author.id}`;
      name.textContent = author.username;
      name.setAttribute('translate', 'no');

      const meta = document.createElement('div');
      meta.className = 'mod-authors__meta';

      const idChip = document.createElement('span');
      idChip.className = 'tag-link mod-authors__meta-chip';
      idChip.textContent = `ID ${author.id}`;
      meta.appendChild(idChip);

      if (author.owner) {
        const ownerChip = document.createElement('span');
        ownerChip.className = 'tag-link-green mod-authors__state-chip';
        ownerChip.textContent = 'Создатель';
        meta.appendChild(ownerChip);
      }

      if (author.grade !== '') {
        const gradeChip = document.createElement('span');
        gradeChip.className = 'tag-link-red mod-authors__grade';
        gradeChip.textContent = author.grade;
        gradeChip.setAttribute('translate', 'no');
        meta.appendChild(gradeChip);
      }

      content.appendChild(name);
      content.appendChild(meta);

      const actions = document.createElement('div');
      actions.className = 'mod-authors__actions';

      const ownerButton = document.createElement('button');
      ownerButton.type = 'button';
      ownerButton.className = `button-style button-style-small dark mod-authors__owner${author.owner ? ' is-active' : ''}`;
      ownerButton.dataset.authorAction = 'owner';
      ownerButton.textContent = 'Владелец';

      const removeButton = document.createElement('button');
      removeButton.type = 'button';
      removeButton.className = 'button-style button-style-small dark mod-authors__remove';
      removeButton.dataset.authorAction = 'remove';
      removeButton.textContent = 'x';
      removeButton.title = 'Убрать автора';
      removeButton.setAttribute('aria-label', 'Убрать автора');
      removeButton.disabled = state.authors.length <= 1;

      actions.appendChild(ownerButton);
      actions.appendChild(removeButton);

      node.appendChild(avatar);
      node.appendChild(content);
      node.appendChild(actions);

      return node;
    }

    function render() {
      list.replaceChildren();
      state.authors.forEach(function (author) {
        list.appendChild(createAuthorNode(author));
      });
      syncIndicators();
      refreshSuggestionsIfVisible();
    }

    function setAuthors(nextAuthors) {
      state.authors = ensureSingleOwner(nextAuthors);
      render();
    }

    function setOwner(authorId) {
      const nextId = Number(authorId);
      if (!Number.isInteger(nextId) || nextId <= 0) return;

      setAuthors(state.authors.map(function (author) {
        return {
          ...author,
          owner: author.id === nextId,
        };
      }));
    }

    function removeAuthor(authorId) {
      const nextId = Number(authorId);
      if (!Number.isInteger(nextId) || nextId <= 0) return;

      if (state.authors.length <= 1) {
        runtime.showToast('Нужен автор', 'У мода должен остаться хотя бы один автор', 'warning');
        return;
      }

      setAuthors(state.authors.filter(function (author) {
        return author.id !== nextId;
      }));
    }

    function addAuthor(author) {
      const normalized = normalizeAuthor(author);
      if (!normalized) {
        throw new Error('Профиль пользователя некорректен');
      }

      if (state.authors.some(function (item) { return item.id === normalized.id; })) {
        runtime.showToast('Уже добавлен', 'Этот пользователь уже есть в списке авторов', 'info');
        return false;
      }

      setAuthors(state.authors.concat([normalized]));
      return true;
    }

    async function addAuthorFromInput() {
      const rawValue = normalizeSearchQuery(input.value);
      if (rawValue === '') {
        runtime.showToast('Нужен ID или ник', 'Введите ID, ник или ссылку вида /user/123', 'info');
        return;
      }

      const authorId = parseAuthorId(rawValue);
      if (Number.isInteger(authorId) && authorId > 0) {
        if (state.authors.some(function (author) { return author.id === authorId; })) {
          runtime.showToast('Уже добавлен', 'Этот пользователь уже есть в списке авторов', 'info');
          return;
        }
        if (!api || typeof api.fetchProfile !== 'function') {
          runtime.showToast('Ошибка', 'API профилей недоступен', 'danger');
          return;
        }
      } else if (!api || typeof api.searchProfiles !== 'function') {
        runtime.showToast('Ошибка', 'API профилей недоступен', 'danger');
        return;
      }

      if (state.addInProgress) return;

      state.addInProgress = true;
      input.disabled = true;
      runtime.setButtonBusy(addButton, true);

      try {
        let profile = null;

        if (Number.isInteger(authorId) && authorId > 0) {
          profile = await api.fetchProfile(authorId);
        } else {
          const profiles = await resolveSearchProfiles(rawValue);
          const normalizedQuery = rawValue.toLowerCase();
          const exact = profiles.find(function (item) {
            return String(item && item.username ? item.username : '').trim().toLowerCase() === normalizedQuery;
          });

          if (exact) {
            profile = exact;
          } else if (profiles.length === 1) {
            profile = profiles[0];
          } else {
            runtime.showToast(
              profiles.length > 1 ? 'Уточните ник' : 'Пользователь не найден',
              profiles.length > 1
                ? 'Выберите пользователя из выпадающего списка'
                : 'Пользователь с таким ником не найден',
              'info',
            );
            return;
          }
        }

        if (profile && addAuthor(profile)) {
          input.value = '';
          clearSuggestions();
        }
      } catch (error) {
        runtime.showError(error, { fallbackText: 'Не удалось добавить автора' });
      } finally {
        state.addInProgress = false;
        input.disabled = false;
        runtime.setButtonBusy(addButton, false);
        input.focus();
      }
    }

    function getChanges() {
      const initialById = new Map();
      const currentById = new Map();

      state.initialAuthors.forEach(function (author) {
        initialById.set(String(author.id), author);
      });
      state.authors.forEach(function (author) {
        currentById.set(String(author.id), author);
      });

      const add = state.authors.filter(function (author) {
        return !initialById.has(String(author.id));
      }).map(function (author) {
        return {
          id: author.id,
          owner: author.owner,
        };
      });

      const remove = state.initialAuthors.filter(function (author) {
        return !currentById.has(String(author.id));
      }).map(function (author) {
        return {
          id: author.id,
          owner: author.owner,
        };
      });

      const initialOwnerId = getOwnerId(state.initialAuthors);
      const currentOwnerId = getOwnerId(state.authors);

      return {
        add,
        remove,
        initialOwnerId,
        currentOwnerId,
        ownerChanged: initialOwnerId !== currentOwnerId,
      };
    }

    function getState() {
      const changes = getChanges();
      return {
        authors: cloneAuthors(state.authors),
        changes,
        hasChanges: changes.add.length > 0 || changes.remove.length > 0 || changes.ownerChanged,
        hasInvalidState: state.authors.length === 0 || !changes.currentOwnerId,
      };
    }

    root.addEventListener('click', function (event) {
      const target = event.target instanceof Element ? event.target : null;
      if (!target) return;

      const addAction = target.closest('[data-action="authors-add"]');
      if (addAction && root.contains(addAction)) {
        addAuthorFromInput();
        return;
      }

      const actionNode = target.closest('[data-author-action]');
      if (!actionNode || !root.contains(actionNode)) return;

      const itemNode = actionNode.closest('[data-author-id]');
      if (!itemNode) return;

      const authorId = Number(itemNode.dataset.authorId || 0);
      const action = actionNode.dataset.authorAction;

      if (action === 'owner') {
        setOwner(authorId);
        return;
      }

      if (action === 'remove') {
        removeAuthor(authorId);
      }
    });

    input.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        clearSuggestions();
        return;
      }

      if (event.key !== 'Enter') return;
      event.preventDefault();
      addAuthorFromInput();
    });

    input.addEventListener('input', function () {
      if (state.addInProgress) return;
      if (normalizeSearchQuery(input.value) === '') {
        clearSuggestions();
        return;
      }
      scheduleSuggestions();
    });

    input.addEventListener('focus', function () {
      if (state.addInProgress) return;
      const query = normalizeSearchQuery(input.value);
      if (query === '') {
        return;
      }
      scheduleSuggestions();
    });

    document.addEventListener('click', function (event) {
      const target = event.target instanceof Element ? event.target : null;
      if (!target) return;
      if (root.contains(target)) return;
      clearSuggestions();
    });

    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') {
        clearSuggestions();
      }
    });

    render();
    clearSuggestions();

    return {
      getState,
      addAuthorFromInput,
      setOwner,
      removeAuthor,
    };
  });
})();
