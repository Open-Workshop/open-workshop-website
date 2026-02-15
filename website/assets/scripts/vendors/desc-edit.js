let descResizeRaf = 0;
let descElementResizeObserver = null;

function normalizeTextarea(textareaDesc) {
    if (!textareaDesc) return null;
    if (textareaDesc.jquery) return textareaDesc;
    return $(textareaDesc);
}

function scheduleDescResize() {
    if (descResizeRaf) return;
    descResizeRaf = requestAnimationFrame(function () {
        descResizeRaf = 0;
        $("textarea.editing").each(function() {
            descOnHeight($(this).parent(), $(this));
        });
    });
}

function ensureDescElementResizeObserver() {
    if (descElementResizeObserver || !window.ResizeObserver) return;
    descElementResizeObserver = new ResizeObserver(function (entries) {
        entries.forEach(function (entry) {
            const textarea = $(entry.target);
            if (!textarea.length) return;
            descOnHeight(textarea.parent(), textarea);
        });
    });
}

function isMeasurableTextarea(element) {
    if (!element || !element.length || !element[0]) return false;
    const node = element[0];
    if (!node.isConnected) return false;
    if (node.getClientRects().length === 0) return false;
    return node.clientWidth > 0;
}

function initDescTextarea(textarea) {
    const $textarea = normalizeTextarea(textarea);
    if (!$textarea || !$textarea.length) return;
    if ($textarea.attr('data-desc-init')) return;
    $textarea.attr('data-desc-init', '1');
    $textarea.attr('startdata', $textarea.val());
    ensureDescElementResizeObserver();
    if (descElementResizeObserver) {
        descElementResizeObserver.observe($textarea[0]);
    }
    fullDescUpdate($textarea);
}

function observeDescEditor() {
    const observer = new MutationObserver(function (mutations) {
        let found = false;
        mutations.forEach(function (mutation) {
            mutation.addedNodes.forEach(function (node) {
                if (!(node instanceof Element)) return;
                if (node.matches && node.matches('textarea.editing')) {
                    initDescTextarea(node);
                    found = true;
                } else if (node.querySelectorAll) {
                    node.querySelectorAll('textarea.editing').forEach(function (textarea) {
                        initDescTextarea(textarea);
                        found = true;
                    });
                }
            });
        });
        if (found) scheduleDescResize();
    });
    observer.observe(document.body, { childList: true, subtree: true });
}

$(document).ready(function() {
    $("textarea.editing").each(function() {
        initDescTextarea(this);
    });

    $(document).on('input', 'textarea.editing', function() {
        fullDescUpdate(this);
    });

    scheduleDescResize();
    setTimeout(scheduleDescResize, 100);
    setTimeout(scheduleDescResize, 350);
    observeDescEditor();
});

$(window).on('resize', function() {
    scheduleDescResize();
});


function fullDescUpdate(textareaDesc) {
    const textarea = normalizeTextarea(textareaDesc);
    if (!textarea || !textarea.length) return;
    const element = textarea.parent();
    descUpdate(element, textarea.val());
    descOnHeight(element, textarea);
    limitRenderUpdate(element, textarea);
}


function limitRenderUpdate(root, editing) {
    const remainingChars = root.attr('limit') - editing.val().length;
    const limiter = root.find('h3#limit-desc-text')
    limiter.text(remainingChars);

    if (remainingChars < 0) {
        limiter.css('color', 'red');
    } else {
        limiter.css('color', 'white');
    }
}

function descOnHeight(root, element) {
    if (!isMeasurableTextarea(element)) return;

    const rawNode = element[0];
    rawNode.style.height = "auto";
    let heightCurr = rawNode.scrollHeight;
    const minHeight = parseFloat(window.getComputedStyle(rawNode).minHeight) || 0;
    if (!Number.isFinite(heightCurr) || heightCurr <= 0) return;
    heightCurr = Math.max(heightCurr, minHeight);

    const nextHeight = heightCurr + "px";
    root.css('height', nextHeight);
    element.css('height', nextHeight);
    root.find("#highlighting").css('height', nextHeight);
}

function descUpdate(root, text) {
    let result_element = root.find("code#highlighting-content");

    // Handle final newlines (see article)
    if (text[text.length-1] == "\n") {
        text += " ";
    }
    // Update code
    result_element.text(text.replace(new RegExp("&", "g"), "&amp;").replace(new RegExp("<", "g"), "&lt;")); /* Global RegExp */
    
    // Syntax Highlight
    if (result_element.html().length <= 0) {
        result_element.html(root.find('textarea.editing').attr('placeholder'));
        result_element.addClass("invisible-highlighting")
        root.find('textarea.editing').addClass("invisible-highlighting")
    } else {
        result_element.removeClass("invisible-highlighting")
        root.find('textarea.editing').removeClass("invisible-highlighting")
        if (window.Prism && typeof Prism.highlightElement === 'function') {
            Prism.highlightElement(result_element[0]);
        }
    }
}
