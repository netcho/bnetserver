const crypto = require('crypto');
const zlib = require('zlib');
const protobuf = require('protobufjs');
const Aerospike = require('aerospike');

const Service = require('./service.js');

const gameUtilitiesTypes = protobuf.loadSync('proto/bnet/game_utilities_types.proto');

const Attribute = gameUtilitiesTypes.lookupType('.bgs.protocol.Attribute');
const Variant = gameUtilitiesTypes.lookupType('.bgs.protocol.Variant');

const models = require('../models');

function GetJSON(variant, name) {
    let string = variant.blobValue.toString();
    return JSON.parse(string.slice(name.length + 1, string.length - 1));
}

function SetJSON(name, object) {
    return name + ": " + JSON.stringify(object);
}

function compress(input, callback) {
    const stringSize = Buffer.byteLength(input, "utf8");
    const string = Buffer.alloc(stringSize + 1);
    string.write(input, "utf8");
    string.writeUInt8(0x00, stringSize);

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

module.exports = class GameUtilitiesService extends Service {
    constructor() {
        super('GameUtilitiesService', 'proto/bnet/game_utilities_service.proto');

        this.commandHandlers = {};

        this.registerHandler('ProcessClientRequest', (context) => {
            let command = {
                name: '',
                value: null,
                version: '',
                auroraVersion: ''
            };

            let params = {};

            for (let i = 0; i < context.request.attribute.length; i++) {
                let attribute = context.request.attribute[i];

                let parts = attribute.name.split('_');

                switch (parts[0]) {
                    case 'Command': {
                        command.name = parts[1];
                        command.version = parts[2];
                        command.auroraVersion = parts[3];
                        if (attribute.value) {
                            command.value = attribute.value;
                        }
                        break;
                    }
                    case 'Param': {
                        params[parts[1]] = attribute.value;
                        break;
                    }
                }
            }

            return this.handleCommand(command, params).then((attributes) => {
                context.response.attribute = attributes;
                return Promise.resolve(0);
            });
        });

        this.registerHandler('GetAllValuesForAttribute', (context) => {
            switch (context.request.attributeKey) {
                case 'Command_RealmListRequest_v1_b9': {
                    const subRegions = ['3-101-89', '3-35-65'];

                    subRegions.forEach((subRegion) => {
                        let variant = Variant.create();
                        variant.stringValue = subRegion;
                        context.response.attributeValue.push(variant);
                    });
                    return Promise.resolve(0);
                }
                default: {
                    return Promise.resolve(0x00000BC7);
                }
            }
        });

        this.registerCommand('RealmListTicketRequest', (params) => {
            let ticket = crypto.randomBytes(20);
            let key = new Aerospike.Key(process.env.AEROSPIKE_NAMESPACE, 'realmList', ticket);

            let identity = GetJSON(params.Identity, 'JSONRealmListTicketIdentity');
            let clientInfo = GetJSON(params.ClientInfo, 'JSONRealmListTicketClientInformation');

            let bins = {
                clientSecret: clientInfo.secret,
                build: clientInfo.build
            };

            return global.aerospike.put(key, bins).then(() => {
                let responseParams = {
                    RealmListTicket: null
                };

                responseParams.RealmListTicket = Variant.create();
                responseParams.RealmListTicket.blobValue = ticket;

                return Promise.resolve(responseParams);
            });
        });
    }

    registerCommand(command, handler) {
        this.commandHandlers[command] = handler;
    }

    handleCommand(command, params) {
        if (this.commandHandlers.hasOwnProperty(command.name)) {
            return this.commandHandlers[command.name](params).then((responseParams) => {
                let attributes = [];
                Object.getOwnPropertyNames(responseParams).forEach((responseParamName) => {
                    let attribute = Attribute.create();
                    attribute.name = 'Param_' + responseParamName;
                    attribute.value = responseParams[responseParamName];
                    attributes.push(attribute);
                });

                return Promise.resolve(attributes);
            });
        }
        else {
            //reject with unknown command ?
            global.logger.error('Unknown command: ' + command.name + ' received from client');
            return Promise.reject(0x000084D3);
        }
    }
};