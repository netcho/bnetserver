/**
 * Created by kaloyan on 10.7.2016 г..
 */
const Challenge = require("./challenge.js");
const Service = require("../service.js");

module.exports = class AuthenticationService extends Service{
    constructor(socket){
        super("AuthenticationService", socket);
        this.serviceHash = 0xDECFC01;
        var challengeListener = Challenge.listener(socket);
        this.challengeListener = challengeListener;

        this.registerHandler("Logon", function (request, response) {
            const externalRequest = global.builder.build('bgs.protocol.challenge.v1.ChallengeExternalRequest');
            challengeListener.OnExternalRequest(new externalRequest({
                "payload_type": "web_auth_url",
                "payload": Buffer("https://192.168.1.4/bnet/login/")
            }));
            return 0;
        });
    }
};