/**
 * Created by kaloyan on 10.7.2016 г..
 */
module.exports = function(name, hash, socket){
    const fullName = 'bgs.protocol.'+name+'.v1.'+name.charAt(0).toUpperCase() + name.slice(1)+'Listener';
    const serviceType = global.builder.build(fullName);
    var listener = new serviceType(function(methodName, request, callback = null){
        socket.responseCallbacks[socket.requestToken] = {};
        socket.responseCallbacks[socket.requestToken].callback = callback;
        const Header = global.builder.build("bgs.protocol.Header");
        var requestHeader = new Header();
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

        var buffer = new Buffer(2+headerBuffer.length+requestBuffer.length);
        buffer.writeUInt16BE(headerBuffer.length, 0);
        headerBuffer.copy(buffer,2);
        requestBuffer.copy(buffer, 2 + headerBuffer.length);

        //console.log(buffer.toString('hex'));

        socket.write(buffer);
        socket.requestToken++;
    });

    return listener;
};