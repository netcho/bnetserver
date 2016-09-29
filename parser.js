/**
 * Created by kaloyan on 13.9.2016 г..
 */
const fs = require('fs');
const ProtoBuf = require('protobufjs');

var builder = ProtoBuf.newBuilder();
ProtoBuf.loadProtoFile("proto/bnet/account_service.proto", builder);
ProtoBuf.loadProtoFile("proto/bnet/authentication_service.proto", builder);
ProtoBuf.loadProtoFile("proto/bnet/challenge_service.proto", builder);
ProtoBuf.loadProtoFile("proto/bnet/connection_service.proto", builder);
ProtoBuf.loadProtoFile("proto/bnet/game_utilities_service.proto", builder);
ProtoBuf.loadProtoFile("proto/bnet/rcp_types.proto", builder);

fs.readFile('./packets.bin', { encoding: "utf8" }, function(err, data){
    if (err)
        return;
    
    var handlers = {};
    var offset = 0;
    const buffer = Buffer.from(data);

    for(;;)
    {
        try {
            var headerSize = buffer.readUInt16BE(offset);
            offset += 2;
            const header = builder.build("bgs.protocol.Header").decode(buffer.slice(offset, offset+headerSize));
            offset += headerSize;
            console.log(header);
            //parse the payload here
            offset += header.size;
        } catch (e){
            break;
        }
    }
});