'use strict';

const crypto = require('crypto');
/*const protobufjs = require('protobufjs');
const long = require('long');

protobufjs.util.long = long;
protobufjs.configure();

const entityTypes = protobufjs.loadSync('proto/bnet/entity_types.proto');
const entityId = entityTypes.lookupType('bgs.protocol.EntityId');*/

const Listener = require('./listener');

const Region = {
    Uninitialized: 1,
    Unknown: 0,
    Us: 1,
    Eu: 2,
    Kr: 3,
    Tw: 4,
    Cn: 5,
    Dev: 60,
    Ptr: 98
};

module.exports = class AuthenticationListener extends Listener{
    constructor(){
        super('AuthenticationListener', 'proto/bnet/authentication_service.proto');
    }

    sendLoginResult(status, account = undefined, context){
        this.call('OnLogonComplete', context, (request) => {
            request.errorCode = status;
            if(account) {
                global.logger.debug(account.accountId.toObject());
                request.accountId = account.accountId.toObject();
                request.battleTag = account.battleTag;
                request.geoipCountry = account.country;

                account.gameAccounts.forEach((gameAccount) => {
                    request.gameAccountId.push(gameAccount.entityId.toObject());
                });

                request.sessionKey = crypto.randomBytes(64).toString('hex');
                request.connectedRegion = Region.Eu;
            }
        });
    }
};