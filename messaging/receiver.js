'use strict';

const protobuf = require('protobufjs');

const Header = protobuf.loadSync('proto/bnet/rpc_types.proto').lookupType('bgs.protocol.Header');

module.exports = class Receiver{
    constructor(service){
        this.amqpChannel = undefined;
        global.amqpConnection.createChannel().then((channel) => {
            this.amqpChannel = channel;
            return Promise.resolve(channel);
        }).then((channel) => {
            return channel.assertExchange('battlenet_aurora_bus', 'direct');
        }).then(() => {
            return this.amqpChannel.assertQueue('', {autoDelete: true});
        }).then((result) => {
            this.amqpChannel.bindQueue(result.queue, 'battlenet_aurora_bus', service.getServiceHash().toString());
            return Promise.resolve(result.queue);
        }).then((queueName) => {
            global.aerospike.put(service.getServiceKey(), {hash: service.getServiceHash()});
            global.logger.info(service.getServiceName()+' listening');
            this.amqpChannel.consume(queueName, (message) => {
                let context = {
                    queueName: message.properties.replyTo,
                    header: message.properties.headers,
                    request: null,
                    response: null
                };
                service.handleCall(context, message.content).then((buffer) => {
                    this.amqpChannel.sendToQueue(message.properties.replyTo, buffer);
                }).catch((error) => {
                    if (!Number.isNaN(error)) {
                        let errorHeader = Header.fromObject(message.properties.headers);
                        errorHeader.serviceId = 0xFE;
                        errorHeader.status = error;
                        errorHeader.size = 0;
                        let headerBuffer = Header.encode(errorHeader).finish();
                        let buffer = Buffer.alloc(2 + headerBuffer.length);
                        buffer.writeUInt16BE(headerBuffer.length, 0);
                        headerBuffer.copy(buffer, 2);
                        this.amqpChannel.sendToQueue(message.properties.replyTo, buffer);
                    }
                    else {
                        global.logger.error(error);
                    }
                });
            });
        });
    }
};