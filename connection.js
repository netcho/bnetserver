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
        this.keepaliveTimer = undefined;

        this.connectionService = new ConnectionService();

        this.exportedServices[0] = this.connectionService.getServiceHash();
        this.importedServices[this.connectionService.getServiceHash()] = this.connectionService;

        /*global.etcd.getAll().prefix('aurora/services/').keys().then((services) => {
            services.forEach((serviceKey) => {
                global.etcd.get(serviceKey).number().then((serviceId) => {
                    this.exportedServices.push(serviceId);
                });
            });
        });*/

        this.connectionService.registerHandler('Connect', (context) => {
            return global.amqpConnection.createChannel().then((channel) => {
                this.amqpChannel = channel;
                return Promise.resolve(channel);
            }).then((channel) => {
                return channel.assertQueue('', {autoDelete: true});
            }).then((result) => {
                this.queueName = result.queue;
                return this.amqpChannel.consume(result.queue, (message) => {
                    if (message.properties.correlationId) {
                        global.logger.info('Received request from backend');
                        if (message.properties.type !== '.bgs.protocol.NO_RESPONSE')
                            this.requests[this.requestToken] = message.properties.correlationId;

                        let requestHeader = Header.fromObject(message.properties.headers);
                        requestHeader.token = this.requestToken++;
                        if (!this.bindless) {
                            requestHeader.serviceId = this.importedServices[requestHeader.serviceHash];
                        } else {
                            requestHeader.serviceId = 0;
                        }
                        let requestBuffer = Buffer.from(message.content);
                        requestHeader.size = requestBuffer.length;

                        let headerBuffer = Header.encode(requestHeader).finish();
                        let buffer = Buffer.alloc(2 + headerBuffer.length + requestHeader.size);
                        buffer.writeUInt16BE(headerBuffer.length, 0);
                        headerBuffer.copy(buffer, 2);
                        requestBuffer.copy(buffer, 2+headerBuffer.length);
                        this.socket.write(buffer);
                    }
                    else {
                        this.socket.write(Buffer.from(message.content));
                    }
                    this.amqpChannel.ack(message);
                });
            }).then(()=>{
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

                this.keepaliveTimer = setTimeout(()=>{
                    global.logger.info('Closing connection due to exceeded timeout');
                    this.disconnect();
                }, 30*1000);

                this.state = ConnectionState.Connected;

                return Promise.resolve(0);
            });
        });

        this.connectionService.registerHandler('KeepAlive', ()=>{
            global.logger.info('Received KeepAlive on connection');

            clearTimeout(this.keepaliveTimer);
            this.keepaliveTimer = setTimeout(()=>{
                global.logger.info('Closing connection due to exceeded timeout');
                this.disconnect();
            }, 30*1000);

            return Promise.resolve(0);
        });

        this.connectionService.registerHandler('RequestDisconnect', (context) => {
            global.logger.info('Client requested disconnect with code: '+context.request.errorCode);
            clearTimeout(this.keepaliveTimer);
            this.disconnect();
            return Promise.resolve(0);
        });

        this.socket.on('data', (data) => {
            let bytesRead = this.socket.bytesRead;

            if (bytesRead >= 2) {
                const headerSize = data.readUInt16BE(0);
                bytesRead -= 2;

                if (bytesRead >= headerSize) {
                    const header = Header.decode(data.slice(2, 2+headerSize));

                    if (header.serviceId === 0xFE) {
                        let responseHash = header.servicHash;

                        if (!this.bindless) {
                            responseHash = this.importedServices[this.requests[header.token]];
                        }

                        global.logger.debug('Received response on service: '+responseHash+' with methodId: '+header.methodId);

                        this.amqpChannel.publish('battlenet_aurora_bus', responseHash.toString(), data.slice(2+headerSize),
                            { headers: header, requestId: this.requests[header.token] });
                    } else {
                        global.logger.debug('Received request on service: '+header.serviceHash+' with methodId: '+header.methodId);

                        let requestHash = header.serviceHash;

                        if (!this.bindless) {
                            requestHash = this.exportedServices[header.serviceId];
                        }

                        if (requestHash === this.connectionService.getServiceHash()){
                            let context = {
                                queueName: this.queueName,
                                header: header,
                                request: null,
                                response: null
                            };
                            this.connectionService.handleCall(context, data.slice(2+headerSize)).then((buffer)=>{
                                this.socket.write(buffer);
                            }).catch((error) => {
                                global.logger.error('Error: '+error+' when calling method: '+header.methodId);
                            });
                        }
                        else if (requestHash) {
                            this.amqpChannel.publish('battlenet_aurora_bus', requestHash.toString(), data.slice(2+headerSize),
                                { headers: Header.toObject(header), replyTo: this.queueName });
                        } else {
                            //send error ERROR_RPC_INVALID_SERVICE
                        }
                    }
                }
            }
        });
    }

    disconnect() {
        //this.amqpChannel.close();
        this.socket.end();
    }
};