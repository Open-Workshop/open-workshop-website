
const millisecondsPerDay = 1000 * 60 * 60 * 24; // Количество миллисекунд в одном дне

$(document).ready(function() {
    const md = document.getElementById('mod-description');
    md.innerHTML = OpenWS.syntaxToHTML(md.innerHTML);

    const gameLabel = document.getElementById('mod-for-game-label');
    const dopLink = window.location.href.split("?").pop();

    const depens = Array.from(document.getElementsByClassName("mod-dependence"));
    depens.forEach(depen => {
        depen.href = depen.href+"?"+dopLink;
    });
    
    let params = dopLink.split('&');
    params = params.filter(param => !param.startsWith('game=') && !param.startsWith('game_select='));
    result = params.join('&');

    gameLabel.href += "&"+result;

    
    const dateCreation = document.getElementById('date_creation_a_tag');
    const dateUpdate = document.getElementById('date_update_a_tag');

    dateCreation.innerHTML += format(dates(dateCreation.getAttribute("datejs")))
    if (dateUpdate != null) {
        dateUpdate.innerHTML += format(dates(dateUpdate.getAttribute("datejs")))
    }
});

function dates(selectDate) {
    const oldDate = new Date(selectDate); // Замените на свою старую дату
    const currentDate = new Date(); // Текущая дата и время

    const timeDifference = currentDate - oldDate; // Разница в миллисекундах между старой и текущей датами
    const daysDifference = Math.floor(timeDifference / millisecondsPerDay); // Разница в днях

    if (daysDifference < 30) {
        return daysDifference+" дня"
    } else if (daysDifference < 365) {
        return (daysDifference/30).toFixed(0)+" месяца"
    } else {
        return (daysDifference/365).toFixed(0)+" года"
    }
}

function format(text) {
    return "<i style='margin-left: 3pt; background-color: #0000007d; padding-left: 2pt; padding-right: 2pt; border-radius: 4pt;'>("+text+" назад)</i>"
}
