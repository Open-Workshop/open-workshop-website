
const $inputUrlScreenshotSelect = $('input#url-select-screenshot');
const $selectTypeScreenshotSelect = $('select#type-select-screenshot');
const $editParent = $selectTypeScreenshotSelect.parent()

$(document).ready(function() {
    $(document).on('onscreenshotselect', 'a.slider__images-item', function() {
        console.log('onScreenshotSelect')
        $inputUrlScreenshotSelect.val($(this).attr('href'));
        $selectTypeScreenshotSelect.val($(this).attr('typecontent'));

        $editParent.attr('idimg', $(this).attr('idimg'));
    });
    $(document).on('noscreenshotsavailable', document, function() {
        $inputUrlScreenshotSelect.val('');
        $selectTypeScreenshotSelect.val('logo');

        $editParent.attr('idimg', 'empty');
    });
});

function setUrlScreenshotSelect() {
    const $a = $('a[idimg='+$editParent.attr('idimg')+']')

    $a.attr('href', $inputUrlScreenshotSelect.val());
    $a.find('img').attr('src', $inputUrlScreenshotSelect.val());
}

function setTypeScreenshotSelect() {
    var newval = $selectTypeScreenshotSelect.val();

    console.log(newval);
    if (newval == 'logo') {
        const oldlogos = $('a[typecontent="logo"]')
        
        if (oldlogos.length > 0) {
            oldlogos.attr('typecontent', 'screenshot');

            new Toast({
                title: 'Логотип переопределён',
                text: 'Логотип может быть только один. Старый логотип стал скриншотом.',
                theme: 'info'
            });
        }
    }

    $('a[idimg='+$editParent.attr('idimg')+']').attr('typecontent', newval);
}

function deleteScreenshotSelect() {
    const $element = $('a[idimg='+$editParent.attr('idimg')+']');
    
    if ($editParent.attr('idimg').startsWith('new-screenshot-')) {
        $element.remove();
    } else {
        $element.removeClass();
        $element.html('')
        $element.addClass('deleted-user-screenshot');
    }

    allResetVars()
    renderPagesSelect()
    sliderResponse(0)
}

function addScreenshotSelect() {
    const $mainElementList = $(sliderImages);

    function addScreenshot(url, type) {
        var anchorElement = $('<a>', {
            href: url,
            idimg: 'new-screenshot-'+Math.floor(100000 + Math.random() * 900000),
            typecontent: type,
            style: "min-width: 100%;",
            class: "slider__images-item without-caption image-link"
        });
        
        var imgElement = $('<img>', {
            src: url,
            alt: "Скриншот мода",
            class: "slider__images-image",
            onerror: "this.src='/assets/images/image-not-found.webp'"
        });
        
        anchorElement.append(imgElement);
        $mainElementList.append(anchorElement);
    }

    // Если пустой список то так же импортировать параметры из нижней менюшки
    if ($mainElementList.children().length <= 0) {
        addScreenshot($inputUrlScreenshotSelect.val(), $selectTypeScreenshotSelect.val());
    } else {
        addScreenshot('', 'screenshot');
    }

    // Обновляем список
    allResetVars()
    renderPagesSelect()

    // Выбираем новый элемент
    sliderResponse(lastElem)
}
