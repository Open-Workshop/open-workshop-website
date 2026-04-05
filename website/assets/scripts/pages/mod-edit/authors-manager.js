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
    const emptyNode = root.querySelector('[data-authors-empty]');
    const countNode = root.querySelector('[data-authors-count]');
    const input = root.querySelector('[data-authors-input]');
    const addButton = root.querySelector('[data-action="authors-add"]');
    if (!list || !emptyNode || !(input instanceof HTMLInputElement) || !(addButton instanceof HTMLButtonElement)) {
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

    function syncIndicators() {
      if (countNode) {
        countNode.textContent = `${state.authors.length} шт`;
      }
      emptyNode.hidden = state.authors.length > 0;
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
      const authorId = parseAuthorId(input.value);
      if (authorId == null) {
        runtime.showToast('Нужен ID', 'Введите ID пользователя или ссылку вида /user/123', 'info');
        return;
      }
      if (!Number.isInteger(authorId) || authorId <= 0) {
        runtime.showToast('Некорректный ID', 'Укажите числовой ID пользователя', 'warning');
        return;
      }
      if (state.authors.some(function (author) { return author.id === authorId; })) {
        runtime.showToast('Уже добавлен', 'Этот пользователь уже есть в списке авторов', 'info');
        return;
      }
      if (!api || typeof api.fetchProfile !== 'function') {
        runtime.showToast('Ошибка', 'API профилей недоступен', 'danger');
        return;
      }
      if (state.addInProgress) return;

      state.addInProgress = true;
      input.disabled = true;
      runtime.setButtonBusy(addButton, true);

      try {
        const profile = await api.fetchProfile(authorId);
        if (addAuthor(profile)) {
          input.value = '';
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
      if (event.key !== 'Enter') return;
      event.preventDefault();
      addAuthorFromInput();
    });

    render();

    return {
      getState,
      addAuthorFromInput,
      setOwner,
      removeAuthor,
    };
  });
})();
