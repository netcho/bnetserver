const Service = require('../service.js');

module.exports = class AccountService extends Service{
    constructor(socket){
        super("AccountService", socket);
        this.serviceHash = 0x62DA0891;

        this.registerHandler("GetAccountState", function(request, response, token, send){
            if(request.options.field_privacy_info){
                const PrivacyInfo = global.builder.build('bgs.protocol.account.v1.PrivacyInfo');
                response.state.privacy_info = new PrivacyInfo({ "is_using_rid": false,
                                                                "is_real_id_visible_for_view_friends": false,
                                                                "is_hidden_from_friend_finder": true  });

                response.tags.privacy_info_tag = 0xD7CA834D;
            }

            send(token, response);
        });

        this.registerHandler("GetGameAccountState", function(request, response, token, send){
            var gameAccount = socket.account.gameAccounts.find(function(account, index, array){
                return request.game_account_id.low.toNumber() == account.entityId.low &&
                       request.game_account_id.high.toNumber() == account.entityId.high;
            });
            
            if (gameAccount){
                if(request.options.field_game_level_info){
                    const GameLevelInfo = global.builder.build('bgs.protocol.account.v1.GameLevelInfo');
                    response.state.game_level_info = new GameLevelInfo({ "name": gameAccount.displayName,
                                                                         "program": gameAccount.entityId.high & 0xFFFFFFFF });
                    response.tags.game_level_info_tag = 0x5C46D483;
                }

                if(request.options.field_game_status){
                    const GameStatus = global.builder.build('bgs.protocol.account.v1.GameStatus');
                    response.state.game_status = new GameStatus({ "is_suspended": gameAccount.hasOwnProperty("isSuspended"),
                                                                   "is_banned": gameAccount.hasOwnProperty("isBanned"),
                                                                   "program": gameAccount.entityId.high & 0xFFFFFFFF });

                    response.tags.game_status_tag = 0x98B75F99;
                }

                send(token, response);
            }else{
                send(token, 0xC);
            }
        });
    }
};