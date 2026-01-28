
const containerDependencies = $('#mod-dependence-selected');
const searchedDependencies = $('#dependence-edit-search-dependence');

function editModDependence(dependenc) {
    dependenc = $(dependenc);

    const dependenceName = dependenc.find('h3').html();
    const dependencId = dependenc.attr('modid');
    const dependencImg = dependenc.find('img[onerror]').attr('src');

    const searchedDependence = searchedDependencies.find('[modid="' + dependencId + '"]');

    if (dependenc.hasClass('dependence-selected') || dependenc.parent().attr('id') == 'mod-dependence-selected') {
        searchedDependence.removeClass('dependence-selected');

        const inCont = containerDependencies.find('[modid="' + dependencId + '"]');
        if (inCont.hasAttr('saved')) {
            inCont.addClass('none-display');
        } else {
            inCont.remove();
        }
    } else {
        searchedDependence.addClass('dependence-selected');

        if (containerDependencies.find('[modid="' + dependencId + '"]').length == 0) {
            let modDependenceE = $("<div>").addClass("element").attr("modid", dependencId).attr("onclick", "editModDependence(this)");
            console.log(dependenc, dependenc.find('img[errorcap]'), dependenc.find('img[onerror]').attr('src'), dependencImg)
            let logoE = $("<img>").attr("src", dependencImg).attr("alt", "Логотип мода").attr("onerror", 'handlerImgErrorLoad(this)');
            let eE = $("<e>");
            let hE = $("<h3>").attr("translate", "no").text(dependenceName);
            let iconE = $("<img>").attr("src", "/assets/images/removal-triangle.svg").attr("alt", "Кнопка удаления зависимости");

            // Добавление
            eE.append(hE, iconE);
            modDependenceE.append(logoE, eE);

            // Добавление созданной структуры
            containerDependencies.append(modDependenceE);
        } else {
            containerDependencies.find('[modid="' + dependencId + '"]').removeClass('none-display');
        }
    }
    
    containerTags.parent().parent().trigger('event-height');
}

async function searchRequestDependenceUpdate() {
    const searchInput = $('#search-update-input-dependence');
    const pNoInList = $('p#show-more-count-dependence');
    console.log('searchRequestDependenceUpdate')

    pNoInList.addClass('hiden');
    searchedDependencies.addClass('hiden');

    const managerUrl = document.body.getAttribute('manager-url');
    const ref = await fetch(`${managerUrl}/list/mods/?page_size=5&game=`+searchInput.attr('gameid')+'&name=' + searchInput.val(), {
        credentials: 'include'
    });
    const data = await ref.json();

    let ids = []

    searchedDependencies.html(searchedDependencies.find('p')[0]);
    data.results.forEach(t => {
        ids.push(t.id)

        let classes = "element"

        if (containerDependencies.find('[modid="' + t.id + '"]').length > 0) {
            classes += " dependence-selected";
        }

        var $dependenceSelected = $('<div/>', {
            class: classes,
            modid: t.id,
            onclick: "editModDependence(this)",
            saved: true
        });
        $dependenceSelected.append($('<img/>', {
            src: '/assets/images/loading.webp',
            alt: "Логотип мода",
            onerror: 'handlerImgErrorLoad(this)'
        }));
        var $e = $('<e/>');
        $e.append($('<h3/>', {
            translate: "no",
            title: t.name,
            text: t.name
        }));
        $dependenceSelected.append($e);

        searchedDependencies.append($dependenceSelected);
    })
    
    const refImgs = await fetch(`${managerUrl}/list/resources_mods/[${ids}]?types_resources=["logo"]`, {
        credentials: 'include'
    });
    const dataImgs = await refImgs.json();

    console.log(dataImgs)

    dataImgs.results.forEach(t => {
        searchedDependencies.find('[modid="' + t.owner_id + '"]').find('img').attr('src', t.url);
    })
    searchedDependencies.find("img[src='/assets/images/loading.webp']").attr("src", "/assets/images/image-not-found.webp");


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
    searchedDependencies.removeClass('hiden');
}
