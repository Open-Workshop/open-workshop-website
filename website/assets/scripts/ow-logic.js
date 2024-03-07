
// Триггерим логику при инициализации

$(document).ready(function() {
    $('input').trigger('input');
    checkElementsImportHeight();
});


// Обработчик ошибок картинок
$('img[errorcap]').on('onerror', function() {
    $(this).attr("src", "/assets/images/image-not-found.webp")
});


// Функция динамической подсветки input элементов

$('input[displaylimit]').on('input', function() {
    const myText = $(this).val();
    const maxLength = $(this).attr('maxlength');
    const minLength = $(this).attr('minlength');

    if ((maxLength && myText.length > maxLength) || (minLength && myText.length < minLength)) {
        $(this).addClass('limit');
    } else {
        $(this).removeClass('limit');
    }
});


// Функция динамической длины input элементов

$('input[dynamlen]').on('input', function() {
    const elem = $(this);
    if ((!elem.hasAttr('empty-width')) || (elem.val().length > 0 && elem.hasAttr('empty-width'))) {
        elem.css('width', 0);
        elem.css('width', elem[0].scrollWidth + 8 + "px");
    } else {
        elem.css('width', elem.attr('empty-width'))
    }
});


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

$('[import-height]').on('event-height', function() {
    checkElementsImportHeight();
});
