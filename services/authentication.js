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

            return new Promise((resolve, reject) => {
                global.etcd.set('/aurora/services/' + this.getServiceName() + '/loginTickets/' + loginTicket + '/program',
                    context.request.program, (err) => {
                        if (err) {
                            reject(0x1);
                        }

                        resolve(0);
                        challengeListener.OnExternalChallenge('https://127.0.0.1:443/bnetserver/login/' + loginTicket);
                    });
            });
        });

        this.registerHandler('VerifyWebCredentials', (context) => {
            let loginTicket = Buffer.from(context.request.webCredentials).toString();
            let authenticationListener = new AuthenticationListener(context);

            if (loginTicket.length) {
                return new Promise((resolve, reject) => {
                    global.etcd.get('/aurora/services/' + this.getServiceName() + '/loginTickets/' + loginTicket + '/accountId', (err, result) => {
                        if (err) {
                            authenticationListener.OnLogonComplete(4); //ERROR_NOT_EXISTS
                        }

                        resolve(result.node.value);
                    });
                }).then((accountId) => {
                    return models.Account.find(
                        { include: [ { model: models.GameAccount, as: 'gameAccounts'} ], where: { id: accountId }});
                }).then((account) => {
                    return new Promise((resolve) => {
                        global.etcd.get('/aurora/services/' + this.getServiceName() + '/loginTickets/' + loginTicket + '/program', (err, result) => {
                            if (err) {
                                authenticationListener.OnLogonComplete(12); //ERROR_NO_GAME_ACCOUNT
                            }

                            let usableGameAccounts = account.gameAccounts.filter((gameAccount) => {
                                return gameAccount.program === result.node.value;
                            });

                            authenticationListener.OnLogonComplete(0, account, usableGameAccounts); //ERROR_OK

                            resolve(0);
                        });
                    });
                });
            }
            else {
                return Promise.reject(0x0000000A);
            }
        });
    }
};