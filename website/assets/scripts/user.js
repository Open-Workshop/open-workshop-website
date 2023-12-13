
const millisecondsPerDay = Math.floor(1000 * 60 * 60 * 24); // Количество миллисекунд в одном дне

$(document).ready(function() {
    const userMute = document.getElementById('user-mute');

    if (userMute != null) {
        userMute.innerHTML += "<br>"+format(dates(userMute.getAttribute("datejs")), "userMuteJSDate")

        const intervalId = setInterval(() => {
            const resultInner = format(dates(userMute.getAttribute("datejs")), "userMuteJSDate")

            if (resultInner != false) {
                const element = document.getElementById('userMuteJSDate');
                if (element) {
                    element.remove();
                }
                userMute.innerHTML += resultInner
            } else {
                document.getElementById('noVote').remove();
                clearInterval(intervalId); // Обрыв интервала
            }
          }, 500);
    }
});

function dates(selectDate) {
    const oldDate = new Date(); // Замените на свою старую дату
    const currentDate = new Date(selectDate); // Текущая дата и время


    const timeDifference = currentDate - oldDate; // Разница в миллисекундах между старой и текущей датами
    if (timeDifference <= 0) {
        return false
    }

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
    if (!text) {
        return false
    }
    return "<i id='"+elementId+"' style='background-color: #0000007d; padding-left: 2pt; padding-right: 2pt; border-radius: 4pt;'>через "+text+"</i>"
}
