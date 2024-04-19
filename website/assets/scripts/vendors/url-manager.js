
window.URLManager = {
    getParams: function() {
        const urlParams = new URLSearchParams(window.location.search);
        const params = new Dictionary();
        urlParams.forEach(function(value, key) {
            params[key] = value;
        });
        return params;
    },
    updateParam: function(key, value, defaultValue = undefined) {
        const urlParams = new URLSearchParams(window.location.search);
        
        if (value == defaultValue) {
            urlParams.delete(key);
        } else {
            urlParams.set(key, value);
        }
        console.log(urlParams)

        window.history.pushState('', '', window.location.pathname + '?' + urlParams.toString());
    },
    // Принимает данные формата [{key: value, default: value}, ...] при этом словарь используется мой кастомный который в ow-logic.js
    updateParams: function(params) {
        console.log(window.location.search)
        const urlParams = new URLSearchParams(window.location.search);

        params.forEach(param => {
            if (param.value == param.get('default', undefined)) {
                urlParams.delete(param.key);
            } else {
                urlParams.set(param.key, param.value);
            }
        });
        
        console.log(urlParams.toString())
        window.history.pushState('', '', window.location.pathname + '?' + urlParams.toString());
    },
    genString: function(params, replaceKeyMap = new Dictionary) {
        let result = "?";
        for (const key in params) {
            result += replaceKeyMap.get(key, key) + "=" + params[key] + "&";
        }
        return result.slice(0, -1);
    }
}
