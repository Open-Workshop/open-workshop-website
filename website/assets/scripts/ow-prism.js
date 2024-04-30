
// Стандартное форматирование ow в описаниях

const ow_prism_b={
    pattern: /\[b\](.*?)\[\/b\]/gms,
    inside: {
        'punctuation': /\[\/?b\]/ig,
        'italic': /\[i\](.*?)\[\/i\]/gms,
        'content': /.*/ig,
    }
}
const ow_prism_i={
    pattern: /\[i\](.*?)\[\/i\]/gms,
    inside: {
        'punctuation': /\[\/?i\]/ig,
        'bold': /\[b\](.*?)\[\/b\]/gms,
        'content': /.*/ig,
    }
}
const ow_prism_img={
    pattern: /\[img\](.*?)\[\/img\]/ig,
    inside: {
        'punctuation': /\[\/?img|\]/ig,
        'content': /.*/ig,
    }
}
const ow_prism_url={
    pattern: /(?:\[url=)(https?:\/\/.*?)(?:\])(.*?)(?:\[\/url\])/ig,
    inside: {
        'img': ow_prism_img,
        'punctuation': /\[\/?url=?|\]/ig,
        'link': /https?:\/\/\S+/ig,
        'bold': ow_prism_b,
        'italic': ow_prism_i,
        'content': /.*/ig,
    }
}
const ow_prism_htitle={
    pattern: /\[(h[1-6])\](.*?)\[\/\1\]/gs,
    inside: {
        'url': ow_prism_url,
        'img': ow_prism_img,
        'punctuation': /\[\/?(h[1-6])\]/ig,
        'bold': ow_prism_b,
        'italic': ow_prism_i,
        'content': /.*/ig,
    }
}

$(document).ready(function() {
    Prism.languages.ow = {
        'list': {
            pattern: /\[list\]((?:.|\n)*?)\[\/list\]/gmi,
            inside: {
                "list": /\[\/?list\]/ig,
                "point": /\[\*\]/ig,
                'title': ow_prism_htitle,
                'img': ow_prism_img,
                'url': ow_prism_url,
                'link': /https?:\/\/\S+/ig,
                'bold': ow_prism_b,
                'italic': ow_prism_i,
                'content': /.*/ig,
            }
        },
        'url': ow_prism_url,
        'img': ow_prism_img,
        'title': ow_prism_htitle,
        'link': /https?:\/\/\S+/ig,
        'italic': ow_prism_i,
        'bold': ow_prism_b,
    };
    
    Prism.languages.webmanifest = Prism.languages.ow;
});
