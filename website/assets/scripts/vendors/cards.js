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

    function createSkeletonLine(className, width) {
        const line = document.createElement('span');
        line.className = className;
        if (width) {
            line.style.width = width;
        }
        line.setAttribute('aria-hidden', 'true');
        return line;
    }

    function createPlaceholderCard(page, settings) {
        const options = settings || {};
        const index = Number(options.index || 0);
        const titleWidths = ['72%', '84%', '66%', '78%'];
        const chipWidths = options.chipWidths && Array.isArray(options.chipWidths)
            ? options.chipWidths
            : [index % 2 === 0 ? '56px' : '64px', index % 3 === 0 ? '86px' : '72px'];

        const card = document.createElement('div');
        card.classList.add('card', 'card--placeholder');
        card.dataset.placeholderCard = 'true';
        card.dataset.placeholderPage = String(page);
        card.dataset.placeholderIndex = String(index);
        card.setAttribute('pageOwner', page);
        card.setAttribute('aria-busy', 'true');

        const placeholderSurface = document.createElement('div');
        placeholderSurface.classList.add('card-placeholder-surface');
        placeholderSurface.setAttribute('aria-hidden', 'true');

        const cardClick = document.createElement('div');
        cardClick.classList.add('card-click');

        const cardMedia = document.createElement('div');
        cardMedia.classList.add('card-media');
        cardMedia.style.aspectRatio = '518 / 281';

        const mediaShimmer = createSkeletonLine('card-placeholder__shimmer');
        cardMedia.appendChild(mediaShimmer);
        cardClick.appendChild(cardMedia);

        const paramsList = document.createElement('div');
        paramsList.classList.add('card-params-list');
        chipWidths.forEach(function (width) {
            paramsList.appendChild(createSkeletonLine('card-placeholder__chip', width));
        });
        cardClick.appendChild(paramsList);

        const title = document.createElement('h2');
        title.classList.add('card-placeholder__title');
        title.appendChild(createSkeletonLine('card-placeholder__line', options.titleWidth || titleWidths[index % titleWidths.length]));
        cardClick.appendChild(title);

        placeholderSurface.appendChild(cardClick);
        card.appendChild(placeholderSurface);
        return card;
    }

    function isCurrentCatalogRequest(requestToken) {
        if (requestToken == null) return true;
        const catalog = window.Catalog;
        if (!catalog || typeof catalog.getRequestToken !== 'function') {
            return true;
        }
        return catalog.getRequestToken() === requestToken;
    }

    function requestCatalogMasonry() {
        const catalog = window.Catalog;
        if (catalog && typeof catalog.scheduleMasonry === 'function') {
            catalog.scheduleMasonry();
            return;
        }
        callCatalogMethod('masonry', function () {}, []);
    }

    function finalizeMaterializedCardSurface(card) {
        if (!(card instanceof Element)) {
            return false;
        }
        if (!card.classList.contains('card--materialized') && !card.classList.contains('card--materialized-final')) {
            return false;
        }
        if (card.dataset.cardMediaLoaded !== 'true') {
            return false;
        }

        const placeholderSurface = card.querySelector('.card-placeholder-surface');
        if (!placeholderSurface) {
            return false;
        }

        placeholderSurface.remove();
        card.classList.remove('card--placeholder');
        card.classList.remove('card--materializing');
        card.classList.add('card--materialized-final');
        return true;
    }

    function animatePlaceholderExitCard(placeholder, onComplete) {
        const done = typeof onComplete === 'function' ? onComplete : function () {};
        if (!(placeholder instanceof Element)) {
            done();
            return;
        }

        if (!placeholder.isConnected) {
            done();
            return;
        }

        if (!placeholder.classList.contains('card--placeholder')) {
            placeholder.remove();
            done();
            return;
        }

        if (placeholder.classList.contains('card--placeholder-exiting')) {
            return;
        }

        const motionQuery = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
        if (motionQuery && motionQuery.matches) {
            placeholder.remove();
            done();
            return;
        }

        let finished = false;
        const finish = function () {
            if (finished) return;
            finished = true;
            if (placeholder.isConnected) {
                placeholder.remove();
            }
            done();
        };

        placeholder.classList.add('card--placeholder-exiting');
        placeholder.addEventListener('transitionend', function (event) {
            if (event.target !== placeholder) {
                return;
            }
            if (event.propertyName !== 'opacity' && event.propertyName !== 'transform') {
                return;
            }
            finish();
        }, { once: true });

        window.setTimeout(finish, 240);
    }

    function copyCardAttributes(target, source) {
        if (!(target instanceof Element) || !(source instanceof Element)) {
            return;
        }

        Array.from(source.attributes).forEach(function (attribute) {
            if (attribute.name === 'class' || attribute.name === 'id') return;
            target.setAttribute(attribute.name, attribute.value);
        });

        if (source.id) {
            target.id = source.id;
        }
        target.classList.toggle('card--adult', source.classList.contains('card--adult'));
    }

    function createMaterializeLayer(card) {
        const layer = document.createElement('div');
        layer.classList.add('card-materialize-layer');
        layer.setAttribute('aria-hidden', 'true');

        while (card.firstChild) {
            layer.appendChild(card.firstChild);
        }

        return layer;
    }

    function materializePlaceholderCard(placeholder, card, requestToken) {
        if (!(placeholder instanceof Element) || !(card instanceof Element)) {
            return null;
        }

        copyCardAttributes(placeholder, card);
        placeholder.classList.add('card--materializing');

        const layer = createMaterializeLayer(card);
        placeholder.appendChild(layer);

        const motionQuery = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
        const transitionMs = motionQuery && motionQuery.matches ? 0 : 220;
        let started = false;
        let finished = false;
        let transitionTimer = 0;

        function completeMaterialization() {
            if (finished) return;
            finished = true;

            if (transitionTimer) {
                window.clearTimeout(transitionTimer);
                transitionTimer = 0;
            }

            if (!placeholder.isConnected) {
                return;
            }

            if (!isCurrentCatalogRequest(requestToken)) {
                placeholder.remove();
                return;
            }

            layer.removeAttribute('aria-hidden');
            delete placeholder.dataset.placeholderCard;
            delete placeholder.dataset.placeholderPage;
            delete placeholder.dataset.placeholderIndex;
            placeholder.classList.remove('card--placeholder', 'card--materializing');
            placeholder.classList.add('card--materialized-final');
            placeholder.removeAttribute('aria-busy');
            finalizeMaterializedCardSurface(placeholder);
            requestCatalogMasonry();
        }

        function triggerMaterialization() {
            if (started || finished) {
                return;
            }

            if (!placeholder.isConnected || !layer.isConnected) {
                completeMaterialization();
                return;
            }

            if (!isCurrentCatalogRequest(requestToken)) {
                placeholder.remove();
                return;
            }

            started = true;
            placeholder.classList.add('card--materialized');

            if (transitionMs === 0) {
                completeMaterialization();
                return;
            }

            layer.addEventListener('transitionend', function (event) {
                if (event.target !== layer || event.propertyName !== 'opacity') {
                    return;
                }
                completeMaterialization();
            }, { once: true });

            transitionTimer = window.setTimeout(completeMaterialization, transitionMs + 80);
        }

        placeholder.__owTriggerMaterialization = triggerMaterialization;
        placeholder.__owCompleteMaterialization = completeMaterialization;

        if (card.dataset.cardMediaLoaded === 'true') {
            triggerMaterialization();
        }
        return placeholder;
    }

