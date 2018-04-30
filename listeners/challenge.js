'use strict';

const Listener = require('./listener');

module.exports = class ChallengeListener extends Listener {
    constructor() {
        super('ChallengeListener', 'proto/bnet/challenge_service.proto');
    }

    sendChallengeURL(url, context) {
        this.call('OnExternalChallenge', context, (request) => {
            request.payloadType = 'web_auth_url';
            request.payload = Buffer.from(url, 'ascii');
        });
    }
};