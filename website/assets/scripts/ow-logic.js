

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

const importHeightMap = new Map();
let importHeightObserver = null;
let importHeightRaf = 0;

function scheduleImportHeightUpdate() {
    if (importHeightRaf) return;
    importHeightRaf = requestAnimationFrame(function () {
        importHeightRaf = 0;
        if (importHeightMap.size) {
            importHeightMap.forEach(function (_, target) {
                updateImportHeightForTarget(target);
            });
        } else {
            checkElementsImportHeight();
        }
    });
}

function ensureImportHeightObserver() {
    if (importHeightObserver || !window.ResizeObserver) return;
    importHeightObserver = new ResizeObserver(function (entries) {
        entries.forEach(function (entry) {
            updateImportHeightForTarget(entry.target);
        });
    });
}

function updateImportHeightForTarget(target) {
    const linked = importHeightMap.get(target);
    if (!linked) return;
    const height = target.getBoundingClientRect().height;
    linked.forEach(function (element) {
        element.style.height = height + 'px';
    });
}

function registerImportHeightElement(element) {
    if (!element || element.dataset.owImportBound) return;
    const selector = element.getAttribute('import-height');
    if (!selector) return;
    const target = document.querySelector(selector);
    if (!target) {
        console.warn('Элемент, соответствующий фильтру "' + selector + '", не найден.');
        return;
    }
    element.dataset.owImportBound = '1';
    ensureImportHeightObserver();
    if (!importHeightMap.has(target)) {
        importHeightMap.set(target, new Set());
        if (importHeightObserver) importHeightObserver.observe(target);
    }
    importHeightMap.get(target).add(element);
    updateImportHeightForTarget(target);
}

function bindDynamicInputs(root) {
    root.querySelectorAll('input[dynamlen]').forEach(function (input) {
        if (input.dataset.owDynamLenBound) return;
        input.dataset.owDynamLenBound = '1';
        input.addEventListener('input', function () { inputDynamLen(input); });
        input.addEventListener('change', function () { inputDynamLen(input); });
        inputDynamLen(input);
    });

    root.querySelectorAll('input[displaylimit]').forEach(function (input) {
        if (input.dataset.owDisplayLimitBound) return;
        input.dataset.owDisplayLimitBound = '1';
        input.addEventListener('input', function () { inputDisplayLimit(input); });
        input.addEventListener('change', function () { inputDisplayLimit(input); });
        inputDisplayLimit(input);
    });
}

function bindImportHeight(root) {
    root.querySelectorAll('[import-height]').forEach(function (element) {
        registerImportHeightElement(element);
    });
}

function observeDomChanges() {
    const observer = new MutationObserver(function (mutations) {
        let found = false;
        mutations.forEach(function (mutation) {
            mutation.addedNodes.forEach(function (node) {
                if (!(node instanceof Element)) return;
                if (node.matches && node.matches('input[dynamlen], input[displaylimit], [import-height]')) {
                    found = true;
                } else if (node.querySelector) {
                    if (node.querySelector('input[dynamlen], input[displaylimit], [import-height]')) {
                        found = true;
                    }
                }
            });
        });

        if (!found) return;
        bindDynamicInputs(document);
        bindImportHeight(document);
        scheduleImportHeightUpdate();
    });
    observer.observe(document.body, { childList: true, subtree: true });
}

$(document).ready(function() {
    // Дополняем jquery логику
    $.fn.hasAttr = function(name) {  
        return this.attr(name) !== undefined;
    };

    // Глобальный обработчик ошибок картинок (ловит и динамические изображения)
    document.addEventListener('error', function (event) {
        const target = event.target;
        if (target && target.tagName === 'IMG') {
            handlerImgErrorLoad(target);
        }
    }, true);

    // Функция динамической подсветки input элементов
    $(document).on('event-height', 'input[displaylimit]', function() {
        inputDisplayLimit(this);
    });

    // Функция динамической длины input элементов
    $(document).on('event-height', 'input[dynamlen]', function() {
        inputDynamLen(this);
    });
    
    $(document).on('event-height', '[import-height]', function() {
        scheduleImportHeightUpdate();
    });

    bindDynamicInputs(document);
    bindImportHeight(document);
    scheduleImportHeightUpdate();
    observeDomChanges();
});

// Сами логические функции
function inputDynamLen(element) {
    const elem = $(element);
    if ((!elem.hasAttr('empty-width')) || (elem.val().length > 0 && elem.hasAttr('empty-width'))) {
        elem.css('width', 0);
        elem.css('width', elem[0].scrollWidth + 15 + "px");
    } else {
        elem.css('width', elem.attr('empty-width'))
    }
};

function inputDisplayLimit(element) {
    const elem = $(element);
    const myText = elem.val();
    const maxLength = elem.attr('maxlength');
    const minLength = elem.attr('minlength');

    if ((maxLength && myText.length > maxLength) || (minLength && myText.length < minLength)) {
        elem.addClass('limit');
    } else {
        elem.removeClass('limit');
    }
}


// Автоматическая подгонка высоты одного элемента к другому

function checkElementsImportHeight() {
    $('[import-height]').each(function() {
        registerImportHeightElement(this);
    });
}

$(window).on('resize', function() {
    scheduleImportHeightUpdate();
});

$(window).on('load', function(){
    scheduleImportHeightUpdate();
});
