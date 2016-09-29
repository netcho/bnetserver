/**
 * Created by kaloyan on 6.7.2016 г..
 */
const tls = require('tls');
const https = require('https');
const fs = require('fs');
const process = require('process');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const express = require('express');
var mongoose = require('mongoose');
mongoose.Promise = global.Promise;
const bodyParser = require('body-parser');
const ProtoBuf = require('protobufjs');
const redis = require('redis');
const accountSchema = require('./models/account.js').Schema;

var builder = ProtoBuf.newBuilder();
ProtoBuf.loadProtoFile("proto/bnet/account_service.proto", builder);
ProtoBuf.loadProtoFile("proto/bnet/authentication_service.proto", builder);
ProtoBuf.loadProtoFile("proto/bnet/challenge_service.proto", builder);
ProtoBuf.loadProtoFile("proto/bnet/connection_service.proto", builder);
ProtoBuf.loadProtoFile("proto/bnet/game_utilities_service.proto", builder);
ProtoBuf.loadProtoFile("proto/bnet/rcp_types.proto", builder);

global.builder = builder.resolveAll();
global.listenAddress = "192.168.1.4";
global.loginTickets = {};
global.onlineAccounts = {};

var redisHost = process.env.REDIS_HOST;
var redisPort = process.env.REDIS_PORT;

if (redisPort == undefined)
    redisPort = 6379;

if (redisHost == undefined)
    redisHost = "127.0.0.1";

global.redisConnection = redis.createClient({host: redisHost, port: redisPort});
global.connection = mongoose.createConnection("mongodb://localhost/battlenet");

const ConnectionService = require('./services/connection.js');
const AuthenticationService = require('./services/authentication.js');
const GameUtilitiesService = require('./services/game_utilities.js');
const AccountService = require('./services/account.js');

const server = tls.Server({
    key: fs.readFileSync("certs/server-key.pem"),
    cert: fs.readFileSync("certs/server-cert.pem")
}, function(socket){
    socket.requestToken = 0;
    socket.services = {};
    socket.responseCallbacks = {};

    const connectionService = new ConnectionService(socket);
    socket.services[connectionService.getServiceHash()] = connectionService;
    const authenticationService = new AuthenticationService(socket);
    socket.services[authenticationService.getServiceHash()] = authenticationService;
    const accountService = new AccountService(socket);
    socket.services[accountService.getServiceHash()] = accountService;
    const gameUtilitiesService = new GameUtilitiesService(socket);
    socket.services[gameUtilitiesService.getServiceHash()] = gameUtilitiesService;
    
    socket.on('data', function (data) {
        var bytesRead = socket.bytesRead;

        if (bytesRead >= 2){
            const headerSize = data.readUInt16BE(0);
            bytesRead -= 2;

            if (bytesRead >= headerSize){
                const header = builder.build("bgs.protocol.Header").decode(data.slice(2, 2+headerSize));

                if(header.service_id != 0xFE){
                    if (socket.services[header.service_hash] != undefined) {
                        socket.services[header.service_hash].handleData(header, data.slice(2+headerSize));
                    } else {
                        console.log("Received unregistered service");
                        console.log(header);
                    }
                } else if (socket.responseCallbacks[header.token] != undefined){
                    const response = socket.responseCallbacks[header.token];

                    if (response.callback != null)
                        response.callback(global.builder.build(response.responseName).decode(data.slice(2+headerSize)));

                }
            }
        }
    });
});

var rest = express();

rest.use(bodyParser.json());
/*rest.use('/assets', express.static(__dirname + '/public/assets'));
rest.set('views', __dirname + '/public/views');
rest.set('view engine', 'pug');*/

rest.get('/bnet/login/', function(req, res){
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.json({
        "type": 1,
        "inputs": [{
            "input_id": "account_name",
            "type": "text",
            "label": "E-mail",
            "max_length": 320
        }, {
            "input_id": "password",
            "type": "password",
            "label": "Password",
            "max_length": 16
        }, {
            "input_id": "log_in_submit",
            "type": "submit",
            "label": "Log In"
        }]
    });
});

rest.post('/bnet/login/', function (req, res) {
    var username = null;
    var password = null;

    res.setHeader('Content-Type', 'application/json');
    req.body.inputs.forEach(function (input) {
        if (input.input_id === 'account_name')
            username = input.value;

        if (input.input_id === 'password')
            password = input.value;
    });

    var loginResult = {};

    loginResult.authentication_state = "DONE";

    const accountModel = global.connection.model('Account', accountSchema);
    accountModel.findOne({email: username}, function (err, account) {
        if (err){
            loginResult.authentication_state = "LOGIN";
            console.log("Account "+username+" not found");
        }

        if (account){
            if(bcrypt.compareSync(password, account.hash)) {
                const loginTicket = "TC-"+crypto.randomBytes(20).toString('hex');
                loginResult.login_ticket = loginTicket;
                global.loginTickets[loginTicket] = account;
            }else{
                console.log("Failed logging attempt for account: "+username);
            }
        }

        res.json(loginResult);
    });
});

/*rest.get('/', function (req, res) {
    res.render('index', { title: 'Hey', message: 'Hello there!'});
});*/

const restServer = https.createServer({
    key: fs.readFileSync("certs/server-key.pem"),
    cert: fs.readFileSync("certs/server-cert.pem")
}, rest);

server.listen(1119, global.listenAddress, function (){
    console.log("Listening on port 1119");
});

restServer.listen(443, function () {
   console.log("REST Service listening");
});