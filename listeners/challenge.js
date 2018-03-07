'use strict';

const Listener = require('./listener');

module.exports = class ChallengeListener extends Listener {
    constructor() {
        super('ChallengeListener', 'proto/bnet/challenge_service.proto');
    }

    sendChallengeURL(url) {
        this.call('OnExternalChallenge', (request) => {
            request.payload_type = 'web_auth_url';
            request.payload = Buffer.from(url);
        }, (response) => {

        });
    }
};