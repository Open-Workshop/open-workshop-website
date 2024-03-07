
const containerTags = $('div#tags-edit-selected-tags');
const searchContainer = $("#tags-edit-search-tags");
searchRequestUpdate();

async function searchRequestUpdate() {
    const searchInput = $("#search-update-input-tags");
    const pNoInList = $('p#show-more-count-tags');

    pNoInList.addClass('hiden');
    searchContainer.addClass('hiden');

    const ref = await fetch('https://api.openworkshop.su/list/tags/'+searchInput.attr('gameid')+'?page_size=20&name=' + searchInput.val());

    const data = await ref.json();
    console.log(data)

    console.log(searchContainer.find('p')[0])
    searchContainer.html(searchContainer.find('p')[0]);

    data.results.forEach(t => {
        console.log(t)

        const newtag = searchContainer.append('<div onclick="editTag(this)" tagid="' + t.id + '">' + t.name + '</div>').find('div:last');

        const inCont = containerTags.find('[tagid="' + t.id + '"]');
        if (inCont.length > 0 && !inCont.hasClass('none-display')) {
            newtag.addClass('selected-tag');
        }
    })

    function notInList(number) {
        pNoInList.text("И ещё " + number + " шт...");

        if (number <= 0) {
            pNoInList.attr('hidden', '')
        } else {
            pNoInList.removeAttr('hidden');
        }
    }

    notInList(data.database_size - data.results.length);

    pNoInList.removeClass('hiden');
    searchContainer.removeClass('hiden');
}

function editTag(tag) {
    tag = $(tag);

    const tagName = tag.html();
    const searchedTag = searchContainer.find('[tagid="' + tag.attr('tagid') + '"]');

    if (tag.hasClass('selected-tag') || tag.parent().attr('id') == 'tags-edit-selected-tags') {
        searchedTag.removeClass('selected-tag');

        const inCont = containerTags.find('[tagid="' + tag.attr('tagid') + '"]');
        if (inCont.hasAttr('saved')) {
            inCont.addClass('none-display');
        } else {
            inCont.remove();
        }
    } else {
        searchedTag.addClass('selected-tag');

        if (containerTags.find('[tagid="' + tag.attr('tagid') + '"]').length == 0) {
            containerTags.append('<div tagid="' + tag.attr('tagid') + '" onclick="editTag(this)">' + tagName + '</div>');
        } else {
            containerTags.find('[tagid="' + tag.attr('tagid') + '"]').removeClass('none-display');
        }
    }

    containerTags.parent().parent().trigger('event-height');
}

function statePopupTagVisible() {
    const popup = $('div.popup-tags-select');
    popup.toggleClass('popup-nonvisible');
}
