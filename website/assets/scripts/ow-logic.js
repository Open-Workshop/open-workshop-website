
// Триггерим сигнал при инициализации

$(document).ready(function() {
    $('input').trigger('input');
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
    $(this).css('width', 0);
    $(this).css('width', $(this)[0].scrollWidth + 5 + "px");
});
