const protobuf = require('protobufjs');

const Service = require('./service.js');

const accountTypes = protobuf.loadSync('proto/bnet/account_types.proto');

const PrivacyInfo = accountTypes.lookupType('bgs.protocol.account.v1.PrivacyInfo');
const AccountState = accountTypes.lookupType('bgs.protocol.account.v1.AccountState');
const AccountTags = accountTypes.lookupType('bgs.protocol.account.v1.AccountFieldTags');
const GameAccountState = accountTypes.lookupType('bgs.protocol.account.v1.GameAccountState');
const GameAccountTags = accountTypes.lookupType('bgs.protocol.account.v1.GameAccountFieldTags');
const GameLevelInfo = accountTypes.lookupType('bgs.protocol.account.v1.GameLevelInfo');
const GameStatus = accountTypes.lookupType('bgs.protocol.account.v1.GameStatus');

const models = require('../models');

module.exports = class AccountService extends Service{
    constructor(){
        super('AccountService', 'proto/bnet/account_service.proto');

        this.registerHandler('GetAccountState', (context) => {
            context.response.state = AccountState.create();
            context.response.tags = AccountTags.create();

            if (context.request.hasOwnProperty('fieldPrivacyInfo')) {
                context.response.state.privacyInfo = PrivacyInfo.create();
                context.response.state.privacyInfo.isUsingRid = false;
                context.response.state.privacyInfo.isReadIdVisibleForViewFriends = false;
                context.response.state.privacyInfo.isHiddenFromFriendFinder = true;

                context.response.tags.privaceInfoTag = 0xD7CA834D;
            }

            return Promise.resolve(0);
        });

        this.registerHandler('GetGameAccountState', (context) => {
            context.response.state = GameAccountState.create();
            context.response.tags = GameAccountTags.create();

            return models.GameAccount.findById(context.request.gameAccountId.low.toString()).then((gameAccount) => {
                if(context.request.options.hasOwnProperty('fieldGameLevelInfo')) {
                    context.response.state.gameLevelInfo = GameLevelInfo.create();
                    context.response.state.gameLevelInfo.name = gameAccount.displayName;
                    context.response.state.gameLevelInfo.program = gameAccount.entityId.high.getLowBitsUnsigned();

                    context.response.tags.gameLevelInfoTag = 0x5C46D483;
                }

                if(context.request.options.hasOwnProperty('fieldGameStatus')) {
                    context.response.state.gameStatus = GameStatus.create();
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