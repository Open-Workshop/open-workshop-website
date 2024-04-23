
const millisecondsPerDay = 1000 * 60 * 60 * 24; // Количество миллисекунд в одном дне

$(document).ready(function() {
    const md = document.getElementById('mod-description');
    md.innerHTML = Formating.syntax2HTML(md.innerHTML);

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

    dateCreation.innerHTML += format(dates(dateCreation.getAttribute("datejs")), "dateCreationJSDate")
    if (dateUpdate != null) {
        dateUpdate.innerHTML += format(dates(dateUpdate.getAttribute("datejs")), "dateUpdateJSDate")
    }
});

function dates(selectDate) {
    const oldDate = new Date(selectDate); // Замените на свою старую дату
    const currentDate = new Date(); // Текущая дата и время

    console.log(currentDate)
    console.log(oldDate)

    const timeDifference = currentDate - oldDate; // Разница в миллисекундах между старой и текущей датами
    const daysDifference = Math.floor(timeDifference / millisecondsPerDay); // Разница в днях

    function dif(delta, oneWord, twoWord, threeWord, datatime) {
        const difference = String((datatime/delta).toFixed(0))
        let lastChar = difference[difference.length - 1];

        if (!difference.endsWith("11") && ["1"].includes(lastChar)) {
            return difference+" "+oneWord
        } else if (!difference.endsWith("12") && !difference.endsWith("13") && !difference.endsWith("14") && ["2", "3", "4"].includes(lastChar)) {
            return difference+" "+twoWord
        } else {
            return difference+" "+threeWord
        }
    }


    if (daysDifference <= 0) {
        const minutesDifference = Math.floor(timeDifference / 1000); // Разница в секундах

        console.log(minutesDifference)
        if (minutesDifference < 60) {
            return dif(1, "секунду", "секунды", "секунд", minutesDifference)
        } else if (minutesDifference < 3600) {
            return dif(60, "минуту", "минуты", "минут", minutesDifference)
        } else {
            return dif(3600, "час", "часа", "часов", minutesDifference)
        }
    } else if (daysDifference < 30) {
        return dif(1, "день", "дня", "дней", daysDifference)
    } else if (daysDifference < 365) {
        return dif(30, "месяц", "месяца", "месяцев", daysDifference)
    } else {
        return dif(365, "год", "года", "лет", daysDifference)
    }
}

function format(text, elementId) {
    return "<i id='"+elementId+"' style='margin-left: 3pt; background-color: #0000007d; padding-left: 2pt; padding-right: 2pt; border-radius: 4pt;'>("+text+" назад)</i>"
}
