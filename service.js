/**
 * Created by kaloyan on 8.7.2016 г..
 */
module.exports = class Service{
    constructor(name, socket) {
        this.handler = {};
        this.socket = socket;
        this.serviceHash = 0;
        this.servicePrototype = global.builder.lookup(".bgs.protocol.connection.v1."+name);

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
    
    handleData(method_id, data, token){
        for (const methodName in this.handler)
        {
            const handler = this.handler[methodName];
            if (handler.method_id == method_id){
                const request = global.builder.build(handler.requestName).decode(data);
                const responseType = global.builder.build(handler.responseName);
                var response = new responseType();

                if (handler.callback)
                    handler.callback(request, response);

                if (handler.responseName != ".bgs.protocol.NO_RESPONSE"){
                    const responseBuffer = response.encode();
                    var header = global.builder.build("bgs.protocol.Header");
                    header.service_id = 0;
                    header.method_id = method_id;
                    header.service_hash = this.serviceHash;
                    header.token = ++token;
                    header.size = responseBuffer.length;
                    const headerBuffer = header.encode();
                    var buffer = new Buffer();
                    buffer.writeUInt16BE(headerBuffer.length, 0);
                    headerBuffer.copy(buffer,2);
                    responseBuffer.copy(buffer, 2 + headerBuffer.length);
                    this.socket.write(buffer);
                }
            }
        }
    }

    getServiceHash() {
        return this.serviceHash;
    }
};