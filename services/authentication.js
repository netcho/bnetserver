/**
 * Created by kaloyan on 10.7.2016 г..
 */
'use strict';

const crypto = require('crypto');
const Aerospike = require('aerospike');

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

            return global.aerospike.put(new Aerospike.Key('aurora', this.getServiceName(), loginTicket), { program: 'WoW' }).then(() => {
                challengeListener.OnExternalChallenge('https://127.0.0.1:443/bnetserver/login/' + loginTicket);
                return Promise.resolve(0);
            });
        });

        this.registerHandler('VerifyWebCredentials', (context) => {
            let loginTicket = Buffer.from(context.request.webCredentials).toString();
            let loginTicketKey = new Aerospike.Key('aurora', this.getServiceName(), loginTicket);
            let authenticationListener = new AuthenticationListener(context);

            if (loginTicket.length) {
                return global.aerospike.get(loginTicketKey).then((record) => {
                    return models.Account.find(
                        { include: [ { model: models.GameAccount, as: 'gameAccounts'} ],
                            where: { id: record.bins.accountId }});
                }).then((account) => {
                    global.aerospike.get(loginTicketKey, (err, record) => {
                        let usableGameAccounts = account.gameAccounts.filter((gameAccount) => {
                            return gameAccount.program === record.bins.program;
                        });

                        if(usableGameAccounts.length) {
                            authenticationListener.OnLogonComplete(0, account, usableGameAccounts); //ERROR_OK
                        }
                        else {
                            authenticationListener.OnLogonComplete(12); //ERROR_NO_GAME_ACCOUNT
                        }

                        return Promise.resolve(0);
                    });
                }).catch((error) => {
                    global.logger.error(error);
                    authenticationListener.OnLogonComplete(4); //ERROR_NOT_EXISTS
                });
            }
            else {
                return Promise.reject(0x0000000A);
            }
        });
    }
};