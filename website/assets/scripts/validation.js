// Получаем текущий URL-адрес
let currentUrl = window.location.href;

// Проверяем, содержит ли URL-адрес параметры "page" и "page_size"
if (!currentUrl.includes("page=") || !currentUrl.includes("page_size=") || !currentUrl.includes("name=") || !currentUrl.includes("game=") || !currentUrl.includes("game_select=") || !currentUrl.includes("dependencies=")) {
  function addParam(param) {
    if (currentUrl.includes("?")) {
      return "&"+param;
    } else {
      return "?"+param;
    }
  }

  if (!currentUrl.includes("page=")) {
    currentUrl += addParam("page=1");
  }
  if (!currentUrl.includes("page_size=")) {
    currentUrl += addParam("page_size=30");
  }
  if (!currentUrl.includes("name=")) {
    currentUrl += addParam("name=");
  }
  if (!currentUrl.includes("game=")) {
    currentUrl += addParam("game=");
  }
  if (!currentUrl.includes("game_select=")) {
    currentUrl += addParam("game_select=true");
  }
  if (!currentUrl.includes("dependencies=")) {
    currentUrl += addParam("dependencies=false");
  }

  // Перенаправляем на обновленный URL-адрес
  window.history.pushState('init catalog', 'Open Workshop', currentUrl);
}

let params = OpenWS.urlParams(currentUrl);

const namer = document.getElementById("param-name");
namer.value = OpenWS.getFromDict(params, "name", "");

const pageSizer = document.getElementById("page-size-selector");
pageSizer.value = OpenWS.getFromDict(params, "page_size", "25");

const gameSelectorMode = document.getElementById("game-selector-in-menu-checkbox");
gameSelectorMode.checked = (OpenWS.getFromDict(params, "game_select", false) === "true");

const modDependenceMode = document.getElementById("independence-mods-selector-checkbox");
modDependenceMode.checked = (OpenWS.getFromDict(params, "dependencies", false) === "true");

const gameID = OpenWS.getFromDict(params, "game", "");
if (gameID != "") {
  gameNameSetter(gameID);
}

async function gameNameSetter(gameID) {
  const gameData = await OpenWS.fetchGame(gameID);
  const gameCurrect = document.getElementById("game-selector-in-menu-currect-game");
  if (gameData != null && "name" in gameData) {
    gameCurrect.innerText = gameData.name;
    gameCurrect.title = gameData.name;
  } else {
    gameCurrect.innerText = "Нет информации об игре";
    gameCurrect.title = "На сервере нету информации о выбранной вами игре!";
  }
}
