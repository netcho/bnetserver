/**
 * Created by kaloyan on 10.7.2016 г..
 */
const crypto = require('crypto');
const ByteBuffer = require('bytebuffer');
const Listener = require('../listener.js');
const Service = require("../service.js");

module.exports = class AuthenticationService extends Service{
    constructor(socket){
        super("AuthenticationService", socket);
        this.serviceHash = 0xDECFC01;
        const challengeListener = Listener('challenge', 0xBBDA171F, socket);
        const authenticationListener = Listener('authentication', 0x71240E35, socket);
        
        this.registerHandler("Logon", function (request, response, token, send) {
            const externalRequest = global.builder.build('bgs.protocol.challenge.v1.ChallengeExternalRequest');
            challengeListener.OnExternalChallenge(new externalRequest({
                "payload_type": "web_auth_url",
                "payload": Buffer.from("https://192.168.1.4:443/bnet/login/")
            }), function(response){
                console.log("Response for OnExternalChallenge");
            });

            send(token, response);
        });

        this.registerHandler("VerifyWebCredentials", function (request, response, token, send) {
            const loginTicket = request.web_credentials.toBuffer().toString();
            const account = global.loginTickets[loginTicket];
            if(account != undefined){
                console.info("Successfully authenticated ");
                const logonResult = global.builder.build('bgs.protocol.authentication.v1.LogonResult');
                const entityId = global.builder.build('bgs.protocol.EntityId');

                socket.account = account;

                var sessionKey = crypto.randomBytes(64).toString('hex');
                var gameAccounts = [];

                account.gameAccounts.forEach(function (gameAccount) {
                   gameAccounts.push(new entityId({ "high": gameAccount.entityId.high, "low": gameAccount.entityId.low }));
                });
                
                //determine the region here by using GeoIP, we'll stick with europe for now
                
                authenticationListener.OnLogonComplete(new logonResult({
                    "error_code" : 0,
                    "geoip_country": account.country,
                    "account_id": new entityId({ "high": account.accountId.high, "low": account.accountId.low }),
                    "game_account_id": gameAccounts,
                    "session_key": sessionKey
                }), function(response){

                });

                global.onlineAccounts[account.email] = account;
                delete global.loginTickets[loginTicket];

                send(token, response);
            }else{
                send(token, 0x3);
            }
        });
    }
};