(function () {
    "use strict";
    let aws = require('aws-sdk');
    let dynamodb = new aws.DynamoDB();

    const TABLE_NAME = 'TokenGoodsConfig';

    module.exports = {
        getAllConfig: function () {
            return new Promise(function (resolve, reject) {
                // grab the whole table
                dynamodb.scan({
                    TableName: 'TokenGoodsConfig'
                }, function (_err, data) {
                    if (_err) {
                        reject(_err);
                    } else {
                        var config = {};
                        for (var i = 0; i < data.Items.length; i++) {
                            config[data.Items[i].key.S] = data.Items[i].value.S;
                        }
                        resolve(config);
                    }
                });
            });

        },
        getConfig: function (configKey) {
            return new Promise(function (resolve, reject) {
                // grab just a single key
                var value = null;
                dynamodb.getItem({
                    Key: {
                        key: {
                            S: String(configKey)
                        }
                    },
                    TableName: TABLE_NAME
                }, function (_err, data) {
                    if (_err)
                        reject(_err);
                    else {
                        if (typeof data.Item === 'undefined') {
                            value = 'Config value not found';
                        } else {
                            value = data.Item.value.S;
                        }
                        resolve(value);
                    }
                });
            });
        }
    }

}).call(this);
