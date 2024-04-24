

// Расширяем его, добавляя метод get с возможностью значения по умолчанию
class Dictionary {
    constructor(old = {}) {
        for (const key in old) {
            if (old[key] instanceof Object) {
                this[key] = new Dictionary(old[key]);
            } else {
                this[key] = old[key];
            }
        }
    }


    get(key, defaultValue = undefined) {
        return this[key] !== undefined ? this[key] : defaultValue;
    }

    set(key, value) {
        this[key] = value;
    }

    pop(key) {
        delete this[key];
        return this;
    }

    replaceKey(oldKey, newKey) {
        this[newKey] = this.get(oldKey);
        delete this[oldKey];
    }


    keys() {
        return Object.keys(this);
    }

    values() {
        return Object.values(this);
    }


    duplicate() {
        return new Dictionary(this);
    }
}

  
// Handlers

function handlerImgErrorLoad(element) {
    console.log('ImgErrorLoad', element)
    $(element).attr('src', '/assets/images/image-not-found.webp');
}


// Триггерим логику при инициализации

$(document).ready(function() {
    const $body = $('body');
    // Обработчик ошибок картинок
    $('img').on('error', function() {
        handlerImgErrorLoad(this);
    });

    // Функция динамической подсветки input элементов
    $body.on('input', 'input[displaylimit]', function() {
        inputDisplayLimit.call(this);
    });
    $('input[displaylimit]').on('event-height', function() {
        inputDisplayLimit.call(this);
    });

    // Функция динамической длины input элементов
    $body.on('input', 'input[dynamlen]', function() {
        inputDynamLen.call(this);
    });
    $('input[dynamlen]').on('event-height', function() {
        inputDynamLen.call(this);
    });
    
    $body.on('event-height', '[import-height]', function() {
        checkElementsImportHeight();
    });
    
    checkElementsImportHeight();

    $('input').trigger('input');
});


setInterval(function() {
    $('input').trigger('event-height');
}, 100)

// Сами логические функции
function inputDynamLen() {
    const elem = $(this);
    if ((!elem.hasAttr('empty-width')) || (elem.val().length > 0 && elem.hasAttr('empty-width'))) {
        elem.css('width', 0);
        elem.css('width', elem[0].scrollWidth + 8 + "px");
    } else {
        elem.css('width', elem.attr('empty-width'))
    }
};

function inputDisplayLimit() {
    const myText = $(this).val();
    const maxLength = $(this).attr('maxlength');
    const minLength = $(this).attr('minlength');

    if ((maxLength && myText.length > maxLength) || (minLength && myText.length < minLength)) {
        $(this).addClass('limit');
    } else {
        $(this).removeClass('limit');
    }
}




// Дополняем jquery логику
$.fn.hasAttr = function(name) {  
    return this.attr(name) !== undefined;
};


// Автоматическая подгонка высоты одного элемента к другому

function checkElementsImportHeight() {
    $('[import-height]').each(function() {
        var filter = $(this).attr('import-height');
        var foundElement = $(filter);
        if (foundElement.length) {
            var height = foundElement.outerHeight();
            $(this).css('height', height + 'px');
        } else {
            console.warn('Элемент, соответствующий фильтру \"' + filter + '\", не найден.');
        }
    });
}

$(window).on('resize', function() {
    checkElementsImportHeight();
});

$(window).on('load', function(){
    checkElementsImportHeight();
});
