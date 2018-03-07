/**
 * Created by kaloyan on 8.7.2016 г..
 */
'use strict';

const Service = require("./service.js");

module.exports = class ConnectionService extends Service{
    constructor(){
        super('ConnectionService', 'proto/bnet/connection_service.proto');
    }
};
