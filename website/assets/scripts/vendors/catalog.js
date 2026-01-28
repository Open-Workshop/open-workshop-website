
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
        settings.set('statistics', true)

        // Заменяем кастомные ключи на стандартные
        const keys = [['depen', 'dependencies']]
        keys.forEach(key => {
            if (settings.get(key[0]) != undefined) {
                console.log(key[0], key[1], settings.get(key[0]))
                settings.replaceKey(key[0], key[1])
                console.log(key[0], key[1], settings.get(key[1]))
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
        // Заменяем теги
        if (settings.get('tags', '').length > 0) {
            settings.set('tags', '['+String(settings.get('tags').split("_"))+']')
            console.log(settings.get('tags'))
        }

        // Запрос
        const managerUrl = document.body.dataset.managerUrl;
        const url = managerUrl + (settings.get('sgame', 'yes') == 'yes' ? 'list/games/' : 'list/mods/') + URLManager.genString(settings, new Dictionary({'size': 'page_size'}))
        console.log(url)

        let response = await fetch(url, {method: 'GET', redirect: 'follow'})
        let data = await response.json();

        if (response.status == 200) {
            data.results.forEach(element => {
                if ($('#cards').find('div#'+element.id).length <= 0) {
                    element.doplink = doplink

                    const tags = []
                    if (element.mods_downloads || element.downloads) {
                        tags.push({
                            'text': '📥',
                            'description': element.mods_downloads ? 'Скачиваний у всех модов игры' : 'Скачиваний',
                            'value': element.mods_downloads || element.downloads
                        })
                    }
                    if (element.size) {
                        tags.push({
                            'text': '📦',
                            'description': 'Размер мода',
                            'value': element.size,
                            'type': 'size'
                        })
                    }
                    if (element.mods_count) {
                        tags.push({
                            'text': '🔭',
                            'description': 'Количество модов',
                            'value': element.mods_count
                        })
                    }

                    $('#cards').append(Cards.create(element, settings.get('page', 0), true, settings.get('name', ''), settings.get('sgame', 'yes') == 'yes', tags))
                    msnry.appended(element)
                } else {
                    console.log('Duplicate (xuricat paradox): ', element)
                }
            })
        } else {
            console.log('Error addPage: ' + data)
        }

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
