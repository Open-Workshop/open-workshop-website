/* eslint-env browser */

(function () {
  const { getApiPaths, apiUrl } = window.OWCore;
  const apiPaths = getApiPaths();
  const modsPath = apiPaths.mod.list.path;
  const resourcesPath = apiPaths.resource.list.path;

  const containerDependencies = $('#mod-dependence-selected');
  const searchedDependencies = $('#dependence-edit-search-dependence');

  function getSelectedDependencyIds() {
    return containerDependencies
      .find('div.element:not(.none-display)')
      .map(function () {
        return String($(this).attr('modid'));
      })
      .get()
      .filter((id) => id.length > 0);
  }

  window.editModDependence = function editModDependence(dependenc) {
    dependenc = $(dependenc);

    const dependenceName = dependenc.find('h3').html();
    const dependencId = dependenc.attr('modid');
    const dependencImg = dependenc.find('img[onerror]').attr('src');

    const searchedDependence = searchedDependencies.find('[modid="' + dependencId + '"]');

    if (dependenc.hasClass('dependence-selected') || dependenc.parent().attr('id') == 'mod-dependence-selected') {
      searchedDependence.removeClass('dependence-selected');

      const inCont = containerDependencies.find('[modid="' + dependencId + '"]');
      if (inCont.hasAttr('saved')) {
        inCont.addClass('none-display');
      } else {
        inCont.remove();
      }
    } else {
      searchedDependence.addClass('dependence-selected');

      if (containerDependencies.find('[modid="' + dependencId + '"]').length == 0) {
        const modDependenceE = $('<div>')
          .addClass('element')
          .attr('modid', dependencId)
          .attr('onclick', 'editModDependence(this)');
        const logoE = $('<img>')
          .attr('src', dependencImg)
          .attr('alt', 'Логотип мода')
          .attr('onerror', 'handlerImgErrorLoad(this)');
        const eE = $('<e>');
        const hE = $('<h3>').attr('translate', 'no').text(dependenceName);
        const iconE = $('<img>')
          .attr('src', '/assets/images/removal-triangle.svg')
          .attr('alt', 'Кнопка удаления зависимости');

        eE.append(hE, iconE);
        modDependenceE.append(logoE, eE);
        containerDependencies.append(modDependenceE);
      } else {
        containerDependencies.find('[modid="' + dependencId + '"]').removeClass('none-display');
      }
    }

    containerDependencies.parent().parent().trigger('event-height');
    window.dispatchEvent(
      new CustomEvent('ow:dependencies-changed', {
        detail: { ids: getSelectedDependencyIds() },
      }),
    );
  };

  window.searchRequestDependenceUpdate = async function searchRequestDependenceUpdate() {
    const searchInput = $('#search-update-input-dependence');
    const pNoInList = $('p#show-more-count-dependence');

    pNoInList.addClass('hiden');
    searchedDependencies.addClass('hiden');

    const searchParams = new URLSearchParams({
      page_size: '5',
      name: String(searchInput.val() || ''),
    });
    const gameId = String(searchInput.attr('gameid') || '').trim();
    if (gameId.length > 0 && gameId !== '0') {
      searchParams.set('game', gameId);
    }

    const ref = await fetch(`${apiUrl(modsPath)}?${searchParams.toString()}`, {
      credentials: 'include',
    });
    const data = await ref.json();

    const ids = [];

    searchedDependencies.html(searchedDependencies.find('p')[0]);
    data.results.forEach((t) => {
      ids.push(t.id);

      let classes = 'element';
      if (containerDependencies.find('[modid="' + t.id + '"]').length > 0) {
        classes += ' dependence-selected';
      }

      const $dependenceSelected = $('<div/>', {
        class: classes,
        modid: t.id,
        onclick: 'editModDependence(this)',
        saved: true,
      });
      $dependenceSelected.append(
        $('<img/>', {
          src: '/assets/images/loading.webp',
          alt: 'Логотип мода',
          onerror: 'handlerImgErrorLoad(this)',
        }),
      );
      const $e = $('<e/>');
      $e.append(
        $('<h3/>', {
          translate: 'no',
          title: t.name,
          text: t.name,
        }),
      );
      $dependenceSelected.append($e);
      searchedDependencies.append($dependenceSelected);
    });

    const refImgs = await fetch(
      `${apiUrl(resourcesPath)}?owner_type=mods&owner_ids=[${ids}]&types_resources=["logo"]`,
      { credentials: 'include' },
    );
    const dataImgs = await refImgs.json();

    dataImgs.results.forEach((t) => {
      searchedDependencies.find('[modid="' + t.owner_id + '"]').find('img').attr('src', t.url);
    });
    searchedDependencies.find("img[src='/assets/images/loading.webp']").attr('src', '/assets/images/image-not-found.webp');

    function notInList(number) {
      pNoInList.text('И ещё ' + number + ' шт...');
      if (number <= 0) {
        pNoInList.attr('hidden', '');
      } else {
        pNoInList.removeAttr('hidden');
      }
    }

    notInList(data.database_size - data.results.length);

    pNoInList.removeClass('hiden');
    searchedDependencies.removeClass('hiden');
  };
})();
