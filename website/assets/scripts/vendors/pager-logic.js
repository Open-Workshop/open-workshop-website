
window.Pager = {
    updateSelect: function() {
        console.log(this, window.location.href)
        const page = OpenWS.getFromDict(OpenWS.urlParams(window.location.href), 'page', '')
        console.log(page)
    
        pageSelect.call(this, page)
    
        const variants = $(this).attr('active-in-variant') ? $(this).attr('active-in-variant').replace(' ', '').split(',') : [];
        const disabledVariants = $(this).attr('disabled-in-variant') ? $(this).attr('disabled-in-variant').replace(' ', '').split(',') : [];
        console.log(variants, disabledVariants)
        for (const variant of variants) {
            $('#'+variant).removeAttr('disabled');
        }
        for (const variant of disabledVariants) {
            $('#'+variant).attr('disabled', 'true');
        }

        function pageSelect(pageName) {
            const pages = $(this).parent().attr('variants').replace(/\s/g, '').split(',')
        
            pages.includes(pageName) ? null : pageName = pages[0]
        
            async function showIt(element) {
                await new Promise(r => setTimeout(r, 100))
                element.css('opacity', 0)
                element.show()
                await new Promise(r => setTimeout(r, 200))
                element.css('opacity', 1)
            }

            for (const page of pages) {
                const currectPage = $('#page-'+page);
                if (page == pageName) {
                    showIt(currectPage)
                } else {
                    currectPage.fadeOut(100);
                }
            }
        }
    },
    change: function(button) {
        console.log(button, $(button).attr('variant'))
        const res = OpenWS.reselectParam('page', $(button).attr('variant'))
        if (res != false) {
            window.history.pushState('page', 'Open Workshop', res);
            Pager.updateSelect.call(button)
        }
    }
}
