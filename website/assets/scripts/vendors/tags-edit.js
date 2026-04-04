/* eslint-env browser */

(function () {
  const { getApiPaths, apiUrl } = window.OWCore;
  const apiPaths = getApiPaths();
  const tagsPath = apiPaths.tag.list.path;

  const containerTags = $('div#tags-edit-selected-tags');
  const searchContainer = $('#tags-edit-search-tags');
  const showMoreCounter = $('p#show-more-count-tags');
  const noGameValues = new Set(['', '0', 'none', 'null', 'undefined']);
  let pendingCreateCounter = 0;

  function showToast(title, text, theme = 'info') {
    if (typeof window.Toast !== 'function') return;

    new Toast({
      title,
      text,
      theme,
      autohide: true,
      interval: 5000,
    });
  }

  function getSearchInput() {
    return $('#search-update-input-tags');
  }

  function normalizeTagName(value) {
    return String(value || '').trim().replace(/\s+/g, ' ');
  }

  function getTagNameKey(value) {
    return normalizeTagName(value).toLocaleLowerCase('ru-RU');
  }

  function getTagName(node) {
    const tag = $(node);
    return normalizeTagName(tag.attr('data-tag-name') || tag.text());
  }

  function getTagId(node) {
    return String($(node).attr('tagid') || '');
  }

  function isPendingTag(node) {
    return $(node).attr('data-pending-create') === 'true';
  }

  function isTagVisible(node) {
    return !$(node).hasClass('none-display');
  }

  function parseNumericId(value) {
    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? numericValue : null;
  }

  function createTagElement(tagId, tagName, options = {}) {
    const {
      saved = false,
      selected = false,
      pendingCreate = false,
    } = options;

    const element = $('<div></div>');
    element.addClass('taglike-item');
    element.attr('tagid', String(tagId));
    element.attr('data-tag-name', tagName);
    element.attr('onclick', 'TagsSelector.editTag(this)');
    element.text(tagName);

    if (saved) {
      element.attr('saved', '');
    }

    if (selected) {
      element.addClass('selected-tag');
    }

    if (pendingCreate) {
      element.attr('data-pending-create', 'true');
    }

    return element;
  }

  function resetSearchContainer() {
    const emptyState = searchContainer.find('p').first().detach();
    searchContainer.empty().append(emptyState);
    return emptyState;
  }

  function updateShowMoreCount(number) {
    showMoreCounter.text('И ещё ' + number + ' шт...');
    if (number <= 0) {
      showMoreCounter.attr('hidden', '');
    } else {
      showMoreCounter.removeAttr('hidden');
    }
  }

  function getPendingSelectedTags() {
    return Array.from(containerTags.find('[data-pending-create="true"]')).filter(isTagVisible);
  }

  function syncPendingTagsToSearch(query) {
    const existingIds = new Set(
      Array.from(searchContainer.find('[tagid]')).map((node) => getTagId(node)),
    );

    getPendingSelectedTags().forEach((node) => {
      const tagName = getTagName(node);
      if (query !== '' && !getTagNameKey(tagName).includes(query)) {
        return;
      }

      const tagId = getTagId(node);
      if (!existingIds.has(tagId)) {
        searchContainer.append(
          createTagElement(tagId, tagName, {
            selected: true,
            pendingCreate: true,
          }),
        );
      } else {
        searchContainer.find('[tagid="' + tagId + '"]').addClass('selected-tag');
      }
    });
  }

  function updateSearchEmptyState() {
    const emptyState = searchContainer.find('p').first();
    if (emptyState.length === 0) return;
    emptyState.text('Не найдено');
  }

  function findSelectedTagByName(nameKey) {
    return containerTags.find('[tagid]').filter(function () {
      return getTagNameKey(getTagName(this)) === nameKey;
    }).first();
  }

  function findSearchTagByName(nameKey) {
    return searchContainer.find('[tagid]').filter(function () {
      return getTagNameKey(getTagName(this)) === nameKey;
    }).first();
  }

  function getNormalizedGameId() {
    const rawGameId = String(getSearchInput().attr('gameid') || '').trim();
    return noGameValues.has(rawGameId.toLowerCase()) ? '' : rawGameId;
  }

  function buildTagsUrl(params = {}) {
    const query = new URLSearchParams();
    const gameId = getNormalizedGameId();

    if (gameId != '') {
      query.set('game_id', gameId);
    }

    Object.entries(params).forEach(([key, value]) => {
      query.set(key, String(value ?? ''));
    });

    const queryString = query.toString();
    return queryString == '' ? apiUrl(tagsPath) : `${apiUrl(tagsPath)}?${queryString}`;
  }

  window.TagsSelector = {
    async searchRequestTagUpdate() {
      const searchInput = getSearchInput();
      const queryValue = normalizeTagName(searchInput.val());
      const queryKey = getTagNameKey(queryValue);

      showMoreCounter.addClass('hiden');
      searchContainer.addClass('hiden');

      const ref = await fetch(buildTagsUrl({ page_size: 30, name: searchInput.val() }), { credentials: 'include' });

      const data = await ref.json().catch(() => ({}));
      const results = Array.isArray(data.results) ? data.results : [];
      const databaseSize = Number(data.database_size);
      resetSearchContainer();

      results.forEach((t) => {
        const newtag = createTagElement(t.id, normalizeTagName(t.name));
        searchContainer.append(newtag);

        const inCont = containerTags.find('[tagid="' + t.id + '"]');
        if (inCont.length > 0 && !inCont.hasClass('none-display')) {
          newtag.addClass('selected-tag');
        }
      });

      syncPendingTagsToSearch(queryKey);
      updateSearchEmptyState();

      updateShowMoreCount((Number.isFinite(databaseSize) ? databaseSize : results.length) - results.length);

      showMoreCounter.removeClass('hiden');
      searchContainer.removeClass('hiden');
    },
    editTag(tag) {
      tag = $(tag);

      const tagId = getTagId(tag);
      const tagName = getTagName(tag);
      const searchedTag = searchContainer.find('[tagid="' + tagId + '"]');
      const pendingCreate = isPendingTag(tag);

      if (tag.hasClass('selected-tag') || tag.parent().attr('id') === 'tags-edit-selected-tags') {
        searchedTag.removeClass('selected-tag');

        const inCont = containerTags.find('[tagid="' + tagId + '"]');
        if (inCont.hasAttr('saved')) {
          inCont.addClass('none-display');
        } else {
          inCont.remove();
        }
      } else {
        searchedTag.addClass('selected-tag');

        if (containerTags.find('[tagid="' + tagId + '"]').length === 0) {
          containerTags.append(createTagElement(tagId, tagName, { pendingCreate }));
        } else {
          containerTags.find('[tagid="' + tagId + '"]').removeClass('none-display');
        }
      }

      containerTags.parent().parent().trigger('event-height');
    },
    queueCreate() {
      const searchInput = getSearchInput();
      const tagName = normalizeTagName(searchInput.val());
      const tagNameKey = getTagNameKey(tagName);

      if (tagName === '') {
        showToast('Пустое имя', 'Введите название нового тега', 'info');
        return;
      }

      const selectedTag = findSelectedTagByName(tagNameKey);
      if (selectedTag.length > 0) {
        if (isTagVisible(selectedTag[0])) {
          showToast('Уже добавлено', 'Этот тег уже выбран', 'info');
          return;
        }

        selectedTag.removeClass('none-display');
        searchContainer.find('[tagid="' + getTagId(selectedTag[0]) + '"]').addClass('selected-tag');
        containerTags.parent().parent().trigger('event-height');
        return;
      }

      const searchTag = findSearchTagByName(tagNameKey);
      if (searchTag.length > 0) {
        if (!searchTag.hasClass('selected-tag')) {
          window.TagsSelector.editTag(searchTag[0]);
        } else {
          showToast('Уже добавлено', 'Этот тег уже выбран', 'info');
        }
        return;
      }

      pendingCreateCounter += 1;
      const pendingTagId = 'pending-tag-' + pendingCreateCounter;

      containerTags.append(
        createTagElement(pendingTagId, tagName, {
          pendingCreate: true,
        }),
      );

      searchContainer.append(
        createTagElement(pendingTagId, tagName, {
          pendingCreate: true,
          selected: true,
        }),
      );

      containerTags.parent().parent().trigger('event-height');
    },
    unselectAllTags() {
      const allTag = Array.from(containerTags.find('[tagid]'));
      allTag.forEach((t) => {
        TagsSelector.editTag(t);
      });
    },
    async setDefaultSelectedTags(tags) {
      if (tags.length == 0) return;

      const ref = await fetch(buildTagsUrl({ tags_ids: '[' + tags + ']' }), { credentials: 'include' });
      const data = await ref.json().catch(() => ({}));
      const results = Array.isArray(data.results) ? data.results : [];

      results.forEach((t) => {
        containerTags.append(createTagElement(t.id, normalizeTagName(t.name), { saved: true }));
      });

      containerTags.parent().parent().trigger('event-height');
    },
    finalizeCreatedTag(tempId, realId) {
      $('[tagid="' + tempId + '"]').each(function () {
        $(this)
          .attr('tagid', String(realId))
          .removeAttr('data-pending-create');
      });
    },
    returnSelectedTags() {
      const allTags = Array.from(containerTags.find('[tagid]'));

      const pendingTags = allTags.filter((t) => isPendingTag(t));
      const standardTags = allTags.filter((t) => Number($(t).attr('saved')) && !isPendingTag(t));
      const notStandardTags = allTags.filter((t) => !Number($(t).attr('saved')) && !isPendingTag(t));

      return {
        standard: standardTags.map((t) => parseNumericId($(t).attr('tagid'))).filter((id) => id !== null),
        standardSelected: standardTags
          .filter((t) => !$(t).hasClass('none-display'))
          .map((t) => parseNumericId($(t).attr('tagid')))
          .filter((id) => id !== null),
        standardNotSelected: standardTags
          .filter((t) => $(t).hasClass('none-display'))
          .map((t) => parseNumericId($(t).attr('tagid')))
          .filter((id) => id !== null),
        notStandardSelected: notStandardTags
          .map((t) => parseNumericId($(t).attr('tagid')))
          .filter((id) => id !== null),
        pendingCreate: pendingTags
          .filter((t) => !$(t).hasClass('none-display'))
          .map((t) => ({
            tempId: getTagId(t),
            name: getTagName(t),
          })),
        selected: allTags
          .filter((t) => !$(t).hasClass('none-display'))
          .map((t) => parseNumericId($(t).attr('tagid')))
          .filter((id) => id !== null),
      };
    },
  };
})();
