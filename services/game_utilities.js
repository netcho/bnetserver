/**
 * Created by kaloyan on 23.7.2016 г..
 */
const crypto = require('crypto');
const zlib = require('zlib');
var mongoose = require('mongoose');
mongoose.Promise = global.Promise;
const ByteBuffer = require('bytebuffer');
const adler32 = require('adler32-umd');
const Service = require('../service.js');
const realmSchema = require('../models/realm.js').Schema;
const characterSchema = require('../models/character').Schema;
const realm = global.connection.model('Realm', realmSchema);
const character = global.connection.model('Character', characterSchema);

const Attribute = global.builder.build("bgs.protocol.Attribute");
const Variant = global.builder.build("bgs.protocol.Variant");

/*function toCString(string){
    var buffer = new SmartBuffer("ascii");
    buffer.writeStringNT(string);
    return buffer.toBuffer();
}*/

function GetJSON(param, name){
    var string = param.blob_value.readCString();
    return JSON.parse(string.replace(name+":", ""));
}

function SetJSON(name, object) {
    var string = name + ":" + JSON.stringify(object);
    return string;
}

function compress(input, callback) {
    const stringSize = Buffer.byteLength(input, "utf8");
    const string = Buffer.alloc(stringSize + 1);
    string.write(input, "utf8");
    string.writeUInt8(0x00, stringSize);
    //console.log(string.toString('hex'));

    zlib.deflate(string, {strategy: zlib.Z_BEST_SPEED}, function (err, compressed) {
        const buffer = new ByteBuffer(4 + compressed.length, ByteBuffer.LITTLE_ENDIAN);
        buffer.writeUint32(stringSize + 1, 0);
        buffer.append(compressed.toString('hex'), 'hex', 4);
        callback(err, buffer);
    });
}

function realmAddressToString(address) {
    const realmId = address.and(0xFFFF);
    const subRegionId = address.and(0xFF0000);
    const region = address.and(0xFF000000);
    return `${region}-${subRegionId}-${realmId}`;
}

