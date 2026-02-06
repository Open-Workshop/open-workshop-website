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

  const publicTitles = {
    0: 'Доступен всем',
    1: 'Доступен по ссылке',
    2: 'Доступен только владельцам',
  };

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

    initCatalogPreview();
    initPublicToggle();
  });

  function initCatalogPreview() {
    const $cardDescD = $('div.card-description');
    const $shortDescD = $('div[limit=256]').find('textarea.editing');

    const logoHref = $('a.slider__images-item[typecontent="logo"]').attr('href');
    if (logoHref) {
      $('img.card__image').attr('src', logoHref);
    }

    $cardDescD.attr('cashData', $shortDescD.val());
    $cardDescD.html(Formating.syntax2HTML($shortDescD.val()));

    setInterval(function () {
      const dataText = $shortDescD.val();
      if ($cardDescD.attr('cashData') != dataText) {
        $cardDescD.attr('cashData', dataText);
        $cardDescD.html(Formating.syntax2HTML(dataText));
      }
    }, 300);

    let zindex = 1;
    $('div.card-click').on('click', function (e) {
      e.preventDefault();

      let isShowing = false;
      if ($(this).parent().hasClass('show')) {
        isShowing = true;
      }

      if ($('div.cards').hasClass('showing')) {
        $('div.card.show').removeClass('show');

        if (isShowing) {
          $('div.cards').removeClass('showing');
        } else {
          $(this).parent().css({ zIndex: zindex }).addClass('show');
        }

        zindex = zindex + 2;
      } else {
        $('div.cards').addClass('showing');
        $(this).parent().css({ zIndex: zindex }).addClass('show');
        zindex = zindex + 2;
      }

      const id = $(this).parent()[0].id;
      $('#card-flap' + id).css('z-index', zindex + 1);
      $('div.panel').css({ zIndex: zindex + 1 });
    });
  }

  window.cardCancel = function cardCancel(id) {
    document.getElementById(id).classList.remove('show');
  };

  function initPublicToggle() {
    window.toggleNextPublic(false);
  }

  const $fullModDescView = $('article#mod-description');
  const $fullModDescEdit = $('div[limit=10000]#desc-edit');
  const $fullModDescEditArea = $fullModDescEdit.find('textarea.editing');

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
    if (mode) {
      $fullModDescEdit.hide();
      $fullModDescView.show();
      $fullModDescView.html(Formating.syntax2HTML($fullModDescEditArea.val()));
    } else {
      $fullModDescEdit.show();
      $fullModDescView.hide();
    }
  };

  window.toggleHelpMode = function toggleHelpMode(button) {
    if ($fullModDescEditArea.hasAttr('tutorial')) {
      button.removeClass('toggle');
      $fullModDescEditArea.val($fullModDescEditArea.attr('tutorial'));
      $fullModDescEditArea.removeAttr('tutorial');
    } else {
      button.addClass('toggle');
      $fullModDescEditArea.attr('tutorial', $fullModDescEditArea.val());
      $fullModDescEditArea.val('[h1]Гайд По Форматированию![/h1]\n\nФорматирование работает как в [b]полном[/b] описании мода, так и в [i]коротком[/i].\n\nФорматирование поддерживает заголовки от 1 до 6 (от большего к меньшему).\nФорматирование в виде добавления ссылок как вида https://openworkshop.su , так и [url=https://openworkshop.su]текста с гиперссылкой[/url]\n\nТак же можно вставлять ссылки на изображения:\n[img]https://cdn.akamai.steamstatic.com/steam/apps/105600/header.jpg?t=1666290860[/img]\n\nА ещё можно создать список:\n[list]\n[*] Первый пункт\n[*] Второй пункт\n[/list]\n\n[h5]Удачи в разработке![/h5]');
    }

    fullDescUpdate($fullModDescEditArea);
    $fullModDescView.html(Formating.syntax2HTML($fullModDescEdit.find('textarea.editing').val()));
  };

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
    const shortDesc = $('div[limit=256] textarea.editing');
    const fullDesc = $('div[limit=10000] textarea.editing');
    const pub = $('button.public-mod-toggle');

    return {
      mod_name: diff(title.val(), title.attr('startdata')),
      mod_short_description: diff(shortDesc.val(), shortDesc.attr('startdata')),
      mod_description: diff(fullDesc.hasAttr('tutorial') ? fullDesc.attr('tutorial') : fullDesc.val(), fullDesc.attr('startdata')),
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
    const box = $('ul.js__slider__images.slider__images');
    const res = { new: [], changed: [], deleted: [] };

    box.find('a').each(function () {
      const el = $(this);
      if (el.attr('idimg')?.startsWith('new-screenshot-')) {
        res.new.push({ type: el.attr('typecontent'), url: el.attr('href') });
        return;
      }
      if (el.hasClass('deleted-user-screenshot')) {
        res.deleted.push(el.attr('idimg'));
        return;
      }
      if (el.attr('starthref') != el.attr('href') || el.attr('starttypecontent') != el.attr('typecontent')) {
        const c = { id: el.attr('idimg') };
        if (el.attr('starthref') != el.attr('href')) c.url = el.attr('href');
        if (el.attr('starttypecontent') != el.attr('typecontent')) c.type = el.attr('typecontent');
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
      fd.append('resource_url', l.url);
      fd.append('resource_owner_id', modID);
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
