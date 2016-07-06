/**
 * Created by kaloyan on 6.7.2016 г..
 */
const tls = require('tls');
const fs = require('fs');

const server = tls.Server({
    key: fs.readFileSync("certs/server-key.pem"),
    cert: fs.readFileSync("certs/server-cert.pem")
}, function(peerSocket){

});

server.listen(1119, "0.0.0.0", function (){
    //do other initalization
    console.log("Listening on port 1119");
});