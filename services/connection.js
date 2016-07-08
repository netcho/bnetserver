/**
 * Created by kaloyan on 8.7.2016 г..
 */
const process = require("process");
const Service = require("../service.js");

module.exports = class ConnectionService extends Service{
    constructor(socket){
        super("ConnectionService", socket);
        
        this.serviceHash = 0x65446991;
        
        this.registerHandler("Connect", function(request, response){
            //console.log(request);
            console.log(response);
            response.server_id.label = process.pid;
            response.server_id.epoch = Date.now();
            response.use_bindless_rpc = request.use_bindless_rpc;

            this.timeout = setTimeout(function(){

            }, 15*1000);
        });

        this.registerHandler("KeepAlive", function (request, response) {
            this.timeout.clearTimeout();
        });
    }
};
