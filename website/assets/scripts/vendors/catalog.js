
const masonrySettings = {
    columnWidth: 318, // Ширина колонки
    percentPosition: false, // Размеры элементов задаются в процентах от ширины родительского контейнера
    gutter: 0, // Пространство между колонками
    stagger: 0, // Задержка между перераспределением элементов
    fitWidth: true, // Masonry выравнивает элементы по ширине контейнера
    isFitWidth: true, // Masonry выравнивает элементы по ширине контейнера
    isOriginLeft: false, // Masonry выравнивает элементы по левому краю контейнера
    isOriginTop: true, // Masonry выравнивает элементы по верхнему краю контейнера
    transitionDuration: 0 // Время анимации перераспределения элементов
}

// Ресайз карточек при изменении размера окна браузера (обязательно кратен ширине карточки)
var msnry = new Masonry('#cards', {...{itemSelector: '.card:not([fixed])'}, ...masonrySettings})

window.addEventListener('resize', function(event) {
    Catalog.masonry()
})

window.Catalog = {
    removeAll: function() {
        $('#cards').html('');
    },
    addPage: async function(settings) {
        const doplink = URLManager.genString(settings.duplicate().pop('page'));
        
        // Устанавливаем обязательные настройки
        settings.set('description', true)
        settings.set('short_description', true)
        settings.set('page_size', 30)

        // Заменяем кастомные ключи на стандартные
        const keys = [['depen', 'dependencies']]
        keys.forEach(key => {
            if (settings.get(key[0]) != undefined) {
                settings.replaceKey(key[0], key[1])
            }
        })
        // Заменяем кастомные значения на стандартные
        const values = new Dictionary({
            'dependencies': {'yes': 'true', 'no': 'false'}, 
            'sort': {
                'DOWNLOADS': 'MOD_DOWNLOADS', 'iDOWNLOADS': 'iMOD_DOWNLOADS',
                'CREATION': 'CREATION_DATE', 'iCREATION': 'iCREATION_DATE',
                'UPDATE': 'UPDATE_DATE', 'iUPDATE': 'iUPDATE_DATE',
                'MODS': 'MODS_COUNT', 'iMODS': 'iMODS_COUNT',
            }
        })
        for (const key in values) {
            if (settings.get(key) != undefined && values[key].get(settings.get(key)) != undefined) {
                settings.set(key, values[key][settings.get(key)])
            }
        }

        // Запрос
        const url = 'https://api.openworkshop.su' + (settings.get('sgame', 'yes') == 'yes' ? '/list/games/' : '/list/mods/') + URLManager.genString(settings, new Dictionary({'size': 'page_size'}))
        console.log(url)

        let response = await fetch(url, {method: 'GET', redirect: 'follow'})
        let data = await response.json();


        data.results.forEach(element => {
            element.doplink = doplink
            $('#cards').append(Cards.create(element, settings.get('page', 0), true, settings.get('name', ''), settings.get('sgame', 'yes') == 'yes'))
            msnry.appended(element)
        })

        return data
    },
    notFound: function() {
        $('#cards').append(Cards.create({
            'name': 'Ничего не найдено',
            'short_description': 'По выбранным параметрам ничего не найдено (×﹏×)',
            'logo': '/assets/images/webp/not-found.webp',
        }, 0, false))
        msnry.appended(element)
        Catalog.masonry();
    },
    masonry: function() {
        $('#cards').css('width', 'auto');
        msnry.reloadItems();
        msnry.layout();
    },
    sitemap: async function(data) {
        try {
            const response = await fetch('https://openworkshop.su/api/regist/page/', {
                method: 'POST', 
                headers: {'Content-Type': 'application/json'}, 
                body: JSON.stringify(data) 
            });
        } catch (error) {
            console.log(error);
        }
    },
    cardShow: function(cardClick) {
        const $cards = $('#cards');
        $cards.addClass('showing');
        $cards.find('.card').removeClass('show');

        const $card = $(cardClick).closest('.card');
        $card.addClass('show');
    },
    cardsCancel: function() {
        const $cards = $('#cards');
        $cards.removeClass('showing');

        $cards.find('.card').removeClass('show');
    }
}
