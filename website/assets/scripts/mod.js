$(document).ready(function() {
    const md = document.getElementById('mod-description');
    md.innerHTML = OpenWS.syntaxToHTML(md.innerHTML);
});