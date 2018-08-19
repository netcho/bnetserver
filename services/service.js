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

    registerHandler(name, handler) {
        this.methods.forEach((method) => {
            if (method.hasOwnProperty('name') && method.name === name) {
                this.handlers[method.getOption('(method_id)')] = handler;
            }
        });
    }

    handleCall(context, payload) {
        if (this.handlers[context.header.methodId] !== undefined) {
            let method = this.methods.find((element) => {
                return element.getOption('(method_id)') === context.header.methodId;
            });

            let responseType = this.rootNamespace.lookupType(method.responseType);
            let requestType = this.rootNamespace.lookupType(method.requestType);

            context.response = responseType.create();

            if (method.requestType !== '.bgs.protocol.NoData') {
                context.request = requestType.decode(payload);
            }

            return this.handlers[context.header.methodId](context).then((status) => {
                if (status === 0) {
                    if(method.responseType !== '.bgs.protocol.NO_RESPONSE') {
                        let responseBuffer = responseType.encode(context.response).finish();
                        let responseHeader = Header.create();
                        responseHeader.serviceId = 0xFE;
                        responseHeader.serviceHash = context.header.serviceHash;
                        responseHeader.methodId = context.header.methodId;
                        responseHeader.token = context.header.token;
                        responseHeader.status = status;
                        responseHeader.size = responseBuffer.length;

                        let headerBuffer = Header.encode(responseHeader).finish();

                        let buffer = Buffer.alloc(2 + headerBuffer.length + responseBuffer.length);
                        buffer.writeUInt16BE(headerBuffer.length, 0);
                        headerBuffer.copy(buffer, 2);
                        responseBuffer.copy(buffer,2+headerBuffer.length);

                        return Promise.resolve(buffer);
                    }
                }
            });
        }
        else {
            return Promise.reject(0x00000BC3);
        }
    }
};