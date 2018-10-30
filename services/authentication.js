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
    constructor() {
        super('AuthenticationService', 'proto/bnet/authentication_service.proto');

        this.registerHandler('Logon', this.Logon.bind(this));

        this.registerHandler('VerifyWebCredentials', this.VerifyWebCredential.bind(this));
    }

    Logon(context) {
        global.logger.info('Logon Request for program '+context.request.program+' on '+context.request.platform);

        let loginTicket = crypto.randomBytes(20).toString('hex');
        let loginTicketPath = '/aurora/services/' + this.getServiceName() + '/loginTickets/' + loginTicket;

        let challengeListener = new ChallengeListener(context);

        return global.zookeeper.mkdirp(loginTicketPath).
            then(() => {
                return global.zookeeper.create(loginTicketPath + '/program', context.request.program);
            }).
            then(() => {
                challengeListener.OnExternalChallenge('https://127.0.0.1:443/bnetserver/login/' + loginTicket);
                return Promise.resolve(0);
            });
    }

    VerifyWebCredential(context) {
        let loginTicket = Buffer.from(context.request.webCredentials).toString();
        let authenticationListener = new AuthenticationListener(context);

        if (loginTicket.length) {
            let loginTicketPath = '/aurora/services/' + this.getServiceName() + '/loginTickets/' + loginTicket;

            global.zookeeper.getData(loginTicketPath + '/accountId').
            then((accountId) => {
                return models.Account.find({ include: [ { model: models.GameAccount, as: 'gameAccounts'} ], where: { id: accountId }});
            }, () => {
                authenticationListener.OnLogonComplete(0x0000000A); //ERROR_NO_AUTH
            }).
            then((account) => {
                global.zookeeper.getData(loginTicketPath + '/program').then((program) => {
                    let usableGameAccounts = account.gameAccounts.filter((gameAccount) => {
                        return gameAccount.program === program;
                    });

                    if(!usableGameAccounts.length) {
                        authenticationListener.OnLogonComplete(0, account, usableGameAccounts); //ERROR_OK
                    }
                    else {
                        authenticationListener.OnLogonComplete(0x0000000C); //ERROR_NO_GAME_ACCOUNT
                    }
                });
            }).catch((error) => {
                global.logger.error(error);
                authenticationListener.OnLogonComplete(0x00000001); //ERROR_INTERNAL
            });

            return Promise.resolve(0);
        }
        else {
            return Promise.reject(0x00000001);
        }
    }
};