/* eslint-env browser */

(function () {
  const { getApiPaths, apiUrl } = window.OWCore;
  const apiPaths = getApiPaths();
  const tagsPath = apiPaths.tag.list.path;

  const containerTags = $('div#tags-edit-selected-tags');
  const searchContainer = $('#tags-edit-search-tags');
  const noGameValues = new Set(['', '0', 'none', 'null', 'undefined']);

  function getNormalizedGameId() {
    const rawGameId = String($('#search-update-input-tags').attr('gameid') || '').trim();
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
      const searchInput = $('#search-update-input-tags');
      const pNoInList = $('p#show-more-count-tags');

      pNoInList.addClass('hiden');
      searchContainer.addClass('hiden');

      const ref = await fetch(buildTagsUrl({ page_size: 30, name: searchInput.val() }), { credentials: 'include' });

      const data = await ref.json().catch(() => ({}));
      const results = Array.isArray(data.results) ? data.results : [];
      const databaseSize = Number(data.database_size);
      searchContainer.html(searchContainer.find('p')[0]);

      results.forEach((t) => {
        const newtag = searchContainer
          .append('<div onclick="TagsSelector.editTag(this)" tagid="' + t.id + '">' + t.name + '</div>')
          .find('div:last');

        const inCont = containerTags.find('[tagid="' + t.id + '"]');
        if (inCont.length > 0 && !inCont.hasClass('none-display')) {
          newtag.addClass('selected-tag');
        }
      });

      function notInList(number) {
        pNoInList.text('И ещё ' + number + ' шт...');
        if (number <= 0) {
          pNoInList.attr('hidden', '');
        } else {
          pNoInList.removeAttr('hidden');
        }
      }

      notInList((Number.isFinite(databaseSize) ? databaseSize : results.length) - results.length);

      pNoInList.removeClass('hiden');
      searchContainer.removeClass('hiden');
    },
    editTag(tag) {
      tag = $(tag);

      const tagName = tag.html();
      const searchedTag = searchContainer.find('[tagid="' + tag.attr('tagid') + '"]');

      if (tag.hasClass('selected-tag') || tag.parent().attr('id') == 'tags-edit-selected-tags') {
        searchedTag.removeClass('selected-tag');

        const inCont = containerTags.find('[tagid="' + tag.attr('tagid') + '"]');
        if (inCont.hasAttr('saved')) {
          inCont.addClass('none-display');
        } else {
          inCont.remove();
        }
      } else {
        searchedTag.addClass('selected-tag');

        if (containerTags.find('[tagid="' + tag.attr('tagid') + '"]').length == 0) {
          containerTags.append(
            '<div tagid="' + tag.attr('tagid') + '" onclick="TagsSelector.editTag(this)">' + tagName + '</div>',
          );
        } else {
          containerTags.find('[tagid="' + tag.attr('tagid') + '"]').removeClass('none-display');
        }
      }

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
        containerTags.append('<div tagid="' + t.id + '" saved onclick="TagsSelector.editTag(this)">' + t.name + '</div>');
      });

      containerTags.parent().parent().trigger('event-height');
    },
    returnSelectedTags() {
      const allTags = Array.from(containerTags.find('[tagid]'));

      const standardTags = allTags.filter((t) => Number($(t).attr('saved')));
      const notStandardTags = allTags.filter((t) => !Number($(t).attr('saved')));

      return {
        standard: standardTags.map((t) => Number($(t).attr('tagid'))),
        standardSelected: standardTags.filter((t) => !$(t).hasClass('none-display')).map((t) => Number($(t).attr('tagid'))),
        standardNotSelected: standardTags.filter((t) => $(t).hasClass('none-display')).map((t) => Number($(t).attr('tagid'))),
        notStandardSelected: notStandardTags.map((t) => Number($(t).attr('tagid'))),
        selected: allTags.filter((t) => !$(t).hasClass('none-display')).map((t) => Number($(t).attr('tagid'))),
      };
    },
  };
})();
