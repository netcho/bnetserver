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

const rootNamespace = protobuf.loadSync('proto/bnet/rpc_types.proto');
const Header = rootNamespace.lookupType('bgs.protocol.Header');
const ProcessId = rootNamespace.lookupType('bgs.protocol.ProcessId');

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

        this.exportedServices[0] = connectionService;
        this.importedServices[connectionService.getServiceHash()] = connectionService;

        global.etcd.getAll().prefix('aurora/services/').keys().then((services) => {
            services.forEach((serviceKey) => {
                global.etcd.get(serviceKey).number().then((serviceId) => {
                    this.exportedServices.push(serviceId);
                });
            });
        });

        connectionService.registerHandler('Connect', (context) => {
            if(context.request.clientId !== null) {
                this.clientId = context.request.clientId;
                context.response.client_id = context.request.clientId;
            }

            if (context.response.useBindlessRpc !== null) {
                this.bindless = context.request.useBindlessRpc;
            }

            context.response.serverId = ProcessId.create();
            context.response.serverId.label = process.pid;
            context.response.serverId.epoch = Math.floor(Date.now());
            context.response.serverTime = microtime.now();
            context.response.useBindlessRpc = this.bindless;

            if (!this.bindless) {
                for (let boundService in context.request.bindRequest.importedService) {
                    context.response.bindResponse.importedServiceId.push(this.exportedServices.findIndex((serviceHash) =>
                    {return serviceHash === boundService.hash}));
                }

                for(let boundService in context.request.bindRequest.exportedService) {
                    this.importedServices[boundService.hash] = boundService.id;
                }

                context.response.bindResult = 0;
            }

            global.amqpConnection.createChannel().then((channel) => {
                this.amqpChannel = channel;
                channel.assertQueue('', {autoDelete: true}).then((ok) => {
                    this.queueName = ok.queue;
                    channel.consume(ok.queue).then((message) => {
                        if(message.hasOwnProperty('properties')){
                            if (message.properties.hasOwnProperty('requestId')) {
                                this.requests[this.requestToken] = message.properties.requestId;

                                let requestHeader = Header.fromObject(message.properties.headers);
                                requestHeader.token = this.requestToken++;
                                if (!this.bindless) {
                                    requestHeader.serviceId = this.importedServices[requestHeader.serviceHash];
                                } else {
                                    requestHeader.serviceId = 0;
                                }
                                requestHeader.size = message.content.length;

                                let headerSize = requestHeader.encode().length;
                                let buffer = Buffer.alloc(2+headerSize+requestHeader.size);
                                buffer.writeUInt16BE(headerSize);
                                requestHeader.encode().copy(buffer, 2);
                                message.content.copy(buffer, 2+headerSize);
                                this.socket.write(buffer);
                            }
                            else {
                                this.socket.write(message.content);
                            }
                            channel.ack(message);
                        }
                    });
                })
            });

            this.state = ConnectionState.Connected;

            return 0;
        });

        this.socket.on('data', (data) => {
            let bytesRead = this.socket.bytesRead;

            if (bytesRead >= 2) {
                const headerSize = data.readUInt16BE(0);
                bytesRead -= 2;

                if (bytesRead >= headerSize) {
                    const header = Header.decode(data.slice(2, 2+headerSize));

                    if (header.serviceId === 0xFE) {
                        var responseHash = header.servicHash;

                        if (!this.bindless) {
                            responseHash = this.importedServices[this.requests[header.token]];
                        }

                        global.logger.debug('Received response on service: '+requestHash+' with methodId: '+header.methodId);

                        this.amqpChannel.publish('battlenet_aurora_bus', responseHash.toString(), data,
                            { headers: header.toObject(),
                                requestId: this.requests[header.token] });
                    } else {
                        if (header.serviceId === 0) {
                            let buffer = this.exportedServices[header.serviceId].handleCall(header, data.slice(2+headerSize));
                            this.socket.write(buffer);
                        } else {
                            var requestHash = header.serviceHash;

                            if (!this.bindless) {
                                requestHash = this.exportedServices[header.serviceId];
                            }

                            global.logger.debug('Received request on service: '+requestHash+' with methodId: '+header.methodId);

                            if (requestHash) {
                                this.amqpChannel.publish('battlenet_aurora_bus', requestHash.toString(), data,
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
    }
};