module.exports = class GameUtilitiesService extends Service{
    constructor(socket){
        super("GameUtilitiesService", socket, "game_utilities");
        this.serviceHash = 0x3FC1274D;

        var _socket = socket;

        this.registerHandler("ProcessClientRequest", function(request, response, token, send){
            var command = null;
            var commandValue = null;
            var params = {};
            response.attribute = [];

            request.attribute.forEach(function (attribute) {
                if (attribute.name.includes("Command_")) {
                    command = attribute.name.substring(String("Command_").length);
                    commandValue = attribute.value;
                }


                if(attribute.name.includes("Param_")){
                    params[attribute.name.substring(String("Param_").length)] = attribute.value;
                }
            });

            if (command != null){
                if (command === "RealmListTicketRequest_v1_b9"){
                    const identity = GetJSON(params.Identity, "JSONRealmListTicketIdentity");
                    const clientInfo = GetJSON(params.ClientInfo, "JSONRealmListTicketClientInformation");
                    var gameAccount = _socket.account.getGameAccount(identity.gameAccountID, identity.gameAccountRegion);

                    if (gameAccount){
                        gameAccount.clientSecret = new Buffer(clientInfo.info.secret);
                        gameAccount.build = clientInfo.info.version.versionBuild;
                        _socket.gameAccount = gameAccount;
                        response.add("attribute", new Attribute({ "name": "Param_RealmListTicket",
                            "value": new Variant({ "blob_value": crypto.randomBytes(20).toString('hex') })}));

                        send(token, response);
                    } else {
                        send(token, 0x80000078);
                    }

                } else if (command === "RealmListRequest_v1_b9"){
                    const subRegionId = parseInt(commandValue.string_value.split("")[2], 10);
                    var realmlist = { "updates": [] };
                    var charactersCount = { "counts": [] };

                    realm.find({"handle.subRegion": subRegionId }).sort({ name: -1 }).exec(function (err, realms){
                        if (err){
                            send(token, 0x80000135);
                            return;
                        }

                        realms.forEach(function (realm) {
                            var state = { "deleting": false };
                            state.update = { "wowRealmAddress": realm.handle.getAddress(),
                                             "cfgTimezonesID": realm.timezone,
                                             "populationState": Math.max(realm.population, 1),
                                             "cfgCategoriesID": realm.category,
                                             "version": { "versionMajor": realm.build.major,
                                                          "versionMinor": realm.build.minor,
                                                          "versionRevision": realm.build.revision,
                                                          "versionBuild": realm.build.build },
                                             "cfgRealmsID": realm.handle.realm,
                                             "flags": realm.flags,
                                             "name": realm.name,
                                             "cfgConfigsID": realm.config,
                                             "cfgLanguagesID": realm.language };

                            realmlist.updates.push(state);

                            character.count({ "handle.subRegion": realm.handle.subRegion,
                                              "handle.realm": realm.handle.realm,
                                              "gameAccountId.high": _socket.gameAccount.entityId.high,
                                              "gameAccountId.low": _socket.gameAccount.entityId.low }).
                                      exec(function (err, characters) {
                                            var countEntry = { "wowRealmAddress": realm.handle.getAddress(), "count": characters };
                                            charactersCount.counts.push(countEntry);
                            });
                        });

                        compress(SetJSON("JSONRealmListUpdates", realmlist), function(err, realmListCompressed){
                            if (err){
                                send(token, 0x800000C8);
                                return;
                            }

                            response.add("attribute", new Attribute({ "name": "Param_RealmList",
                                                                      "value": new Variant({ "blob_value": realmListCompressed })}));


                            compress(SetJSON("JSONRealmCharacterCountList", charactersCount), function(err, characterCountCompressed){
                                if (err){
                                    send(token, 0x800000C8);
                                    return;
                                }

                                response.add("attribute", new Attribute({ "name": "Param_CharacterCountList",
                                                                          "value": new Variant({ "blob_value": characterCountCompressed })}));

                                send(token, response);
                            });
                        });
                    });
                } else if (command === "LastCharPlayedRequest_v1_b9"){
                    send(token, 0x80000069);
                } else if (command === "RealmJoinRequest_v1_b9"){
                    console.log(params);
                    const realmAddress = realmAddressToString(params.RealmAddress);
                    global.redisConnection.get(`${realmAddress}-server-address`, function (err, serverAddress) {
                        compress(SetJSON("JSONRealmListServerIPAddresses", serverAddress), function (err, serverAddressesCompressed) {

                            const JoinTicket = crypto.randomBytes(20).toString('hex');
                            const JoinSecret = crypto.randomBytes(32).toString('hex');

                            global.redisConnection.hset(`${realmAddress}-join-tickets`, JoinTicket, JoinSecret, function(err, res){
                                response.add("attribute", new Attribute({ "name": "Param_ServerAddresses",
                                                                          "value": new Variant({ "blob_value": serverAddressesCompressed })}));

                                response.add("attribute", new Attribute({ "name": "Param_RealmJoinTicket",
                                                                          "value": new Variant({ "blob_value": ByteBuffer.fromHex(JoinTicket) })}));

                                response.add("attribute", new Attribute({ "name": "Param_JoinSecret",
                                                                          "value": new Variant({ "blob_value": ByteBuffer.fromHex(JoinSecret) })}));

                                send(token, response);
                            });
                        });
                    });
                } else {
                    console.log(command);
                    console.log(params);
                }
            }
        });
        
        this.registerHandler("GetAllValuesForAttribute", function (request, response, token, send) {
            if (request.attribute_key === "Command_RealmListRequest_v1_b9"){
                response.attribute_value = [];

                global.redisConnection.smembers(`${_socket.gameAccount.getRegion()}-subregions`, function (err, subregions) {
                    subregions.forEach(function (subregion) {
                       response.add("attribute_value", new Variant({"string_value": subregion}));
                    });

                    send(token, response);
                });
            }
        });
    }
};