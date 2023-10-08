
// Форматирование

const steamUrl = /(?:\[url=)(https?:\/\/.*?)(?:\])(.*?)(?:\[\/url\])/ig;
const steamImage = /\[img\](.*?)\[\/img\]/ig;

function urlTextProcess(text) {
    const regex = /(?<!\[url=|\[img\])(https?:\/\/\S+)/ig;
    return text.replace(regex, url => {
        const domain = new URL(url).hostname;
        return `<a class="steam-link" href="${url}">${domain}</a>`;
    });
}

function urlImageProcess(text) {
    return text.replace(steamImage, (match, url) => {
        return `<img class="img-desc" src="${url}"></img>`;
    });
}

function steamSyntax(text, short = false) {
    console.log(text)
    text = text.replace(steamUrl, (match, url, randomText) => {
        return `<a class="steam-link" href="${url}">${randomText}</a>`;
    });

    // Заменим ссылки
    text = text.replace(/\[(.*?)\]\((.*?)\)/g, '<a class="steam-link" href="$2">$1</a>');

    text = text.replace(/(?:\[url=)(.*?)](.*?)(?:\[\/url\])/ig, (match, url, randomText) => {
        console.log(url)
        return `<a class="steam-link" href="https://${url}">${randomText}</a>`;
    });

    // Заменим выделение жирным текстом
    text = text.replace(/\*\*(.*?)\*\*/gs, '<b>$1</b>');

    // Заменим выделение курсивом
    text = text.replace(/\*(.*?)\*/gm, '<i>$1</i>');

    // Заменим список элементов
    text = text.replace(/^\* (.*?)$/gs, '<li>$1</li>');
    text = text.replace(/^(\s*)\* /gs, '$1<ul>');
    text = text.replace(/<\/li>\n(?!<li>)/gs, '</li></ul>');

    // Заменим цитаты
    text = text.replace(/\[quote\](.*?)\[\/quote\]/gs, '<blockquote><div class="light"></div><div class="content">$1</div></blockquote>');

    // Заменим код
    text = text.replace(/`(.+?)`/gs, '<code>$1</code>');


    text = text.replace(/\[(h[1-6])\](.*?)\[\/\1\]/gs, '<$1>$2</$1>');

    text = text.replace(/\[b\](.*?)\[\/b\]/gs, '<b>$1</b>');
    text = text.replace(/\[u\](.*?)\[\/u\]/gs, '<u>$1</u>');
    text = text.replace(/\[i\](.*?)\[\/i\]/gs, '<i>$1</i>');
    text = text.replace(/\[strike\](.*?)\[\/strike\]/gs, '<strike>$1</strike>');
    text = text.replace(/\[spoiler\](.*?)\[\/spoiler\]/gs, '<span class="spoiler">$1</span>');
    text = text.replace(/\[hr\](.*?)\[\/hr\]/gs, '<hr></hr>');

    // Перенос строки
    text = text.replace(/\n/g, '<br>');
    console.log(text);
    text = text.replace(/^<br>/, '');
    if (short) {
        text = text.replace(/(<br>\s*)+<br>+/g, '<br>');
    }

    text = text.replace(/\[list\]/gm, '<list>');
    text = text.replace(/\[\*\]/gm, '<li>');
    text = text.replace(/\[\/list\]/gm, '</list>');

    return text;
}


// Публичные функции

window.OpenWS = {
    fetchMods: async function(params = {}) {
        let url = 'https://api.openworkshop.su/list/mods/?short_description=true';
        url += "&page=" + (Number(OpenWS.getFromDict(params, "page", 0))-1);
        url += "&page_size=" + OpenWS.getFromDict(params, "page_size", 10);
        url += "&name=" + OpenWS.getFromDict(params, "name", "");
        url += "&games=%5B" + OpenWS.getFromDict(params, "game", "") + "%5D";
  
        try {
            const response = await fetch(url);
            const data = await response.json();
            return data; // Поправил поле "result" на "results"
        } catch (error) {
            console.error('Ошибка:', error);
            return {"results": []}; // Если возникла ошибка, возвращаем пустой массив
        }
    },
    fetchGames: async function(params = {}) {
        let url = 'https://api.openworkshop.su/list/games/?short_description=true';
        url += "&page=" + (Number(OpenWS.getFromDict(params, "page", 0))-1);
        url += "&page_size=" + OpenWS.getFromDict(params, "page_size", 10);
        url += "&name=" + OpenWS.getFromDict(params, "name", "");
  
        try {
            const response = await fetch(url);
            const data = await response.json();
            return data; // Поправил поле "result" на "results"
        } catch (error) {
            console.error('Ошибка:', error);
            return {"results": []}; // Если возникла ошибка, возвращаем пустой массив
        }
    },
    fetchGame: async function(game) {
        let url = 'https://api.openworkshop.su/info/game/'+game;
  
        try {
            const response = await fetch(url);
            const data = await response.json();
            return data.result; // Поправил поле "result" на "results"
        } catch (error) {
            console.error('Ошибка:', error);
            return {name: "ERROR"}; // Если возникла ошибка, возвращаем пустой массив
        }
    },
    syntaxToHTML: function(text, short = false) {
        text = urlTextProcess(text)
        text = steamSyntax(text, short)
        text = urlImageProcess(text)
        
        return text;
    },
    createCard: function(cardData, toLink = true, searchCard = "", isGame = false) {
        // Создаем карточку
        const card = document.createElement('div');
        card.classList.add('card');
        card.id = cardData.id

        // Создаем кликабельную часть
        const cardClick = document.createElement('div');
        cardClick.classList.add('card-click');

        // В кликабельной части - картинка
        const imageHolder = document.createElement('div');
        imageHolder.classList.add('card__image-holder');
        if (isGame) {
            imageHolder.classList.add('card__image-holder-game');
        }

        const image = document.createElement('img');
        image.classList.add('card__image', 'title-card-img');
        if ("logo" in cardData) {
            image.src = cardData.logo
        } else {
            image.src = "assets/images/loading.webp";
            image.classList.add('hiden');
        }

        image.alt = "Здесь должен быть логотип мода";
        image.id = "preview-logo-card-"+cardData.id
        image.setAttribute("onerror", "this.src='assets/images/image-not-found.webp'")

        imageHolder.appendChild(image);
        cardClick.appendChild(imageHolder);

        // В кликабельной части - заголовок
        const title = document.createElement('div');
        title.classList.add('card-title');

        const heading = document.createElement('h2');
        heading.id = "titlename"+cardData.id;

        const titleText = OpenWS.highlightSearchText(searchCard, cardData.name);
        heading.innerHTML = titleText;
        heading.title = cardData.name;

        title.appendChild(heading);
        cardClick.appendChild(title);
        card.appendChild(cardClick);

        // Создаем всплывашку с описанием
        const flap = document.createElement('div');
        flap.classList.add('card-flap', 'flap1');
        if (isGame) {
            flap.classList.add('card-flap-game');
        }
        flap.id = "card-flap"+cardData.id

        const description = document.createElement('div');
        description.classList.add('card-description');

        var desc = cardData.short_description;
        description.innerHTML = window.OpenWS.syntaxToHTML(desc, true);

        flap.appendChild(description);

        const flapButtons = document.createElement('div')
        flapButtons.classList.add('flap-buttons');

        if (toLink) {
            const to = document.createElement('a');
            to.href = "/mod/"+cardData.id+cardData.doplink;
            to.id = "tomodlink"+cardData.id;

            const to_img = document.createElement('img');
            to_img.src = "/assets/images/arrow.webp";
            to_img.classList.add('img-to-mod');
            to.appendChild(to_img);

            to.classList.add('button-card');
            to.classList.add('button-flap');
            flapButtons.appendChild(to);
        }
        if (isGame) {
            const tog = document.createElement('button');
            tog.id = "togamelink"+cardData.id;
            tog.setAttribute("onclick", "gameSelect("+cardData.id+")");

            const to_img = document.createElement('img');
            to_img.src = "/assets/images/telescope.webp";
            to_img.classList.add('img-to-mod');
            tog.appendChild(to_img);

            tog.classList.add('button-game');
            tog.classList.add('button-flap');
            flapButtons.appendChild(tog);
        }

        const tog = document.createElement('button');
        tog.id = "togamelink"+cardData.id;
        tog.setAttribute("onclick", "cardCancel("+cardData.id+")");

        const to_img = document.createElement('img');
        to_img.src = "/assets/images/cancel.webp";
        to_img.classList.add('img-to-mod');
        tog.appendChild(to_img);

        tog.classList.add('button-cancel');
        tog.classList.add('button-flap');
        tog.title = "Завернуть карточку"
        flapButtons.appendChild(tog);

        flap.appendChild(flapButtons);

        card.appendChild(flap);

        // Создаем саму карточку
        return card;
    },
    setterCardImgs: async function() {
        let ids = Array.from(document.querySelectorAll('.card')).map(element => element.getAttribute('id'));
        
        const response = await fetch(`https://api.openworkshop.su/list/resources_mods/[${ids}]?page_size=50&page=0&types_resources=["logo"]`);
        const data = await response.json();

        function changeImage(img, pic) {
            img.src = pic;
            img.classList.remove("hiden");
            img.classList.add("show");
        }

        for (let i = 0; i < data.results.length; i++) {
            const result = data.results[i];
            const img = document.getElementById("preview-logo-card-"+result.owner_id)

            if (img) {
                changeImage(img, result.url);
                //img.src = result.url;

                const index = ids.indexOf(String(result.owner_id)); // Находим индекс значения, которое хотим удалить
                if (index !== -1) {
                    ids.splice(index, 1); // Удаляем значение по найденному индексу
                }
            }
        }
        for (id of ids) {
            const img = document.getElementById("preview-logo-card-"+id)
            if (img) {
                changeImage(img, "assets/images/image-not-found.webp");
                //img.src = "assets/images/image-not-found.webp";
            }
        }
    },
    urlParams: function(currentUrl) {
        // Разбиваем URL-адрес на части по символу "?"
        let urlParts = currentUrl.split("?");

        // Проверяем наличие параметров в URL-адресе
        if (urlParts.length > 1) {
            let queryString = urlParts[1];

            // Разбиваем строку запроса на параметры
            let params = new URLSearchParams(queryString);
            
            // Создаем пустой словарь
            let paramsDict = {};

            // Итерируемся по всем параметрам и добавляем их в словарь
            for (let param of params.entries()) {
                let [key, value] = param;
                paramsDict[key] = value;
            }

            return paramsDict
        } else {
            return {}
        }
    },
    getFromDict(dict, key, standard = null) {
        return dict.hasOwnProperty(key) ? dict[key] : standard;
    },
    highlightSearchText(searchQuery, articleText) {
        if (searchQuery.trim().length > 0) {
            const regex = new RegExp(searchQuery.trim(), 'gi');
            articleText = articleText.replace(regex, '<p class="result-search">$&</p>');
        };
        return articleText;
    }
}
