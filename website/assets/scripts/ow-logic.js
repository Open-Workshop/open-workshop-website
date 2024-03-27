
// Триггерим логику при инициализации

$(document).ready(function() {
    // Функция динамической подсветки input элементов
    $('input[displaylimit]').on('input', function() {
        inputDisplayLimit.call(this);
    });

    // Функция динамической длины input элементов
    $('input[dynamlen]').on('input', function() {
        inputDynamLen.call(this);
    });
    
    checkElementsImportHeight();

    $('input').trigger('input');
});


setInterval(function() {
    // Обработчик ошибок картинок
    $('img[errorcap]').on('error', function() {
        $(this).attr("src", "/assets/images/image-not-found.webp")
    });

    // Выбираем все элементы с атрибутом 'style-check'
    $('[style-check]').each(function() {
        var styleCheck = $(this).attr('style-check'); // Получаем значение атрибута 'style-check'
        
        // Разбиваем значение атрибута на основе разделителя ';'
        var checks = styleCheck.split(';');
        
        
        checks.forEach((pair) => { // Циклически обрабатываем каждую пару проверка-класс
            var parts = pair.trim().split(' '); // Разбиваем пару на части (стиль, операнд, значение, класс)
            
            var styleName = parts[0].trim(); // Название стиля
            var operand = parts[1].trim(); // Операнд
            var value = parseFloat(parts[2]); // Значение (убедимся, что это число, а не строка)
            var className = parts[3].trim(); // Название класса
            

            // Выполнение проверки и добавление класса
            var styleValue = parseInt($(this).css(styleName));
            const conditionMet = (() => {
                switch (operand) {
                    case '===':
                        return styleValue === value;
                    case '<':
                        return styleValue < value;
                    case '>':
                        return styleValue > value;
                    case '!=':
                        return styleValue != value;
                    default:
                        return false;
                }
            })();

            if (conditionMet) {
                $(this).addClass(className);
            } else {
                $(this).removeClass(className);
            }
        });
    });

    // Функция динамической подсветки input элементов
    $('input[displaylimit]').on('input', function() {
        inputDisplayLimit.call(this);
    });
    $('input[displaylimit]').on('event-height', function() {
        inputDisplayLimit.call(this);
    });

    // Функция динамической длины input элементов
    $('input[dynamlen]').on('input', function() {
        inputDynamLen.call(this);
    });
    $('input[dynamlen]').on('event-height', function() {
        inputDynamLen.call(this);
    });

    $('[import-height]').on('event-height', function() {
        checkElementsImportHeight();
    });

    $('input').trigger('event-height');
}, 300)

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
