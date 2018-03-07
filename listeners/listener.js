/**
 * Created by kaloyan on 10.7.2016 г..
 */
'use strict';

const FNV = require('fnv').FNV;
const protobuf = require('protobufjs');
const uuid = require('uuid/v4');

const Header = protobuf.loadSync('proto/bnet/rpc_types.proto').lookupType('bgs.protocol.Header');

module.exports = class Listener {
    constructor(name, file) {
        this.hash = 0;
        this.name = name;
        this.methods = [];
        this.callbacks = {};
        this.clientQueueName = undefined;
        this.amqpChannel = undefined;

        protobuf.load(file, (err, root) => {
            if (err)
                throw err;

            let service = root.lookupService(this.name);
            this.methods = service.methodsArray;

            let hash = new FNV();
            hash.update(service.getOption('(original_fully_qualified_descriptor_name)'));
            this.hash = parseInt(hash.digest('hex'), 16);

            global.amqpConnection.createChannel().then((channel) => {
                this.amqpChannel = channel;
                channel.assertQueue('', {autoDelete: true}).then((ok) => {
                    channel.bindQueue(ok.queue, 'battlenet_aurora_bus', this.getServiceHash().toString()).then(() => {
                        channel.consume(ok.queue, (message) => {
                            if (message.properties.requestId !== undefined) {
                                let method = this.methods.find((element) => {
                                    return element.getOption('(method_id)') === message.properties.header.method_id;
                                });
                                let response = protobuf.lookupType(method.responseType).decode(message.content);
                                this.callbacks[message.properties.requestId](response);
                            }
                        });
                    });
                });
            });
        });
    }

    getServiceHash() {
        return this.hash;
    }

    setQueueName(queueName) {
        this.clientQueueName = queueName;
    }

    call(methodName, call, callback){
        let method = this.methods.find((element) => {
            return element.name === methodName;
        });

        let requestId = uuid();
        let request = new protobuf.lookup(method.requestType);
        call(request);
        let header = new Header();
        header.service_hash = this.hash;
        header.method_id = method.getOption('(method_id)');
        header.size = request.encode().length;

        this.amqpChannel.sendToQueue(this.clientQueueName, request.encode(),
            {
                headers: header.toObject(),
                requestId: requestId
            }, () => {
            this.callbacks[requestId] = callback;
        });
    }
};