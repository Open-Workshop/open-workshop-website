(function () {
  function parseVariants(rawValue) {
    return String(rawValue || '')
      .split(',')
      .map(function (item) { return item.trim(); })
      .filter(Boolean);
  }

  function fadeOutPage(element) {
    if (!(element instanceof HTMLElement)) return;
    element.style.opacity = '0';
    window.setTimeout(function () {
      element.hidden = true;
      element.style.display = 'none';
    }, 100);
  }

  function showPage(element) {
    if (!(element instanceof HTMLElement)) return;
    window.setTimeout(function () {
      element.hidden = false;
      element.style.display = '';
      element.style.opacity = '0';
      window.setTimeout(function () {
        element.style.opacity = '1';
      }, 200);
    }, 100);
  }

  function pageSelect(button, pageName) {
    const pager = button.parentElement;
    if (!pager) return;

    const pages = parseVariants(pager.getAttribute('variants'));
    const resolvedPage = pages.includes(pageName) ? pageName : pages[0];

    pages.forEach(function (page) {
      const currentPage = document.getElementById('page-' + page);
      if (!currentPage) return;

      if (page === resolvedPage) {
        showPage(currentPage);
      } else {
        fadeOutPage(currentPage);
      }
    });
  }

  window.Pager = {
    updateSelect: function () {
      const button = this instanceof Element ? this : null;
      if (!button) return;

      const page = URLManager.getParams().get('page', '');
      pageSelect(button, page);

      const variants = parseVariants(button.getAttribute('active-in-variant'));
      const disabledVariants = parseVariants(button.getAttribute('disabled-in-variant'));

      variants.forEach(function (variant) {
        const target = document.getElementById(variant);
        if (target) target.removeAttribute('disabled');
      });
      disabledVariants.forEach(function (variant) {
        const target = document.getElementById(variant);
        if (target) target.setAttribute('disabled', 'true');
      });
    },
    change: function (button) {
      const current = URLManager.getParams().get('page', '');
      const target = button instanceof Element ? button.getAttribute('variant') : '';

      if (current !== target) {
        URLManager.updateParam('page', target);
        window.Pager.updateSelect.call(button);
      }
    },
  };

  document.addEventListener('click', function (event) {
    const button = event.target instanceof Element ? event.target.closest('[data-action="pager-change"]') : null;
    if (!button) return;
    window.Pager.change(button);
  });
})();
