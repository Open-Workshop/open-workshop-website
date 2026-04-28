
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

        window.history.pushState('', '', window.location.pathname + '?' + urlParams.toString());
    },
    // Принимает данные формата [{key: value, default: value}, ...] при этом словарь используется мой кастомный который в ow-logic.js
    updateParams: function(params) {
        const urlParams = new URLSearchParams(window.location.search);

        params.forEach(param => {
            if (param.value == param.get('default', undefined)) {
                urlParams.delete(param.key);
            } else {
                urlParams.set(param.key, param.value);
            }
        });
        
        window.history.pushState('', '', window.location.pathname + '?' + urlParams.toString());
    },
    genString: function(params, replaceKeyMap = new Dictionary) {
        const query = new URLSearchParams();
        for (const key in params) {
            const value = params[key];
            const outputKey = replaceKeyMap.get(key, key);
            if (Array.isArray(value)) {
                value.forEach(function (item) {
                    if (item !== undefined && item !== null && item !== '') {
                        query.append(outputKey, item);
                    }
                });
                continue;
            }
            if (value !== undefined && value !== null && value !== '') {
                query.append(outputKey, value);
            }
        }
        const queryString = query.toString();
        return queryString ? `?${queryString}` : '';
    }
}
