/**
 * Created by kaloyan on 10.7.2016 г..
 */
'use strict';

const Service = require('./service');
const ChallengeListener = require('../listeners/challenge');

module.exports = class AuthenticationService extends Service {
    constructor(){
        super('AuthenticationService', 'proto/bnet/authentication_service.proto');

        let challengeListener = new ChallengeListener();

        this.registerHandler('Logon', (context) => {
            global.logger.info('Logon Request for program '+context.request.program+' on '+context.request.platform);
            challengeListener.setQueueName(context.clientQueueName);
            challengeListener.sendChallengeURL('');
        });

        this.registerHandler('VerifyWebCredentials', (request, response) => {
            let loginTicket = request.web_credentials.toBuffer().toString();
            global.etcd.get('login_tickets/'+loginTicket).then((accountId) => {

            });
        });
    }
};