(function () {
    "use strict";
    let aws = require('aws-sdk');
    let dynamodb = new aws.DynamoDB({
        apiVersion: '2012-08-10',
        httpOptions: {
            timeout: 100
        }
    });
    let fs = require('fs');
    let fileConfig = false;

    const TABLE_NAME = 'TokenGoodsConfig';

    module.exports = {
        loadFileConfig: function() {
            if (fileConfig !== false)
                return fileConfig;
            if (!module.exports.canFileConfig())
                return false;
            fileConfig = JSON.parse(fs.readFileSync(global.CONFIG_FILE_PATH));
            return fileConfig;
        },
        canFileConfig: function() {
            if (typeof global.CONFIG_FILE_PATH != 'string')
                return false;
            try {
                fs.accessSync(global.CONFIG_FILE_PATH, fs.F_OK);
                return true;
            } catch (e) {
                return false;
            }
        },
        getAllConfig: function () {
            console.log('- Loading All Config');
            return new Promise(function (resolve, reject) {
                // try file based first
                var config = module.exports.loadFileConfig();
                if (config !== false) {
                    resolve(config);
                } else {
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
                }
            });
        },
        getConfig: function (configKey) {
            console.log('- Loading Config - ' + configKey);
            return new Promise(function (resolve, reject) {
                // try file based first
                var config = this.loadFileConfig();
                if (config !== false) {
                    if (typeof config[configKey] === 'undefined') {
                        reject(new Error('Config value not found'));
                    } else {
                        resolve(config[configKey]);
                    }
                } else {
                    // grab just a single key
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
                                reject(new Error('Config value not found'));
                            } else {
                                resolve(data.Item.value.S);
                            }
                        }
                    });
                }
            });
        }
    }
}).call(this);
