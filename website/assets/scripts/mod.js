$(document).ready(function() {
    const md = document.getElementById('mod-description');
    md.innerHTML = OpenWS.syntaxToHTML(md.innerHTML);

    const gameLabel = document.getElementById('mod-for-game-label');
    const dopLink = window.location.href.split("?").pop();

    let params = dopLink.split('&');

    params = params.filter(param => !param.startsWith('mod_id='));
    let result = params.join('&');

    const depens = Array.from(document.getElementsByClassName("mod-dependence"));
    depens.forEach(depen => {
        depen.href = depen.href+"&"+result;
    });

    
    params = params.filter(param => !param.startsWith('game=') && !param.startsWith('game_select='));
    result = params.join('&');

    gameLabel.href += "&"+result;
});