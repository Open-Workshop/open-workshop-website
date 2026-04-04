(function () {
  function appendCurrentQuery(link, extraQuery) {
    if (!(link instanceof HTMLAnchorElement)) return;

    const url = new URL(link.href, window.location.origin);
    const currentParams = new URLSearchParams(window.location.search);
    const extraParams = new URLSearchParams(extraQuery || '');

    currentParams.forEach(function (value, key) {
      url.searchParams.set(key, value);
    });
    extraParams.forEach(function (value, key) {
      url.searchParams.set(key, value);
    });

    link.href = url.toString();
  }

  function initModPage() {
    const description = document.getElementById('mod-description');
    if (description) {
      Formating.renderInto(description, description.innerHTML);
    }

    const currentParams = new URLSearchParams(window.location.search);
    const dependencyLinks = document.querySelectorAll('.right-bar a.element[href]');
    dependencyLinks.forEach(function (link) {
      appendCurrentQuery(link);
    });

    currentParams.delete('game');
    currentParams.delete('game_select');
    currentParams.delete('sgame');

    const gameLabel = document.getElementById('mod-for-game-label');
    if (gameLabel) {
      appendCurrentQuery(gameLabel, currentParams.toString());
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initModPage);
  } else {
    initModPage();
  }
})();
