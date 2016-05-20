'use strict';
let AWS = require('aws-sdk');
let SQS = new AWS.SQS({apiVersion: '2012-11-05'});

const SQS_QUEUE_URL = '';
const SEARCH_URL = 'http://webservices.amazon.com/onca/xml';

let SearchParams = {
    Service: 'AWSECommerceService',
    AWSAccessKeyId: '',
    Operation: 'ItemSearch',
    Condition: 'New',
    Keywords: '',
    SearchIndex: '',
    Sort: 'psrank',
    ResponseGroup: 'ItemIds'
};
let AWSSecretKey = '';

function performSearch(termBody) {
    return new Promise((resolve, reject) => {
        // do search
        SearchParams['Keywords'] = termBody.term;
        SearchParams['SearchIndex'] = termBody.index;

        resolve(true);
    });
}

function deleteMessage(Message) {
    SQS.deleteMessage({
        QueueUrl: SQS_QUEUE_URL,
        ReceiptHandle: Message.ReceiptHandle
    }, (err, data) => {
        if (err) throw err;
    });
}

function poll() {
    return new Promise((resolve, reject) => {
        SQS.receiveMessage({
            QueueUrl: SQS_QUEUE_URL,
            MaxNumberOfMessages: 10,
            VisibilityTimeout: 100, // 10 seconds per message
            WaitTimeSeconds: 0
        }, (err, data) => {
            if (err)
                reject(err);

            // resolve when no more messages left
            if (data.Messages.length < 1)
                resolve('Done');

            for (var i = 0; i < data.Messages.length; i++) {
                performSearch(data.Messages[i].Body)
                    .then((res) => {
                        deleteMessage(data.Messages[i]);
                        console.log(res);
                    })
                    .catch((err) => reject(err));
            }

            // poll again for more messages
            poll().then((res) => resolve(res)).catch((err) => reject(err));
        })
    });
}

exports.handler = (event, context, callback) => {
    
    poll().then((res) => callback(null, res)).catch((err) => callback(err, null));
};
