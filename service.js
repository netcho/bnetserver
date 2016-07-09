/**
 * Created by kaloyan on 8.7.2016 г..
 */
const ProtoBuf = require('protobufjs');

module.exports = class Service{
    constructor(name, socket) {
        var lookupName = name.substring(0,name.indexOf("Service")).toLowerCase();
        this.handler = {};
        this.clientSocket = socket;
        this.serviceHash = 0;
        this.servicePrototype = global.builder.lookup(".bgs.protocol."+lookupName+".v1."+name);

        for (var i = 0, len = this.servicePrototype.children.length; i < len; i++){
            const method = this.servicePrototype.children[i];
            this.handler[method.name] = {
                method_id:method.options['(method_id)'],
                callback: null
            };

            if (method.requestName.charAt(0) === ".")
                this.handler[method.name].requestName = method.requestName.substring(1);

            if (method.responseName.charAt(0) === ".")
                this.handler[method.name].responseName = method.responseName.substring(1);
        }
    }

    registerHandler(name,callback){
        this.handler[name].callback = callback;
    }
    
    handleData(requestHeader, data){
        for (const methodName in this.handler)
        {
            const handler = this.handler[methodName];
            if (handler.method_id == requestHeader.method_id){
                const request = global.builder.build(handler.requestName).decode(data);
                const responseType = global.builder.build(handler.responseName);
                var response = new responseType();

                var responseFields = global.builder.lookup(handler.responseName).getChildren(ProtoBuf.Reflect.Message.Field);
                responseFields.forEach(function(field){
                    if (field.resolvedType != null && field.required){
                        response[field.name] = new field.resolvedType.clazz;
                    }
                });

                var callbackResult = null;

                if (handler.callback)
                    callbackResult = handler.callback(request, response);

                if (handler.responseName != ".bgs.protocol.NO_RESPONSE"){
                    const Header = global.builder.build("bgs.protocol.Header");
                    var responseHeader = new Header();
                    var buffer = null;
                    var responseBuffer = null;

                    responseHeader.service_id = 0xFE;
                    responseHeader.token = requestHeader.token;

                    if (callbackResult == 0){
                        responseBuffer = response.encodeNB();
                        responseHeader.size = responseBuffer.length;
                    } else {
                        responseHeader.status = callbackResult;
                    }

                    const headerBuffer = responseHeader.encodeNB();

                    if(callbackResult == 0){
                        buffer = new Buffer(2+headerBuffer.length+responseBuffer.length);
                    } else {
                        buffer = new Buffer(2+headerBuffer.length);
                    }

                    buffer.writeUInt16BE(headerBuffer.length, 0);
                    headerBuffer.copy(buffer,2);

                    if(callbackResult == 0)
                        responseBuffer.copy(buffer, 2 + headerBuffer.length);

                    this.clientSocket.write(buffer);
                }
            }
        }
    }

    getServiceHash() {
        return this.serviceHash;
    }
};