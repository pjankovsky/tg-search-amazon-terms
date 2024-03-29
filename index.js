'use strict';
const TERM_QUEUE_URL = 'https://sqs.us-west-2.amazonaws.com/810415707352/product_search_term';
const LOOKUP_QUEUE_URL = 'https://sqs.us-west-2.amazonaws.com/810415707352/product_lookup_asin';

const SEARCH_HOSTNAME = 'webservices.amazon.com';
const SEARCH_PATH = '/onca/xml';

const AWS_ACCESS_KEY = 'XXXXXX';
const AWS_SECRET_KEY = 'XXXXXX+XXXXXX';

let AWS = require('aws-sdk');
let SQS = new AWS.SQS({apiVersion: '2012-11-05'});
let http = require('http');
let querystring = require('querystring');
let parseString = require('xml2js').parseString;
let amazonSignature = require('tg-node-lib/lib/amazonSignature');

// numbers that need to be reset
let timeout = 0;

function addToLookupQueue(asin) {
    console.log('----- Queue ASIN -> ' + asin);
    return new Promise((resolve, reject) => {
        SQS.sendMessage({
            MessageBody: asin,
            QueueUrl: LOOKUP_QUEUE_URL
        }, (err) => {
            if (err)
                throw err;
            resolve(true);
        });
    });
}

function search(params) {
    console.log('---- Call Amazon');
    delete params.Signature;
    params.Signature = amazonSignature.getSignature('GET', SEARCH_HOSTNAME, SEARCH_PATH, params, AWS_SECRET_KEY);

    return new Promise((resolve, reject) => {
        var req = http.request({
            hostname: SEARCH_HOSTNAME,
            path: SEARCH_PATH + "?" + querystring.stringify(params)
        }, (req) => {
            let resBody = '';
            req.on('data', (data) => {
                resBody += data;
            });
            req.on('end', () => {
                parseString(resBody, {
                    explicitArray: false // no super arrays
                }, (err, result) => {
                    if (err)
                        throw err;

                    if (typeof result.ItemSearchResponse === 'undefined')
                        return resolve(true);

                    if (typeof result.ItemSearchResponse.Items === 'undefined')
                        return resolve(true);

                    if (typeof result.ItemSearchResponse.Items.Item === 'undefined')
                        return resolve(true);

                    if (result.ItemSearchResponse.Items.Request.IsValid !== 'True')
                        return resolve(true);

                    var adds = [];
                    for (let j = 0; j < result.ItemSearchResponse.Items.Item.length; j++) {
                        adds.push(addToLookupQueue(result.ItemSearchResponse.Items.Item[j].ASIN));
                    }
                    Promise.all(adds)
                        .then(() => {
                            if (params.ItemPage >= 10)
                                return resolve(true);
                            if (parseInt(result.ItemSearchResponse.Items.TotalPages) > params.ItemPage) {
                                params.ItemPage += 1;
                                search(params)
                                    .then(() => resolve(true))
                                    .catch((err) => reject(err));
                            }
                        })
                        .catch((err) => reject(err));
                });
            })
        });

        req.on('error', (err) => reject(err));
        req.end();
    });
}

function performSearch(body) {
    console.log('--- Search Term -> ' + body);
    body = JSON.parse(body);
    return new Promise((resolve, reject) => {
        // A-Z a-z sort is required for the signature
        let params = {
            AWSAccessKeyId: AWS_ACCESS_KEY, // first because upper case is before lower case
            AssociateTag: 'tokengoods-20',
            Condition: 'New',
            ItemPage: 1,
            Keywords: body.term,
            Operation: 'ItemSearch',
            ResponseGroup: 'ItemIds',
            SearchIndex: body.index || 'All',
            Service: 'AWSECommerceService',
            Sort: 'salesrank',
            Timestamp: amazonSignature.getSigningTimestamp()
        };

        if (params.SearchIndex == 'All')
            delete params.Sort;

        search(params)
            .then((res) => resolve(res))
            .catch((err) => reject(err))
    });
}

function deleteMessage(Message) {
    console.log('--- Delete Message');
    SQS.deleteMessage({
        QueueUrl: TERM_QUEUE_URL,
        ReceiptHandle: Message.ReceiptHandle
    }, (err) => {
        if (err) throw err;
    });
}

function poll() {
    console.log('-- Poll Queue');
    return new Promise((resolve, reject) => {
        SQS.receiveMessage({
            QueueUrl: TERM_QUEUE_URL,
            MaxNumberOfMessages: 10,
            WaitTimeSeconds: 1
        }, (err, data) => {
            if (err)
                return reject(err);

            // resolve when no more messages left
            if (typeof data.Messages === 'undefined')
                return resolve('Done');

            // resolve when no more messages left
            if (data.Messages.length < 1)
                return resolve('Done');

            var p = new Promise((resolve) => {
                // do nothing, simply start the chain
                resolve(true);
            });

            for (let i = 0; i < data.Messages.length; i++) {
                p = p.then(() => {
                    return performSearch(data.Messages[i].Body);
                });
                p = p.then(() => {
                    deleteMessage(data.Messages[i]);
                    // return nothing
                })
            }

            p.then(() => {
                // poll again for more messages
                if (Date.now() < timeout) {
                    poll().then((res) => resolve(res)).catch((err) => reject(err));
                } else {
                    resolve('Done');
                }
            }).catch((err) => reject(err));
        })
    });
}

exports.handler = (event, context, callback) => {
    timeout = Date.now() + 285000; // 4m45
    poll().then((res) => callback(null, res)).catch((err) => callback(err, null));
};
