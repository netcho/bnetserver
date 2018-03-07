/**
 * Created by kaloyan on 8.7.2016 г..
 */
'use strict';

const FNV = require('fnv').FNV;
const protobuf = require('protobufjs');

const Header = protobuf.loadSync('proto/bnet/rpc_types.proto').lookupType('bgs.protocol.Header');

module.exports = class Service{
    constructor(name, file) {
        this.hash = 0;
        this.name = name;
        this.clientQueueName = undefined;
        this.methods = [];
        this.handlers = [];
        this.rootNamespace = protobuf.loadSync(file);

        let service = this.rootNamespace.lookupService(this.name);

        this.methods = service.methodsArray;

        let hash = new FNV();
        hash.update(service.getOption('(original_fully_qualified_descriptor_name)'));
        this.hash = parseInt(hash.digest('hex'), 16);
    }

    getServiceHash() {
        return this.hash;
    }

    getServiceName() {
        return this.name;
    }

    setClientQueueName(name) {
        this.clientQueueName = name;
    }

    registerHandler(name, handler) {
        this.methods.forEach((method) => {
            if (method.hasOwnProperty('name') && method.name === name) {
                this.handlers[method.getOption('(method_id)')] = handler;
            }
        });
    }

    handleCall(requestHeader, payload) {
        if (this.handlers[requestHeader.methodId] !== undefined) {
            let method = this.methods.find((element) => {
                return element.getOption('(method_id)') === requestHeader.methodId;
            });

            let responseType = this.rootNamespace.lookupType(method.responseType);
            let requestType = this.rootNamespace.lookupType(method.requestType);

            let context = {
                response: responseType.create(),
                request: requestType.decode(payload),
                clientQueueName: this.clientQueueName
            };

            let status = this.handlers[requestHeader.methodId](context);
            let responseBuffer = responseType.encode(context.response).finish();

            if(method.responseType !== '.bgs.protocol.NO_RESPONSE') {
                let responseHeader = Header.create();
                requestHeader.serviceId = 0xFE;
                responseHeader.token = requestHeader.token;
                responseHeader.methodId = requestHeader.methodId;
                responseHeader.serviceHash = requestHeader.serviceHash;
                responseHeader.status = status;
                responseHeader.size = responseBuffer.length;

                let headerBuffer = Header.encode(responseHeader).finish();

                let buffer = Buffer.alloc(2 + headerBuffer.length + responseBuffer.length);
                buffer.writeUInt16BE(headerBuffer.length, 0);
                headerBuffer.copy(buffer, 2);
                responseBuffer.copy(buffer,2+headerBuffer.length);

                return buffer;
            }
        }
    }
};