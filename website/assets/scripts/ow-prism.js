
// Стандартное форматирование ow в описаниях

b={
    pattern: /\[b\](.*?)\[\/b\]/gms,
    inside: {
        'punctuation': /\[\/?b\]/ig,
        'italic': /\[i\](.*?)\[\/i\]/gms,
        'content': /.*/ig,
    }
}
i={
    pattern: /\[i\](.*?)\[\/i\]/gms,
    inside: {
        'punctuation': /\[\/?i\]/ig,
        'bold': /\[b\](.*?)\[\/b\]/gms,
        'content': /.*/ig,
    }
}
img={
    pattern: /\[img\](.*?)\[\/img\]/ig,
    inside: {
        'punctuation': /\[\/?img|\]/ig,
        'content': /.*/ig,
    }
}
url={
    pattern: /(?:\[url=)(https?:\/\/.*?)(?:\])(.*?)(?:\[\/url\])/ig,
    inside: {
        'img': img,
        'punctuation': /\[\/?url=?|\]/ig,
        'link': /https?:\/\/\S+/ig,
        'bold': b,
        'italic': i,
        'content': /.*/ig,
    }
}
htitle={
    pattern: /\[(h[1-6])\](.*?)\[\/\1\]/gs,
    inside: {
        'url': url,
        'img': img,
        'punctuation': /\[\/?(h[1-6])\]/ig,
        'bold': b,
        'italic': i,
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
                'title': htitle,
                'img': img,
                'url': url,
                'link': /https?:\/\/\S+/ig,
                'bold': b,
                'italic': i,
                'content': /.*/ig,
            }
        },
        'url': url,
        'img': img,
        'title': htitle,
        'link': /https?:\/\/\S+/ig,
        'italic': i,
        'bold': b,
    };
    
    Prism.languages.webmanifest = Prism.languages.ow;
});
