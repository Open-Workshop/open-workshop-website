(function () {
    function fallbackCardShow(cardClick) {
        const cards = cardClick instanceof Element ? cardClick.closest('div.cards') : null;
        if (!cards) return;
        cards.classList.add('showing');
        cards.querySelectorAll('.card').forEach(function (card) {
            card.classList.remove('show');
        });
        const currentCard = cardClick.closest('.card');
        if (currentCard) {
            currentCard.classList.add('show');
        }
    }

    function fallbackCardsCancel(target) {
        const cards = target instanceof Element
            ? target.closest('div.cards')
            : document.querySelector('div.cards.showing, div.mod-edit__catalog-cards');
        if (!cards) return;
        cards.classList.remove('showing');
        cards.querySelectorAll('.card').forEach(function (card) {
            card.classList.remove('show');
        });
    }

    function callCatalogMethod(methodName, fallback, args) {
        const catalog = window.Catalog;
        if (catalog && typeof catalog[methodName] === 'function') {
            return catalog[methodName].apply(catalog, args || []);
        }
        if (typeof fallback === 'function') {
            return fallback.apply(null, args || []);
        }
        return undefined;
    }

    function dispatchGameSelect(gameId) {
        document.dispatchEvent(new CustomEvent('ow:catalog-game-select', {
            bubbles: true,
            detail: { gameId: String(gameId) }
        }));
    }

    const fallbackImage = window.OWCore.getImageFallback();

window.Cards = {
    create: function(cardData, page, toLink = true, searchCard = "", isGame = false, tags = [], showEditButton = false, options = {}) {
        const allowGameEdit = document.body && document.body.dataset.userIsAdmin === 'true';
        const settings = options || {};
        const canShowEditButton = Boolean(showEditButton || (isGame && allowGameEdit && !settings.disableAutoGameEditButton));

        // Создаем карточку
        const card = document.createElement('div');
        card.setAttribute('pageOwner', page);

        card.classList.add('card');
        card.id = cardData.id

        // Создаем кликабельную часть
        const cardClick = document.createElement('div');
        cardClick.classList.add('card-click');
        cardClick.addEventListener('click', function () {
            callCatalogMethod('cardShow', fallbackCardShow, [this]);
        });

        // В кликабельной части - картинка
        const image = document.createElement('img');
        if ("logo" in cardData) {
            image.src = cardData.logo
        } else {
            image.src = "/assets/images/loading.webp";
            image.classList.add('hiden');
        }

        image.alt = "Здесь должен быть логотип мода";
        image.id = "preview-logo-card-"+cardData.id
        image.dataset.fallbackSrc = fallbackImage;
        image.addEventListener('error', function () { handlerImgErrorLoad(this) });
        image.addEventListener('load', function () {
            callCatalogMethod('masonry', function () {}, []);
        });

        cardClick.appendChild(image);

        // В кликабельной части - заголовок
        const title = document.createElement('h2');
        title.id = "titlename"+cardData.id;

        const titleText = Formating.highlightSearch(searchCard, cardData.name);
        title.innerHTML = titleText;
        title.title = cardData.name

        const paramsList = document.createElement('div');
        paramsList.classList.add('card-params-list');

        tags.forEach(tag => {
            const aElement = document.createElement('a');
            aElement.classList.add('tag-link');

            let tagVal = tag.value;
            if (tag.type == "size") {
                if (tagVal > 1000000000) {
                    tagVal = (tagVal / 1073741824).toFixed(0) + " GB";
                } else if (tagVal > 1000000) {
                    tagVal = (tagVal / 1048576).toFixed(0) + " MB";
                } else if (tagVal > 1000) {
                    tagVal = (tagVal / 1024).toFixed(0) + " KB";
                } else {
                    tagVal = tagVal  + " B";
                }
            }

            aElement.innerText = tag.text+tagVal
            aElement.title = tag.description

            paramsList.appendChild(aElement);
        })

        cardClick.appendChild(paramsList);

        cardClick.appendChild(title);

        const hoverOutline = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        hoverOutline.classList.add('card-hover-outline');
        hoverOutline.setAttribute('viewBox', '0 0 100 100');
        hoverOutline.setAttribute('preserveAspectRatio', 'none');
        hoverOutline.setAttribute('aria-hidden', 'true');

        const hoverOutlineRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        hoverOutlineRect.setAttribute('x', '1.5');
        hoverOutlineRect.setAttribute('y', '1.5');
        hoverOutlineRect.setAttribute('width', '97');
        hoverOutlineRect.setAttribute('height', '97');
        hoverOutlineRect.setAttribute('rx', '4');
        hoverOutlineRect.setAttribute('ry', '4');

        hoverOutline.appendChild(hoverOutlineRect);
        
        card.appendChild(cardClick);
        card.appendChild(hoverOutline);

        // Создаем всплывашку с описанием
        const flap = document.createElement('div');
        flap.classList.add('card-flap');

        const description = document.createElement('article');
        description.classList.add('ow-description-content');

        var desc = cardData.short_description;
        Formating.renderInto(description, desc, true);

        flap.appendChild(description);

        const flapButtons = document.createElement('div')
        flapButtons.classList.add('flap-buttons');

        if (toLink && !isGame) {
            const to = document.createElement('a');
            to.href = "/mod/"+cardData.id+cardData.doplink;
            to.id = "tomodlink"+cardData.id;
            to.classList.add('button-style')
            to.classList.add('button-style-small')
            to.classList.add('button-style-small-padding')

            const to_img = document.createElement('img');
            to_img.src = "/assets/images/svg/white/arrow.svg";
            to.appendChild(to_img);

            to.classList.add('button-card');
            to.classList.add('button-flap');
            flapButtons.appendChild(to);
        }
        if (canShowEditButton && toLink) {
            const toEdit = document.createElement('a');
            toEdit.href = isGame ? "/game/"+cardData.id+"/edit" : "/mod/"+cardData.id+"/edit";
            toEdit.id = "toeditlink"+cardData.id;
            toEdit.classList.add('button-style');
            toEdit.classList.add('button-style-small');
            toEdit.classList.add('button-style-small-padding');

            const toEditImg = document.createElement('img');
            toEditImg.src = "/assets/images/edit-ico.svg";
            toEdit.appendChild(toEditImg);

            toEdit.classList.add('button-card');
            toEdit.classList.add('button-flap');
            toEdit.title = isGame ? "Редактировать игру" : "Редактировать мод";
            flapButtons.appendChild(toEdit);
        }
        if (isGame && !settings.disableGameSelectButton) {
            const tog = document.createElement('button');
            tog.id = "togamelink"+cardData.id;
            tog.addEventListener('click', function () {
                dispatchGameSelect(cardData.id);
            });

            const to_img = document.createElement('img');
            to_img.src = "/assets/images/telescope.webp";
            to_img.classList.add('img-to-mod');
            tog.appendChild(to_img);

            tog.classList.add('small');
            tog.classList.add('small-padding');
            flapButtons.appendChild(tog);
        }

        const tog = document.createElement('button');
        tog.id = "togamelink"+cardData.id;
        tog.addEventListener('click', function () {
            callCatalogMethod('cardsCancel', fallbackCardsCancel, [card]);
        });

        const to_img = document.createElement('img');
        to_img.src = "/assets/images/svg/white/cancel.svg";
        tog.appendChild(to_img);

        tog.classList.add('small');
        tog.classList.add('small-padding');
        tog.title = "Завернуть карточку"
        flapButtons.appendChild(tog);

        flap.appendChild(flapButtons);

        card.appendChild(flap);

        // Создаем саму карточку
        return card;
    },
    setterImgs: async function(page, owner_type = "mods") {
        let ids = Array.from(document.querySelectorAll('div.card[pageowner=\"'+page+'\"]')).map(element => element.getAttribute('id'));

        const { getApiPaths, apiUrl } = window.OWCore;
        const apiPaths = getApiPaths();
        const resourcesPath = apiPaths.resource.list.path;
        const ownerType = owner_type === 'games' ? 'games' : 'mods'
        const response = await fetch(`${apiUrl(resourcesPath)}?owner_type=${ownerType}&owner_ids=[${ids}]&page_size=50&types_resources=[\"logo\"]`, {
            credentials: 'include'
        });
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

                const index = ids.indexOf(String(result.owner_id)); // Находим индекс значения, которое хотим удалить
                if (index !== -1) {
                    ids.splice(index, 1); // Удаляем значение по найденному индексу
                }
            }
        }
        for (const id of ids) {
            const img = document.getElementById("preview-logo-card-"+id)
            if (img) {
                changeImage(img, fallbackImage);
            }
        }
    },
}
})();
