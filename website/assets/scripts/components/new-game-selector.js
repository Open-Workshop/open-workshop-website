(function () {
  const apiPaths = window.OWCore.getApiPaths();
  const listPath = apiPaths.game.list.path;

  window.searchUpdateInput = async function searchUpdateInput() {
    const $popup = $('div.popup-game-select');
    $popup.addClass('reset');

    const query = $('input#search-update-input').val();
    const ref = await fetch(`${window.OWCore.apiUrl(listPath)}?page_size=5&name=${query}`, {
      credentials: 'include',
    });
    const data = await ref.json();

    clearSearchResults();
    noInList(data.database_size - data.results.length);

    data.results.forEach((t) => {
      addNewGameResult(t.name, t.id, t.logo);
    });

    $popup.removeClass('reset');
  };

  function clearSearchResults() {
    $('div#all-games-search-results').empty();
  }

  function noInList(number) {
    const pNoInList = $('p#show-more-count');
    pNoInList.text('И ещё ' + number + ' шт...');

    if (number <= 0) {
      pNoInList.attr('hidden', '');
    } else {
      pNoInList.removeAttr('hidden');
    }
  }

  function addNewGameResult(gameName, gameID, gameLogo) {
    const newDiv = $('<div/>', {
      class: 'in-popup-game-card',
      gameid: gameID,
      style: '--logo-game: url("' + gameLogo + '");',
      onclick: 'gameSelected($(this))',
      title: gameName,
    });

    const newImg = $('<img/>', {
      src: gameLogo,
      alt: 'Лого игры',
      onerror: 'handlerImgErrorLoad(this)',
    });

    const newP = $('<p/>', {
      text: gameName,
    });

    newDiv.append(newImg, newP);
    $('div#all-games-search-results').append(newDiv);
  }

  window.gameSelected = function gameSelected(element) {
    const gameSelectCard = $('div.select-game-menu');

    gameSelectCard.children('p').text(element.children('p').text());
    $('img.game-select-logo').attr('src', element.children('img').attr('src'));
    gameSelectCard.attr('gameid', element.attr('gameid'));

    ['div.select-game-menu', 'div.popup-game-select'].forEach((elementSearchToken) => {
      document.querySelector(elementSearchToken).classList.remove('active');
    });
  };

  window.stateMachineGameSelect = function stateMachineGameSelect() {
    const select = document.querySelector('div.select-game-menu');
    const popup = document.querySelector('div.popup-game-select');

    if (select.classList.contains('active')) {
      select.classList.remove('active');
      popup.classList.remove('active');
    } else {
      select.classList.add('active');
      popup.classList.add('active');
    }
  };

  $(document).ready(function () {
    if (document.getElementById('search-update-input')) {
      window.searchUpdateInput();
    }
  });
})();