window.Cards = {
    create: function(cardData, page, toLink = true, searchCard = "", isGame = false, tags = [], showEditButton = false, options = {}) {
        const allowGameEdit = document.body && document.body.dataset.canEditGame === 'true';
        const settings = options || {};
        if (settings.placeholder) {
            return createPlaceholderCard(page, settings);
        }
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
        if (settings.mediaAspectRatio) {
            cardMedia.style.aspectRatio = settings.mediaAspectRatio;
        }

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
            const cardRoot = this.closest('.card');
            if (cardRoot) {
                cardRoot.dataset.cardMediaLoaded = 'true';
                if (typeof cardRoot.__owTriggerMaterialization === 'function') {
                    cardRoot.__owTriggerMaterialization();
                }
            }
            revealCardImage(this);
            requestCatalogMasonry();
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
            callCatalogMethod('cardsCancel', fallbackCardsCancel, [this]);
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
    createPlaceholder: function (page, options = {}) {
        return createPlaceholderCard(page, options);
    },
    animatePlaceholderExit: function (placeholder, onComplete) {
        animatePlaceholderExitCard(placeholder, onComplete);
    },
    materializePlaceholder: function (placeholder, card, requestToken = null) {
        return materializePlaceholderCard(placeholder, card, requestToken);
    },
    setterImgs: async function(page, owner_type = "mods", requestToken = null) {
        if (!isCurrentCatalogRequest(requestToken)) {
            return;
        }
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
        if (!isCurrentCatalogRequest(requestToken)) {
            return;
        }
        const data = window.OWCore.normalizeCollectionResponse(await response.json());
        if (!isCurrentCatalogRequest(requestToken)) {
            return;
        }

        const resourceItems = Array.isArray(data.items) ? data.items : [];
        const blurhashUrls = Array.from(new Set(resourceItems
            .map(function (item) {
                return item && typeof item.url === 'string' ? item.url : '';
            })
            .filter(function (url) {
                return isStorageDownloadUrl(url);
            })));
        const blurhashMap = blurhashUrls.length ? await fetchBlurhashBatch(blurhashUrls) : new Map();
        if (!isCurrentCatalogRequest(requestToken)) {
            return;
        }
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

        if (!isCurrentCatalogRequest(requestToken)) {
            return;
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

        if (needsMasonry && isCurrentCatalogRequest(requestToken)) {
            requestCatalogMasonry();
        }
    },
}
})();
