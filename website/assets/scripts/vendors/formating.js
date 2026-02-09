
window.Formating = {
    syntax2HTML: function(text, short = false) {
        const regex = /(?<!\[url=|\[img=|\[img\])(https?:\/\/\S+)/gim;
        text = text.replace(regex, url => {
            try {
                const domain = new URL(url).hostname;
                return `<a class="tag-link" href="${url}">${domain}</a>`;
            } catch (e) {
                return `<a class="tag-link" href="${url}">${url}</a>`
            }
        });

        text = text.replace(/(?:\[url=)(https?:\/\/.*?)(?:\])(.*?)(?:\[\/url\])/ig, (match, url, randomText) => {
            return `<a class="tag-link" href="${url}">${randomText}</a>`;
        });

        // Заменим ссылки
        text = text.replace(/\[(.*?)\]\((.*?)\)/g, '<a class="tag-link" href="$2">$1</a>');

        text = text.replace(/(?:\[url=)(.*?)](.*?)(?:\[\/url\])/ig, (match, url, randomText) => {
            return `<a class="tag-link" href="https://${url}">${randomText}</a>`;
        });

        // Заменим выделение жирным текстом
        text = text.replace(/\*\*(.*?)\*\*/gms, '<b>$1</b>');

        // Заменим выделение курсивом
        text = text.replace(/\*(.*?)\*/gm, '<i>$1</i>');

        // Заменим список элементов
        text = text.replace(/^\* (.*?)$/gs, '<li>$1</li>');
        text = text.replace(/^(\s*)\* /gs, '$1<ul>');
        text = text.replace(/<\/li>\n(?!<li>)/gs, '</li></ul>');

        // Заменим цитаты
        text = text.replace(/\[quote\](.*?)\[\/quote\]/gs, '<blockquote><div class="light"></div><div class="content">$1</div></blockquote>');
        // Заменим цитаты с заголовком
        text = text.replace(/\[.*?quote\.*?=(.*?)](.*?)\[.*?\/.*?quote.*?\]/gs, '<blockquote><div class="light"></div><div class="content"><h2 style="text-align: center;">$1</h2><br>$2</div></blockquote>');

        // Заменим код
        text = text.replace(/`(.+?)`/gms, '<code>$1</code>');

        // Заменим таблицы
        text = text.replace(/\[table\](.*?)\[\/table\]/gs, '<table>$1</table>');
        text = text.replace(/\[td\](.*?)\[\/td\]/gs, '<td>$1</td>');
        text = text.replace(/\[tr\](.*?)\[\/tr\]/gs, '<tr>$1</tr>');

        text = text.replace(/(?<!<\/tr>)<tr>/gs, '<tr class="first">');


        text = text.replace(/\[(h[1-6])\](.*?)\[\/\1\]/gs, '<$1>$2</$1>');

        text = text.replace(/\[b\](.*?)\[\/b\]/gms, '<b>$1</b>');
        text = text.replace(/\[u\](.*?)\[\/u\]/gms, '<u>$1</u>');
        text = text.replace(/\[i\](.*?)\[\/i\]/gms, '<i>$1</i>');
        text = text.replace(/\[strike\](.*?)\[\/strike\]/gs, '<strike>$1</strike>');
        text = text.replace(/\[spoiler\](.*?)\[\/spoiler\]/gs, '<span class="spoiler">$1</span>');
        text = text.replace(/\[hr\](.*?)\[\/hr\]/gs, '<hr>');
        text = text.replace(/\[hr\s*\/?\]/gi, '<hr>');


        text = text.replace(/\[list\]((?:.|\n)*?)\[\/list\]/gmi, '<list>$1</list>');
        text = text.replace(/\[\*\](.*?)(\r\n|\r|\n)/gm, '<li>$1</li>$2');

        // Перенос строки
        text = text.replace(/(\r\n|\r|\n)/gm, '<br>');
        if (short) {
            text = text.replace(/(<br>\s*)+<br>+/gm, '<br>');
        }
        
        text = text.replace(/\[img\](.*?)\[\/img\]/ig, (match, url) => {
            return `<img class="img-desc" src="${url}"></img>`;
        });
        return text.replace(/(?:\[img=)(.*?)](.*?)(?:\[\/img\])/ig, (match, url, randomText) => {
            return `<img class="img-desc" src="${url}"></img>`;
        });
    },
    highlightSearch(searchQuery, articleText) {
        if (searchQuery.trim().length > 0) {
            const regex = new RegExp(searchQuery.trim(), 'gi');
            articleText = articleText.replace(regex, '<p class="result-search">$&</p>');
        };
        return articleText;
    },
}
