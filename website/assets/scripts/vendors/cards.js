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

    function isStorageDownloadUrl(url) {
        if (!url || typeof url !== 'string' || !/^https?:\/\//i.test(url)) return false;
        try {
            const parsed = new URL(url, window.location.href);
            return /^https?:$/.test(parsed.protocol) && parsed.pathname.indexOf('/download/') === 0;
        } catch (error) {
            return false;
        }
    }

    function getStorageOrigin(url) {
        if (!url || typeof url !== 'string' || !/^https?:\/\//i.test(url)) {
            return '';
        }
        try {
            return new URL(url, window.location.href).origin;
        } catch (error) {
            return '';
        }
    }

    function setCardMediaAspectRatio(media, width, height) {
        if (!(media instanceof Element)) return;
        const parsedWidth = Number(width);
        const parsedHeight = Number(height);
        if (!Number.isFinite(parsedWidth) || !Number.isFinite(parsedHeight) || parsedWidth <= 0 || parsedHeight <= 0) {
            return;
        }
        media.style.aspectRatio = `${parsedWidth} / ${parsedHeight}`;
    }

    function paintCardBlurhash(image, blurhashData) {
        if (!image || !blurhashData || !blurhashData.blurhash || !window.Blurhash || typeof window.Blurhash.drawToCanvas !== 'function') {
            return false;
        }
        const media = image.closest('.card-media');
        const canvas = media ? media.querySelector('canvas.card-blurhash') : null;
        if (!canvas) return false;

        const width = Number(blurhashData.width);
        const height = Number(blurhashData.height);
        setCardMediaAspectRatio(media, width, height);

        const renderWidth = 32;
        const renderHeight = Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0
            ? Math.max(16, Math.round(renderWidth * (height / width)))
            : 24;

        canvas.dataset.blurhash = blurhashData.blurhash;
        const rendered = window.Blurhash.drawToCanvas(canvas, blurhashData.blurhash, renderWidth, renderHeight);
        canvas.hidden = !rendered;
        return rendered;
    }

    async function fetchBlurhashBatch(urls) {
        const resultMap = new Map();
        const grouped = new Map();

        urls.forEach(function (url) {
            if (!isStorageDownloadUrl(url)) return;
            const origin = getStorageOrigin(url);
            if (!origin) return;
            if (!grouped.has(origin)) {
                grouped.set(origin, []);
            }
            grouped.get(origin).push(url);
        });

        await Promise.all(Array.from(grouped.entries()).map(async function ([origin, originUrls]) {
            try {
                const response = await fetch(`${origin}/blurhashes`, {
                    method: 'POST',
                    mode: 'cors',
                    credentials: 'omit',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ paths: originUrls }),
                });
                if (!response.ok) {
                    return;
                }
                const payload = await response.json().catch(function () {
                    return null;
                });
                const items = payload && Array.isArray(payload.items) ? payload.items : [];
                items.forEach(function (item) {
                    if (!item || typeof item !== 'object' || typeof item.path !== 'string') return;
                    resultMap.set(item.path, item);
                });
            } catch (error) {
                return;
            }
        }));

        return resultMap;
    }

    function revealCardImage(image) {
        if (!(image instanceof HTMLImageElement)) return;
        image.classList.remove('hiden');
        image.classList.add('show');
        image.style.opacity = '1';
    }

