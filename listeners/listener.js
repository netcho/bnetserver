/**
 * Created by kaloyan on 10.7.2016 г..
 */
'use strict';

const FNV = require('fnv').FNV;
const uuid = require('uuid/v4');
const protobuf = require('protobufjs');

const Header = protobuf.loadSync('proto/bnet/rpc_types.proto').lookupType('bgs.protocol.Header');

module.exports = class Listener {
    constructor(name, file) {
        this.hash = 0;
        this.name = name;
        this.methods = [];
        this.callbacks = {};
        this.clientQueueName = undefined;
        this.amqpChannel = undefined;
        this.queueName = undefined;
        this.rootNamespace = protobuf.loadSync(file);

        let service = this.rootNamespace.lookupService(this.name);
        this.methods = service.methodsArray;

        let hash = new FNV();
        hash.update(service.getOption('(original_fully_qualified_descriptor_name)'));
        this.hash = parseInt(hash.digest('hex'), 16);

        global.amqpConnection.createChannel().then((channel) => {
            this.amqpChannel = channel;
            return Promise.resolve(channel);
        }).then((channel) => {
           return channel.assertQueue('', {autoDelete: true});
        }).then((result) => {
            this.queueName = result.queue;
            return this.amqpChannel.bindQueue(result.queue, 'battlenet_aurora_bus', this.hash.toString());
        }).then(()=>{
            this.amqpChannel.consume(this.queueName, (message) => {
                if (message.properties.requestId !== undefined) {
                    let method = this.methods.find((element) => {
                        return element.getOption('(method_id)') === message.properties.headers.methodId;
                    });
                    let response = this.rootNamespace.lookupType(method.responseType).decode(message.content);
                    this.callbacks[message.properties.requestId](response);
                }
            });
        });
    }

    call(methodName, context, call, callback = undefined){
        let method = this.methods.find((element) => {
            return element.name === methodName;
        });

        let requestId = uuid();
        let requestType = this.rootNamespace.lookupType(method.requestType);
        let request = requestType.create();
        call(request);
        let requestBuffer = requestType.encode(request).finish();
        let header = Header.create();
        header.serviceHash = this.hash;
        header.methodId = method.getOption('(method_id)');
        header.size = requestBuffer.length;

        this.amqpChannel.sendToQueue(context.queueName, requestBuffer,
            {
                headers: Header.toObject(header),
                correlationId: requestId,
                type: method.responseType
            }, () => {
            if (method.responseType !== '.bgs.protocol.NO_RESPONSE') {
                this.callbacks[requestId] = callback;
            }
        });
    }
};