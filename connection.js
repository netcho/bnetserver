'use strict';
const process = require('process');
const microtime = require('microtime');
const protobuf = require('protobufjs');
const ConnectionService = require('./services/connection.js');

const ConnectionState = {
    New: 0,
    Connected: 1,
    Disconnecting: 2,
    Disconnected: 3
};

protobuf.load('proto/bnet/rcp_types.proto');
const Header = protobuf.lookupType('bgs.protocol.Header');
//const ProcessId = protobuf.lookupType('bgs.protocol.ProcessId');

module.exports = class Connection{
    constructor(socket){
        this.socket = socket;
        this.bindless = false;
        this.state = ConnectionState.New;
        this.requestToken = 0;
        this.requests = [];
        this.importedServices = {};
        this.exportedServices = [];
        this.clientId = undefined;
        this.amqpChannel = undefined;
        this.queueName = undefined;

        let connectionService = new ConnectionService();

        global.redisConnection.smembers('battlenet_services').then((services) =>
        {
            this.exportedServices = services;
            this.exportedServices[0] = connectionService;
            this.importedServices[connectionService.hash()] = connectionService;
        });

        this.socket.on('data', (data) => {
            let bytesRead = this.socket.bytesRead;

            if (bytesRead >= 2) {
                const headerSize = data.readUInt16BE(0);
                bytesRead -= 2;

                if (bytesRead >= headerSize) {
                    const header = Header.decode(data.slice(2, headerSize));
                    global.logger.debug('Received a new RPC message:' + header.toObject().toString());

                    if (header.service_id === 0xFE) {
                        var responseHash = 0;

                        if (this.bindless) {
                            responseHash = this.requests[header.token];
                        } else {
                            responseHash = this.importedServices[this.requests[header.token]];
                        }
                        this.amqpChannel.publish('battlenet_aurora_bus', responseHash, data,
                            { headers: header.toObject(),
                              replyTo: this.queueName });
                    } else {
                        if (header.service_id === 0) {
                            let buffer = this.exportedServices[header.service_id].handleCall(header, data.slice(2+headerSize));
                            this.socket.write(buffer);
                        } else {
                            var requestHash = 0;

                            if (this.bindless) {
                                requestHash = header.service_hash;
                            } else {
                                requestHash = this.exportedServices[header.service_id];
                            }

                            if (requestHash) {
                                this.amqpChannel.publish('battlenet_aurora_bus', requestHash, data,
                                    { headers: header.toObject(),
                                      replyTo: this.queueName });
                            } else {
                                //send error ERROR_RPC_INVALID_SERVICE
                            }
                        }
                    }
                }
            }
        });

        connectionService.registerHandler('Connect', (request, response) => {
            this.bindless = request.use_bindless_rpc;
            this.clientId = request.client_id;

            response.client_id = request.client_id;
            response.server_id.label = process.pid;
            response.server_id.epoch = Math.floor(Date.now());
            response.server_time = microtime.now();
            response.use_bindless_rpc = this.bindless;

            if (!this.bindless) {
                for (let boundService in request.bind_request.imported_service) {
                    response.bind_response.imported_service_id.push(this.exportedServices.findIndex((serviceHash) =>
                    {return serviceHash === boundService.hash}));
                }

                for(let boundService in request.bind_request.exported_service) {
                    this.importedServices[boundService.hash] = boundService.id;
                }

                response.bind_result = 0;
            }

            global.amqpConnection.createChannel((channel) => {
                this.amqpChannel = channel;
                channel.assertQueue('', {autoDelete: true}).then((ok) => {
                    this.queueName = ok.queue;
                    channel.consume(ok.queue, (message) => {
                        this.socket.write(message.content);
                        channel.ack(message);
                    });
                })
            });

            this.state = ConnectionState.Connected;
        });
    }
};