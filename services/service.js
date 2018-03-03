/**
 * Created by kaloyan on 8.7.2016 г..
 */
'use strict';

const FNV = require('fnv').FNV;
const protobuf = require('protobufjs');

protobuf.load('proto/bnet/rcp_types.proto');
const Header = protobuf.lookupType('bgs.protocol.Header');

module.exports = class Service{
    constructor(file) {
        this.hash = 0;
        this.name = undefined;
        this.methods = [];
        this.handlers = [];

        protobuf.load(file, (err, root) => {
            if (err)
                throw err;

            for (let object in root.nestedArray){
                if (object.name.includes('Service')){
                    this.name = object.name;
                    let hash = new FNV();
                    hash.update(object.getOption('original_fully_qualified_descriptor_name'));
                    this.hash = parseInt(hash.digest('hex'), 16);

                    let service = new protobuf.Service(object.name);
                    this.methods = service.methodsArray;
                }
            }
        });
    }

    hash() {
        return this.hash;
    }

    registerHandler(name, handler) {
        for (let method in this.methods) {
            if (method.hasOwnProperty('name') && method.name === name) {
                this.handlers[method.getOption('method_id')] = handler;
            }
        }
    }

    handleCall(requestHeader, payload) {
        if (this.handlers[requestHeader.method_id] !== undefined) {
            let method = this.methods.find((element) => {
                return element.getOption('method_id') === requestHeader.method_id;
            });

            let response = protobuf.lookup(method.responseType).create();
            let status = this.handlers[requestHeader.method_id](protobuf.lookup(method.requestType).decode(payload),
                                                                response);

            if(method.responseType !== '.bgs.protocol.NO_RESPONSE') {
                let responseHeader = new Header();
                requestHeader.service_id = 0xFE;
                responseHeader.token = requestHeader.token;
                responseHeader.method_id = requestHeader.method_id;
                responseHeader.service_hash = requestHeader.service_hash;
                responseHeader.status = status;
                responseHeader.size = response.encode().length;
                let headerSize = responseHeader.encode().length;

                let buffer = Buffer.alloc(2+headerSize+responseHeader.size);
                buffer.writeUInt16BE(headerSize, 0);
                responseHeader.encode().copy(buffer, 2);
                response.encode().copy(buffer,2+headerSize);

                return buffer;
            }
        }
    }
};