
window.Pager = {
    updateSelect: function() {
        console.log(this, window.location.href)
        const page = OpenWS.getFromDict(OpenWS.urlParams(window.location.href), 'page', '')
        console.log(page)
    
        pageSelect.call(this, page)
    
        const variants = $(this).attr('active-in-variant') ? $(this).attr('active-in-variant').replace(/\s/g, '').split(',') : [];
        const disabledVariants = $(this).attr('disabled-in-variant') ? $(this).attr('disabled-in-variant').replace(/\s/g, '').split(',') : [];
        for (const variant of variants+disabledVariants) {
            console.log(variant)
            $('#'+variant).prop('disabled', disabledVariants.includes(variant));
        }

        function pageSelect(pageName) {
            const pages = $(this).parent().attr('variants').replace(/\s/g, '').split(',')
        
            pages.includes(pageName) ? null : pageName = pages[0]
        
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

