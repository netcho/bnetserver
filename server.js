/**
 * Created by kaloyan on 6.7.2016 г..
 */
const tls = require('tls');
const https = require('https');
const querystring = require('querystring');
const fs = require('fs');
const crypto = require('crypto');
const ProtoBuf = require('protobufjs');
//const Session = require('./session.js');
const ConnectionService = require('./services/connection.js');

var builder = ProtoBuf.newBuilder();
//ProtoBuf.loadProtoFile("proto/bnet/account_service.proto", builder);
//ProtoBuf.loadProtoFile("proto/bnet/authentication_service.proto", builder);
//ProtoBuf.loadProtoFile("proto/bnet/challenge_service.proto", builder);
ProtoBuf.loadProtoFile("proto/bnet/rcp_types.proto", builder);
ProtoBuf.loadProtoFile("proto/bnet/connection_service.proto", builder);

global.builder = builder.resolveAll();
global.listenAddress = "192.168.1.4";
global.loginTickets = {};

const server = tls.Server({
    key: fs.readFileSync("certs/server-key.pem"),
    cert: fs.readFileSync("certs/server-cert.pem")
}, function(socket){
    socket.services = {};
    const connectionService = new ConnectionService(socket);
    socket.services[connectionService.getServiceHash()] = connectionService;
    
    socket.on('data', function (data) {
        var bytesRead = socket.bytesRead;

        if (bytesRead >= 2){
            const headerSize = data.readUInt16BE(0);
            bytesRead -= 2;

            if (bytesRead >= headerSize){
                const header = builder.build("bgs.protocol.Header").decode(data.slice(2, 2+headerSize));
                //console.log(header);

                if (header.service_id != 0xFE){
                    socket.services[header.service_hash].handleData(header.method_id, data.slice(2+headerSize),header.token);
                }
            }
        }
    });
});

function processPost(request, response, callback) {
    var queryData = "";
    if(typeof callback !== 'function') return null;

    if(request.method == 'POST') {
        request.on('data', function(data) {
            queryData += data;
            if(queryData.length > 1e6) {
                queryData = "";
                response.writeHead(413, {'Content-Type': 'text/plain'}).end();
                request.connection.destroy();
            }
        });

        request.on('end', function() {
            request.post = querystring.parse(queryData);
            callback();
        });

    } else {
        response.writeHead(405, {'Content-Type': 'text/plain'});
        response.end();
    }
}

function checkCredentials(username, password){
    return 0;
}

const restServer = https.createServer({
    key: fs.readFileSync("certs/server-key.pem"),
    cert: fs.readFileSync("certs/server-cert.pem")
}, function(req, res){
    processPost(req, res, function(){
        if (req.url == "/bnet/login"){
            var loginResult = {};
            loginResult.authentication_state = 1;
            loginInput = JSON.parse(req.post);
            //to see how to get them exactly
            console.log(loginInput);
            const result = checkCredentials(loginInput.inputs["account_name"], loginInput.inputs["password"]);

            if(!result){
                loginResult.authentication_state = 4;
                loginResult.login_ticket = "TC-"+crypto.randomBytes(20).toString('hex');
                global.loginTickets[loginResult.login_ticket] = loginInput.inputs["account_name"];
            }
        } else {
            res.writeHead(404, {'Content-Type': 'text/plain'});
            res.end();
        }
    });
});

server.listen(1119, global.listenAddress, function (){
    //do other initalization
    console.log("Listening on port 1119");

    restServer.listen(443, global.listenAddress, function (){
        console.log("Login REST service listening");
    });
});