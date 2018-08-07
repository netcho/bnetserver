const protobuf = require('protobufjs');

const Service = require('./service.js');

const accountTypes = protobuf.loadSync('proto/bnet/account_types.proto');

const privacyInfo = accountTypes.lookupType('bgs.protocol.account.v1.PrivacyInfo');
const accountState = accountTypes.lookupType('bgs.protocol.account.v1.AccountState');
const accountTags = accountTypes.lookupType('bgs.protocol.account.v1.AccountFieldTags');

const Account = require('../models/account');

module.exports = class AccountService extends Service{
    constructor(){
        super('AccountService', 'proto/bnet/account_service.proto');

        this.registerHandler('GetAccountState', (context) => {
            context.response.state = accountState.create();
            context.response.tags = accountTags.create();

            if (context.request.hasOwnProperty('fieldPrivacyInfo')) {
                context.response.state.privacyInfo = privacyInfo.create();
                context.response.state.privacyInfo.isUsingRid = false;
                context.response.state.privacyInfo.isReadIdVisibleForViewFriends = false;
                context.response.state.privacyInfo.isHiddenFromFriendFinder = true;

                context.response.tags.privaceInfoTag = 0xD7CA834D;
            }

            return Promise.resolve(0);
        });

        this.registerHandler('GetGameAccountState', (context) => {
            return Promise.resolve(0);
        });
    }
};