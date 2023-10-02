function setCharAt(str,index,chr) {
    if(index > str.length-1) return str;
    else if (str[index].includes(" ")) {
        return str
    } else {
        return str.substr(0,index) + chr + str.substr(index+1);
    }
}

var characters = '-=+<>,./?[{()}]!@#$%^&*~`\|'.split('');

var progress404 = 0;
var total404 = String(document.getElementById("title_not_found").title).length;

var progressLink = 0;
var totalLink = String(document.getElementById("link_not_found").title).length;

var scrambleInterval = setInterval(function() {
	var string404 = String(document.getElementById("title_not_found").title);
	var stringLink = String(document.getElementById("link_not_found").title);
	
	for(var i = 0; i < total404; i++) {
		if(i >= progress404) {
			string404 = setCharAt(string404, i, characters[Math.round(Math.random() * (characters.length - 1))]);
		} 
	}
	
	for(var i = 0; i < totalLink; i++) {
		if(i >= progressLink) {
			stringLink = setCharAt(stringLink, i, characters[Math.round(Math.random() * (characters.length - 1))]);
		} 
	}
	
	document.getElementById("title_not_found").textContent = string404;
	document.getElementById("link_not_found").textContent = stringLink;
}, 1000 / 60);

setTimeout(function() {
	var revealInterval = setInterval(function() {
		if(progress404 < total404) {
			progress404++;
		}else if(progressLink < totalLink) {
			progressLink++;
		}else{
			clearInterval(revealInterval);
			clearInterval(scrambleInterval);
		}
	}, 20);
}, 900);