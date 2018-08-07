'use strict';

const Listener = require('./listener');

module.exports = class ChallengeListener extends Listener {
    constructor(context) {
        super('ChallengeListener', 'proto/bnet/challenge_service.proto');
        this.clientQueue = context.queueName;
    }

    OnExternalChallenge(url) {
        this.call('OnExternalChallenge', (request) => {
            request.payloadType = 'web_auth_url';
            request.payload = Buffer.from(url, 'ascii');
        });
    }
};