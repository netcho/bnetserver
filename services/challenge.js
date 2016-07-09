/**
 * Created by kaloyan on 10.7.2016 г..
 */

module.exports.listener = function (socket){
     const serviceType = global.builder.build('bgs.protocol.challenge.v1.ChallengeListener');
     var listener = new serviceType(function(methodName, request, callback = null){
         socket.responseCallbacks[socket.requestToken] = {};
         socket.responseCallbacks[socket.requestToken].callback = callback;
         const Header = global.builder.build("bgs.protocol.Header");
         var requestHeader = new Header();
         requestHeader.service_id = 0;
         requestHeader.service_hash = 0xBBDA171F;
         requestHeader.token = socket.requestToken;
         
         const servicePrototype = global.builder.lookup('bgs.protocol.challenge.v1.ChallengeListener');
         for (var i = 0, len = servicePrototype.children.length; i < len; i++) {
             const method = servicePrototype.children[i];
             if(method.name === methodName){
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
         
         socket.write(buffer);
     });

    return listener;
};