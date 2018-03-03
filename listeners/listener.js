/**
 * Created by kaloyan on 10.7.2016 г..
 */
'use strict';

/*module.exports = function(name, hash, socket){
    const fullName = 'bgs.protocol.'+name+'.v1.'+name.charAt(0).toUpperCase() + name.slice(1)+'Listener';
    const serviceType = global.builder.build(fullName);
    const listener = new serviceType(function(methodName, request, callback = null){
        socket.responseCallbacks[socket.requestToken] = {};
        socket.responseCallbacks[socket.requestToken].callback = callback;
        const Header = global.builder.build("bgs.protocol.Header");
        const requestHeader = new Header();
        requestHeader.service_id = 0;
        requestHeader.service_hash = hash;
        requestHeader.token = socket.requestToken;

        const servicePrototype = global.builder.lookup(fullName);
        for (var i = 0, len = servicePrototype.children.length; i < len; i++) {
            const method = servicePrototype.children[i];
            if(("."+fullName+"."+method.name) === methodName){
                requestHeader.method_id = method.options['(method_id)'];

                if (method.responseName.charAt(0) === ".")
                    socket.responseCallbacks[socket.requestToken].responseName = method.responseName.substring(1);
            }
        }

        const requestBuffer = request.encodeNB();
        requestHeader.size = requestBuffer.length;

        const headerBuffer = requestHeader.encodeNB();

        const buffer = new Buffer(2+headerBuffer.length+requestBuffer.length);
        buffer.writeUInt16BE(headerBuffer.length, 0);
        headerBuffer.copy(buffer,2);
        requestBuffer.copy(buffer, 2 + headerBuffer.length);

        socket.write(buffer);
        socket.requestToken++;
    });

    return listener;
};*/

const FNV = require('fnv').FNV;
const protobuf = require('protobufjs');

protobuf.load('proto/bnet/rcp_types.proto');
const Header = protobuf.lookupType('bgs.protocol.Header');

module.exports = class Listener{
    constructor(file) {
        this.hash = 0;
        this.name = undefined;
        this.methods = [];
        this.callbacks = [];
        this.clientQueueName = undefined;

        protobuf.load(file, (err, root) => {
            if (err)
                throw err;

            for (let object in root.nestedArray){
                if (object.name.includes('Listener')){
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

    setQueueName(queueName) {
        this.clientQueueName = queueName;
    }

    call(methodName, call){
        let method = this.methods.find((element) => {
            return element.name === methodName;
        });

        let request = new protobuf.lookup(method.requestType);
        call(request);
        let requestHeader = new Header();
        requestHeader.service_hash = this.hash;
        requestHeader.method_id = method.getOption('method_id');
        requestHeader.size = request.encode().length;

    }
};