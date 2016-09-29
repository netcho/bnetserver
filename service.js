/**
 * Created by kaloyan on 8.7.2016 г..
 */
const ProtoBuf = require('protobufjs');
const fs = require('fs');
const zlib = require('zlib');

/*function getElementName(element)
{
    var parentName = element.parent != null ? getElementName(element.parent) + "." : "";
    return parentName + element.name;
}

function constructElements(message, messageName){
    var fields = global.builder.lookup(messageName).getChildren(ProtoBuf.Reflect.Message.Field);
    fields.forEach(function (field) {
        if (field.resolvedType instanceof ProtoBuf.Reflect.Message && field.required){
            this[field.name] = new field.resolvedType.clazz({});
            constructElements(this[field.name], getElementName(field.resolvedType));
        }
    }, message);
}*/

module.exports = class Service{
    constructor(name, socket, packageName = null) {
        var lookupName = null;
        
        if (packageName)
            lookupName = packageName;
        else
            lookupName = name.substring(0,name.indexOf("Service")).toLowerCase();

        this.handler = {};
        this.clientSocket = socket;
        this.serviceHash = 0;
        this.servicePrototype = global.builder.lookup(".bgs.protocol."+lookupName+".v1."+name);

        for (var i = 0, len = this.servicePrototype.children.length; i < len; i++){
            const method = this.servicePrototype.children[i];
            this.handler[method.name] = {
                method_id: method.options['(method_id)'],
                callback: null
            };

            if (method.requestName.charAt(0) === ".")
                this.handler[method.name].requestName = method.requestName.substring(1);

            if (method.responseName.charAt(0) === ".")
                this.handler[method.name].responseName = method.responseName.substring(1);
        }
    }

    registerHandler(name, callback){
        this.handler[name].callback = callback;
    }

    handleData(requestHeader, data){
        for (const methodName in this.handler)
        {
            const handler = this.handler[methodName];
            if (handler.method_id == requestHeader.method_id){
                const requestType = global.builder.build(handler.requestName);
                const request = requestType.decode(data);
                const responseType = global.builder.build(handler.responseName);
                var response = new responseType();

                var responseFields = global.builder.lookup(handler.responseName).getChildren(ProtoBuf.Reflect.Message.Field);
                responseFields.forEach(function(field){
                    if (field.resolvedType != null && field.resolvedType.className === "Message"){
                        response[field.name] = new field.resolvedType.clazz();
                    }
                });

                if (handler.callback)
                    handler.callback(request, response, requestHeader.token, this.send.bind(this));
            }
        }
    }

    send(token, response, status = 0){
        if (!isNaN(response))
            status = response;

        if (response.toString() != ".bgs.protocol.NO_RESPONSE") {
            const Header = global.builder.build("bgs.protocol.Header");
            var responseHeader = new Header();
            var buffer = null;
            var responseBuffer = null;

            responseHeader.service_id = 0xFE;
            responseHeader.token = token;

            if(status == 0 && isNaN(response)){
                responseBuffer = response.encodeNB();
                responseHeader.size = responseBuffer.length;
            } else {
                responseHeader.status = status;
            }

            const headerBuffer = responseHeader.encodeNB();

            if(status == 0){
                buffer = Buffer.alloc(2+headerBuffer.length+responseBuffer.length);
            } else {
                buffer = Buffer.alloc(2+headerBuffer.length);
            }

            buffer.writeUInt16BE(headerBuffer.length, 0);
            headerBuffer.copy(buffer,2);

            if(status == 0)
                responseBuffer.copy(buffer, 2 + headerBuffer.length);

            this.clientSocket.write(buffer);

            /*if (status == 0)
                this.parsePacket(buffer, response);*/
        }
    }

    getServiceHash() {
        return this.serviceHash;
    }

    parsePacket(buffer, packetType){
        const headerSize = buffer.readUInt16BE(0);
        const message = global.builder.build(packetType.toString().slice(1)).decode(buffer.slice(2+headerSize));

        if(message.hasOwnProperty("attribute")) {
            message.attribute.forEach(function (attribute) {
                if (attribute.name === "Param_RealmList" || attribute.name === "Param_CharacterCountList"){
                    const blob = attribute.value.blob_value.toBuffer();
                    /*const stringSize = attribute.value.blob_value.readUint32();
                    const string = attribute.value.blob_value.readCString(4);
                    zlib.inflate(string, function(err, decompressed){
                       console.log(decompressed.toString("ascii"));
                    });*/
                    const stringSize = blob.readUInt32BE(0);
                    zlib.inflate(blob.slice(4), function (err, decompresed) {
                        const string = decompresed.toString("ascii");
                        console.log(string);
                        console.log(string.length == stringSize);
                    });
                }
            });
        }
    }
};