$(document).ready(function() {
    $("textarea.editing").each(function() {
        fullDescUpdate($(this));
    });
});


function fullDescUpdate(textareaDesc) {
    const element = textareaDesc.parent();
    descUpdate(element, textareaDesc.val());
    descOnHeight(element, textareaDesc);
    limitRenderUpdate(element, textareaDesc);
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
    element.css('height', 0);
    var heightCurr = (element[0].scrollHeight + 10);
    
    console.log(heightCurr)

    root.css('height', heightCurr + 15 + "px");
    element.css('height', heightCurr + "px");
    root.find("#highlighting").css('height', heightCurr + "px");
    root.find("#desc-edit").css('height', heightCurr + 20 + "px");
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
    } else {
        result_element.removeClass("invisible-highlighting")
        Prism.highlightElement(result_element[0]);
    }
}
