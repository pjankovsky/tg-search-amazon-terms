(function () {
    "use strict";
    let cypto = require('crypto');
    let querystring = require('querystring');

    module.exports = {
        getSigningTimestamp: function () {
            var date = new Date();
            return date.getUTCFullYear() +
                '-' + this.leftTwoPadZero(date.getUTCMonth() + 1) +
                '-' + this.leftTwoPadZero(date.getUTCDate()) +
                'T' + this.leftTwoPadZero(date.getUTCHours()) +
                ':' + this.leftTwoPadZero(date.getUTCMinutes()) +
                ':' + this.leftTwoPadZero(date.getUTCSeconds()) +
                'Z';
        },
        getSignature: function (method, hostname, path, querystring, secret) {
            if (typeof querystring == 'object')
                querystring = this.stringifyParams(querystring);

            var stringToSign = method +
                "\n" + hostname +
                "\n" + path +
                "\n" + querystring;

            var hmac = cypto.createHmac('sha256', secret);
            hmac.update(stringToSign);
            return hmac.digest('base64');
        },
        stringifyParams: function(params) {
            // sorts properly

            var keys = Object.keys(params),
                i = 0,
                len = keys.length,
                parts = [];

            keys.sort();

            for (i=0;i<len;i++) {
                parts.push(querystring.escape(keys[i])+'='+querystring.escape(params[keys[i]]));
            }

            return parts.join('&');
        },
        leftTwoPadZero: function (value) {
            value = String(value);
            while (value.length < 2)
                value = '0' + value;
            return value;
        }
    };
}).call(this);
