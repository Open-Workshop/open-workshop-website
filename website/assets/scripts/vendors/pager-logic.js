
window.Pager = {
    updateSelect: function() {
        console.log(this, window.location.href)
        const page = OpenWS.getFromDict(OpenWS.urlParams(window.location.href), 'page', '')
        console.log(page)
    
        pageSelect.call(this, page)
    
        const variants = $(this).getAttrList('active-in-variant disabled-in-variant').map(v => v.replace(/\s/g, ''))
        for (const variant of variants) {
            $('#'+variant).prop('disabled', variants.includes('disabled-in-variant'))
        }

        function pageSelect(pageName) {
            const pages = $(this).parent().attr('variants').replace(/\s/g, '').split(',')
        
            pages.includes(pageName) ? null : pageName = 'in-mod-page'
        
            for (const page of pages) {
                const currectPage = $('#page-'+page);
                if (page == pageName) {
                    currectPage.show()
                } else {
                    currectPage.hide()
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
