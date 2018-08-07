/**
 * Created by kaloyan on 10.7.2016 г..
 */
'use strict';

const crypto = require('crypto');

const Service = require('./service');
const ChallengeListener = require('../listeners/challenge');
const AuthenticationListener = require('../listeners/authentication');
const models = require('../models/');

module.exports = class AuthenticationService extends Service {
    constructor(){
        super('AuthenticationService', 'proto/bnet/authentication_service.proto');

        this.registerHandler('Logon', (context) => {
            global.logger.info('Logon Request for program '+context.request.program+' on '+context.request.platform);

            let loginTicket = "TC-"+crypto.randomBytes(20).toString('hex');

            let challengeListener = new ChallengeListener(context);

            global.etcd.set('/aurora/services/' + this.getServiceName() + '/loginTickets/' + loginTicket + '/program', context.request.program, () => {
                challengeListener.OnExternalChallenge('https://127.0.0.1:443/bnetserver/login/' + loginTicket);
            });

            return Promise.resolve(0);
        });

        this.registerHandler('VerifyWebCredentials', (context) => {
            let loginTicket = Buffer.from(context.request.webCredentials).toString();

            let authenticationListener = new AuthenticationListener(context);

            if (loginTicket.length) {
                new Promise((resolve, reject) => {
                    global.etcd.get('/aurora/services/' + this.getServiceName() + '/loginTickets/' + loginTicket + '/accountId', (err, result) => {
                        if (err) {
                            reject(err);
                        }

                        resolve(result.node.value);
                    });
                }).then((accountId) => {
                    return models.Account.findAll({ include: ['GameAccount'], where: { id: accountId }});
                }).then((account) => {
                    if(account.gameAccounts.length) {
                        authenticationListener.OnLogonComplete(0, account, []); //ERROR_OK
                    }
                    else {
                        authenticationListener.OnLogonComplete(12); //ERROR_NO_GAME_ACCOUNT
                    }
                }).catch(() => {
                    authenticationListener.OnLogonComplete(4); //ERROR_NOT_EXISTS
                });

                return Promise.resolve(0);
            }
            else {
                return Promise.reject(0x0000000A);
            }
        });
    }
};