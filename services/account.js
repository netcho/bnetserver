const protobuf = require('protobufjs');

const Service = require('./service.js');

const accountTypes = protobuf.loadSync('proto/bnet/account_types.proto');

const privacyInfo = accountTypes.lookupType('bgs.protocol.account.v1.PrivacyInfo');
const accountState = accountTypes.lookupType('bgs.protocol.account.v1.AccountState');
const accountTags = accountTypes.lookupType('bgs.protocol.account.v1.AccountFieldTags');
const gameAccountState = accountTypes.lookupType('bgs.protocol.account.v1.GameAccountState');
const gameAccountTags = accountTypes.lookupType('bgs.protocol.account.v1.GameAccountFieldTags');
const gameLevelInfo = accountTypes.lookupType('bgs.protocol.account.v1.GameLevelInfo');
const gameStatus = accountTypes.lookupType('bgs.protocol.account.v1.GameStatus');

const models = require('../models');

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
            context.response.state = gameAccountState.create();
            context.response.tags = gameAccountTags.create();

            return models.GameAccount.findById(context.request.gameAccountId.low.toString()).then((gameAccount) => {
                if(context.request.options.hasOwnProperty('fieldGameLevelInfo')) {
                    context.response.state.gameLevelInfo = gameLevelInfo.create();
                    context.response.state.gameLevelInfo.name = gameAccount.displayName;
                    context.response.state.gameLevelInfo.program = gameAccount.entityId.high.getLowBitsUnsigned();

                    context.response.tags.gameLevelInfoTag = 0x5C46D483;
                }

                if(context.request.options.hasOwnProperty('fieldGameStatus')) {
                    context.response.state.gameStatus = gameStatus.create();
                    context.response.state.gameStatus.name = gameAccount.displayName;
                    context.response.state.gameStatus.program = gameAccount.entityId.high.getLowBitsUnsigned();
                    context.response.state.gameStatus.isBanned = gameAccount.isBanned;
                    context.response.state.gameStatus.isSuspended = gameAccount.isSuspended;

                    context.response.tags.gameStatusTag = 0x98B75F99;
                }

                return Promise.resolve(0);
            });
        });
    }
};