window.Cards = {
    create: function(cardData, page, toLink = true, searchCard = "", isGame = false, tags = [], showEditButton = false, options = {}) {
        const allowGameEdit = document.body && document.body.dataset.canEditGame === 'true';
        const settings = options || {};
        const canShowEditButton = Boolean(showEditButton || (isGame && allowGameEdit && !settings.disableAutoGameEditButton));

        // Создаем карточку
        const card = document.createElement('div');
        card.setAttribute('pageOwner', page);

        card.classList.add('card');
        if (cardData && cardData.adult) {
            card.classList.add('card--adult');
        }
        card.id = cardData.id

        // Создаем кликабельную часть
        const cardClick = document.createElement('div');
        cardClick.classList.add('card-click');
        cardClick.addEventListener('click', function () {
            callCatalogMethod('cardShow', fallbackCardShow, [this]);
        });

        // В кликабельной части - картинка с blurhash-плейсхолдером
        const cardMedia = document.createElement('div');
        cardMedia.classList.add('card-media');
        cardMedia.style.aspectRatio = '4 / 3';

        const blurhashCanvas = document.createElement('canvas');
        blurhashCanvas.classList.add('card-blurhash');
        blurhashCanvas.hidden = true;
        blurhashCanvas.setAttribute('aria-hidden', 'true');

        const image = document.createElement('img');
        image.alt = "Здесь должен быть логотип мода";
        image.id = "preview-logo-card-"+cardData.id
        image.dataset.fallbackSrc = fallbackImage;
        image.style.opacity = '0';
        image.addEventListener('error', function () { handlerImgErrorLoad(this) });
        image.addEventListener('load', function () {
            const media = this.closest('.card-media');
            if (media && this.naturalWidth > 0 && this.naturalHeight > 0) {
                media.style.aspectRatio = `${this.naturalWidth} / ${this.naturalHeight}`;
            }
            revealCardImage(this);
            callCatalogMethod('masonry', function () {}, []);
        });

        if ("logo" in cardData) {
            image.src = cardData.logo;
        } else {
            image.src = "/assets/images/loading.webp";
            image.classList.add('hiden');
        }

        cardMedia.appendChild(blurhashCanvas);
        cardMedia.appendChild(image);
        cardClick.appendChild(cardMedia);

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
        const ids = Array.from(document.querySelectorAll('div.card[pageowner=\"'+page+'\"]')).map(element => element.getAttribute('id'));

        const { getApiPaths, apiUrl } = window.OWCore;
        const apiPaths = getApiPaths();
        const resourcesPath = apiPaths.resource.list.path;
        const ownerType = owner_type === 'games' ? 'games' : 'mods';
        const resourcesParams = new URLSearchParams();
        resourcesParams.set('owner_type', ownerType);
        resourcesParams.set('page_size', '50');
        resourcesParams.append('types', 'logo');
        ids.forEach(function (id) {
            resourcesParams.append('owner_ids', String(id));
        });

        const response = await fetch(`${apiUrl(resourcesPath)}?${resourcesParams.toString()}`, {
            credentials: 'include'
        });
        const data = window.OWCore.normalizeCollectionResponse(await response.json());

        const resourceItems = Array.isArray(data.items) ? data.items : [];
        const blurhashUrls = Array.from(new Set(resourceItems
            .map(function (item) {
                return item && typeof item.url === 'string' ? item.url : '';
            })
            .filter(function (url) {
                return isStorageDownloadUrl(url);
            })));
        const blurhashMap = blurhashUrls.length ? await fetchBlurhashBatch(blurhashUrls) : new Map();
        const seenIds = new Set();
        let needsMasonry = false;

        function changeImage(img, pic) {
            if (!(img instanceof HTMLImageElement)) return;
            img.style.opacity = '0';
            img.src = pic;
        }

        for (let i = 0; i < resourceItems.length; i++) {
            const result = resourceItems[i];
            const img = result && typeof result.owner_id !== 'undefined'
                ? document.getElementById("preview-logo-card-"+result.owner_id)
                : null;

            if (img) {
                const blurhashData = blurhashMap.get(result.url);
                if (blurhashData) {
                    needsMasonry = paintCardBlurhash(img, blurhashData) || needsMasonry;
                }
                changeImage(img, result.url);
                seenIds.add(String(result.owner_id));
            }
        }

        for (const id of ids) {
            if (seenIds.has(String(id))) {
                continue;
            }
            const img = document.getElementById("preview-logo-card-"+id)
            if (img) {
                changeImage(img, fallbackImage);
            }
        }

        if (needsMasonry) {
            callCatalogMethod('masonry', function () {}, []);
        }
    },
}
})();
