/**
 * Created by kaloyan on 10.7.2016 г..
 */
'use strict';

const Service = require('./service');
const ChallengeListener = require('../listeners/challenge');
const AuthenticationListener = require('../listeners/authentication');
const Account = require('../models/account');

module.exports = class AuthenticationService extends Service {
    constructor(){
        super('AuthenticationService', 'proto/bnet/authentication_service.proto');

        let challengeListener = new ChallengeListener();
        let authenticationListener = new AuthenticationListener();

        this.registerHandler('Logon', (context) => {
            global.logger.info('Logon Request for program '+context.request.program+' on '+context.request.platform);

            challengeListener.sendChallengeURL('https://127.0.0.1:443/bnetserver/login/', context);

            return Promise.resolve(0);
        });

        this.registerHandler('VerifyWebCredentials', (context) => {
            let loginTicket = Buffer.from(context.request.webCredentials).toString();
            if (loginTicket.length) {
                new Promise((resolve, reject) => {
                    global.etcd.get('login_tickets/'+loginTicket, (err, result) => {
                        if (err) {
                            reject(err);
                        }

                        resolve(result.node.value);
                    });
                }).then((accountId) => {
                    return Account.findById(accountId).exec();
                }).then((account) => {
                    if(account) {
                        if(account.gameAccounts.length) {
                            authenticationListener.sendLoginResult(0, account, context); //ERROR_OK
                        }
                        else {
                            authenticationListener.sendLoginResult(12, null, context); //ERROR_NO_GAME_ACCOUNT
                        }
                    }
                    else {
                        authenticationListener.sendLoginResult(4, null, context); //ERROR_NOT_EXISTS
                    }
                });

                return Promise.resolve(0);
            }
            else {
                return Promise.reject(0x0000000A);
            }
        });
    }
};