/**
 * Created by kaloyan on 6.7.2016 г..
 */
const tls = require('tls');

const server = tls.Server();

server.on('secureConnection', function(peerSocket){

});

server.listen(1119, "0.0.0.0", function (){
    //do other initalization
    console.log("Listening on port 1119");
});