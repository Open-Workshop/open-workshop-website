
const containerTags = $('div#tags-edit-selected-tags');
const searchContainer = $("#tags-edit-search-tags");

window.TagsSelector = {
    async searchRequestTagUpdate() {
        const searchInput = $("#search-update-input-tags");
        const pNoInList = $('p#show-more-count-tags');

        pNoInList.addClass('hiden');
        searchContainer.addClass('hiden');

        const ref = await fetch('https://new.openworkshop.su/api/manager/list/tags?game_id='+searchInput.attr('gameid')+'&page_size=30&name=' + searchInput.val());

        const data = await ref.json();
        searchContainer.html(searchContainer.find('p')[0]);

        data.results.forEach(t => {
            const newtag = searchContainer.append('<div onclick="TagsSelector.editTag(this)" tagid="' + t.id + '">' + t.name + '</div>').find('div:last');

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
    },
    editTag(tag) {
        tag = $(tag);

        const tagName = tag.html(); // имя тега
        const searchedTag = searchContainer.find('[tagid="' + tag.attr('tagid') + '"]'); // найденный тег в списке

        if (tag.hasClass('selected-tag') || tag.parent().attr('id') == 'tags-edit-selected-tags') { // тег уже выбран
            searchedTag.removeClass('selected-tag'); // удаляем выделение

            const inCont = containerTags.find('[tagid="' + tag.attr('tagid') + '"]'); // найденный тег в списке выбранных
            if (inCont.hasAttr('saved')) { // тег сохранен
                inCont.addClass('none-display'); // скрываем его
            } else {
                inCont.remove(); // удаляем его
            }
        } else { // тег не выбран
            searchedTag.addClass('selected-tag'); // выделяем

            if (containerTags.find('[tagid="' + tag.attr('tagid') + '"]').length == 0) { // если такого тега еще нет в списке выбранных
                containerTags.append('<div tagid="' + tag.attr('tagid') + '" onclick="TagsSelector.editTag(this)">' + tagName + '</div>'); // добавляем его
            } else {
                containerTags.find('[tagid="' + tag.attr('tagid') + '"]').removeClass('none-display'); // если уже есть, то отображаем
            }
        }

        containerTags.parent().parent().trigger('event-height'); // обновляем высоту контейнера
    },
    unselectAllTags() {
        const allTag = Array.from(containerTags.find('[tagid]'));

        allTag.forEach(t => {
            TagsSelector.editTag(t);
        })
    },
    async setDefaultSelectedTags(tags) {
        if (tags.length == 0) return;

        const url = 'https://new.openworkshop.su/api/manager/list/tags?game_id=' + $('input#search-update-input-tags').attr('gameid') + '&tags_ids=[' + tags + ']';
        
        const ref = await fetch(url);
        const data = await ref.json();

        data.results.forEach(t => {
            // создаем новый тег
            containerTags.append('<div tagid="' + t.id + '" saved onclick="TagsSelector.editTag(this)">' + t.name + '</div>');
        })

        containerTags.parent().parent().trigger('event-height'); // обновляем высоту контейнера
    },
    returnSelectedTags() {
        const allTags = Array.from(containerTags.find('[tagid]'));

        const standardTags = allTags.filter(t => Number($(t).attr('saved')));
        const notStandardTags = allTags.filter(t => !Number($(t).attr('saved')));

        return {
            standard: standardTags.map(t => Number($(t).attr('tagid'))), // изначальные стандартные
            standardSelected: standardTags.filter(t => !$(t).hasClass('none-display')).map(t => Number($(t).attr('tagid'))), // стандартные которые сейчас выбраны
            standardNotSelected: standardTags.filter(t => $(t).hasClass('none-display')).map(t => Number($(t).attr('tagid'))), // стандартные которые сейчас не выбраны
            notStandardSelected: notStandardTags.map(t => Number($(t).attr('tagid'))), // не стандартные которые сейчас выбраны
            selected: allTags.filter(t => !$(t).hasClass('none-display')).map(t => Number($(t).attr('tagid'))), // просто те которые выбраны
        };
    }
}
