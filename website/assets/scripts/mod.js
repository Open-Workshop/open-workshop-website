
const millisecondsPerDay = 1000 * 60 * 60 * 24; // Количество миллисекунд в одном дне

$(document).ready(function() {
    const md = document.getElementById('mod-description');
    md.innerHTML = OpenWS.syntaxToHTML(md.innerHTML);

    const gameLabel = document.getElementById('mod-for-game-label');
    let dopLink = ""
    if (window.location.href.includes("?")) {
        dopLink = "?"+window.location.href.split("?").pop();
    }

    const depens = Array.from(document.getElementsByClassName("mod-dependence"));
    depens.forEach(depen => {
        depen.href = depen.href+dopLink;
    });
    
    let params = dopLink.replace("?", "").split('&');
    params = params.filter(param => !param.startsWith('game=') && !param.startsWith('game_select='));
    result = params.join('&');

    if (result.length > 0) {
        result = "&"+result;
    }
    gameLabel.href += result;

    
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

    function dif(delta, oneWord, twoWord, threeWord) {
        const difference = String((daysDifference/delta).toFixed(0))
        let lastChar = difference[difference.length - 1];
        console.log(difference !== "11", ["1"].includes(lastChar), lastChar)
        if (!difference.endsWith("11") && ["1"].includes(lastChar)) {
            return difference+" "+oneWord
        } else if (!difference.endsWith("12") && !difference.endsWith("13") && !difference.endsWith("14") && ["2", "3", "4"].includes(lastChar)) {
            return difference+" "+twoWord
        } else {
            return difference+" "+threeWord
        }
    }

    if (daysDifference < 30) {
        return dif(1, "день", "дня", "дней")
    } else if (daysDifference < 365) {
        return dif(30, "месяц", "месяца", "месяцев")
    } else {
        return dif(365, "год", "года", "лет")
    }
}

function format(text) {
    return "<i style='margin-left: 3pt; background-color: #0000007d; padding-left: 2pt; padding-right: 2pt; border-radius: 4pt;'>("+text+" назад)</i>"
}
