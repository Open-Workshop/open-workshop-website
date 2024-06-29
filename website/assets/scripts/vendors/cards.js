
window.Cards = {
    create: function(cardData, page, toLink = true, searchCard = "", isGame = false, tags = []) {
        // Создаем карточку
        const card = document.createElement('div');
        card.setAttribute('pageOwner', page);

        card.classList.add('card');
        card.id = cardData.id

        // Создаем кликабельную часть
        const cardClick = document.createElement('div');
        cardClick.classList.add('card-click');
        cardClick.onclick = function() { Catalog.cardShow(this) };

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
        image.setAttribute("onerror", "handlerImgErrorLoad(this)")
        image.setAttribute('onload', 'Catalog.masonry()');

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
        
        card.appendChild(cardClick);

        // Создаем всплывашку с описанием
        const flap = document.createElement('div');
        flap.classList.add('card-flap');

        const description = document.createElement('article');

        var desc = cardData.short_description;
        description.innerHTML = Formating.syntax2HTML(desc, true);

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
            to_img.src = "/assets/images/svg/black/arrow.svg";
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

            tog.classList.add('small');
            tog.classList.add('small-padding');
            flapButtons.appendChild(tog);
        }

        const tog = document.createElement('button');
        tog.id = "togamelink"+cardData.id;
        tog.onclick = function() { Catalog.cardsCancel() }

        const to_img = document.createElement('img');
        to_img.src = "/assets/images/svg/black/cancel.svg";
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
        console.log('setterImgs', page)
        let ids = Array.from(document.querySelectorAll('div.card[pageowner=\"'+page+'\"]')).map(element => element.getAttribute('id'));
        console.log('setterImgs', ids)

        const response = await fetch(`https://new.openworkshop.su/api/manager/list/resources/${owner_type}/[${ids}]?page_size=50&types_resources=["logo"]`);
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
        for (id of ids) {
            const img = document.getElementById("preview-logo-card-"+id)
            if (img) {
                changeImage(img, "/assets/images/image-not-found.webp");
            }
        }
    },
}
