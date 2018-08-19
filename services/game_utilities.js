const crypto = require('crypto');
const zlib = require('zlib');
const protobuf = require('protobufjs');
const Aerospike = require('aerospike');

const Service = require('./service.js');

const gameUtilitiesTypes = protobuf.loadSync('proto/bnet/game_utilities_types.proto');

const Attribute = gameUtilitiesTypes.lookupType('.bgs.protocol.Attribute');
const Variant = gameUtilitiesTypes.lookupType('.bgs.protocol.Variant');

const models = require('../models');

function readFourCC(fourCCInt) {
    return  String.fromCharCode((fourCCInt >> 24) & 0xFF) +
            String.fromCharCode((fourCCInt >> 16) & 0xFF) +
            String.fromCharCode((fourCCInt >> 8) & 0xFF) +
            String.fromCharCode(fourCCInt & 0xFF);
}

function GetJSON(variant, name) {
    let string = variant.blobValue.toString();
    return JSON.parse(string.slice(name.length + 1, string.length - 1));
}

function deflateJSONAttributeValue(name, object) {
    let string = name + ":" + JSON.stringify(object);
    let stringBuffer = Buffer.from(string);
    let CStringBuffer = Buffer.alloc(stringBuffer.length + 1);
    stringBuffer.copy(CStringBuffer);
    CStringBuffer.writeUInt8(0, stringBuffer.length);
    let compressed = zlib.deflateSync(CStringBuffer);
    let buffer = Buffer.alloc(4 + compressed.length);
    buffer.writeInt32LE(CStringBuffer.length, 0);
    compressed.copy(buffer, 4);
    return buffer;
}

function realmAddressToString(address) {
    const realmId = address & 0xFFFF;
    const battleGroupId = (address >> 16) & 0xFF;
    const region = (address >> 24) & 0xFF;
    return region.toString() + '-' + battleGroupId.toString() + '-' + realmId.toString();
}

function stringToRealmAddress(string) {
    let parts = string.split('-');
    return  ((Number.parseInt(parts[0], 10) & 0xFF) << 24) |
            ((Number.parseInt(parts[1], 10) & 0xFF) << 16) |
            (Number.parseInt(parts[2], 10) & 0xFF);
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
                    return global.aerospike.get(new Aerospike.Key('aurora', this.getServiceName(), 'subRegions')).then((record) => {
                        record.bins.subRegions.forEach((subRegion) => {
                            let variant = Variant.create();
                            variant.stringValue = subRegion;
                            context.response.attributeValue.push(variant);
                        });
                        return Promise.resolve(0);
                    });
                }
                default: {
                    return Promise.resolve(0x00000BC7);
                }
            }
        });

        this.registerCommand('RealmListTicketRequest', (params) => {
            let identity = GetJSON(params.Identity, 'JSONRealmListTicketIdentity');
            let clientInfo = GetJSON(params.ClientInfo, 'JSONRealmListTicketClientInformation');

            let listTicket = crypto.randomBytes(20);
            let listTicketInfo = {
                audioLocale: readFourCC(clientInfo.info.audioLocale),
                textLocale: readFourCC(clientInfo.info.textLocale),
                clientSecret: clientInfo.info.secret.toString(),
                version: clientInfo.info.version,
                dataBuild: clientInfo.info.versionDataBuild,
                gameAccount: identity.gameAccountID
            };
            let listTicketKey = new Aerospike.Key('aurora', this.getServiceName(), listTicket.toString('hex'));

            global.logger.debug('Created RealmListRequest with listTicket: ' + listTicket.toString('hex'));

            return global.aerospike.put(listTicketKey, listTicketInfo).then(() => {
                let responseParams = {
                    RealmListTicket: null
                };

                responseParams.RealmListTicket = Variant.create();
                responseParams.RealmListTicket.blobValue = listTicket;

                return Promise.resolve(responseParams);
            });
        });

        this.registerCommand('RealmListRequest', (params, commandValue) => {
            let listTicket = params.RealmListTicket.blobValue.toString('hex');
            let listTicketKey = new Aerospike.Key('aurora', this.getServiceName(), listTicket);
            let subRegion = commandValue.stringValue;

            global.logger.debug('Received RealmListRequest with listTicket: ' + listTicket);

            return global.aerospike.get(listTicketKey).then((record) => {
                let listTicketInfo = record.bins;

                return new Promise((resolve, reject) => {
                    let responseParams = {
                        RealmList: null,
                        CharacterCountList: null
                    };

                    // TODO create secondary index on subRegion
                    let realmQuery = global.aerospike.query('aurora', 'realmlist');
                    //realmQuery.where(Aerospike.filter.equal('subRegion', subRegion));

                    let realmListUpdates = [];
                    let characterCounts = [];

                    let stream = realmQuery.foreach();
                    stream.on('data', (realmRecord) => {
                        global.logger.debug('Sending realm ' + realmRecord.bins.name + ' with addresss: ' + stringToRealmAddress(realmRecord.key.key));
                        // TODO implement more checks to set flags based on locale and language
                        let realm = {
                            update: realmRecord.bins.config,
                            deleting: realmRecord.bins.deleting
                        };

                        realm.update.wowRealmAddress = stringToRealmAddress(realmRecord.key.key);
                        realm.update.name = realmRecord.bins.name;
                        realm.update.version = realmRecord.bins.version;
                        realm.update.populationState = 2; // TODO implement a function which calculates the population
                        realm.update.flags = 0;


                        realmListUpdates.push(realm);

                        let count = {
                            wowRealmAddress: stringToRealmAddress(realmRecord.key.key),
                            count: 0
                        };

                        characterCounts.push(count);
                    });
                    stream.on('end', () => {
                        responseParams.RealmList = Variant.create();
                        responseParams.RealmList.blobValue = deflateJSONAttributeValue('JSONRealmListUpdates', {updates: realmListUpdates});
                        responseParams.CharacterCountList = Variant.create();
                        responseParams.CharacterCountList.blobValue = deflateJSONAttributeValue('JSONRealmCharacterCountList', {counts: characterCounts});
                        resolve(responseParams);
                    });
                });
            });
        });

        this.registerCommand('RealmJoinRequest', (params, commandValue) => {
            let subRegion = commandValue.stringValue;
            let listTicket = params.RealmListTicket.blobValue.toString('hex');
            let listTicketKey = new Aerospike.Key('aurora', this.getServiceName(), listTicket);
            let realmAddress = realmAddressToString(params.RealmAddress.uintValue.getLowBitsUnsigned());
            let realmKey = new Aerospike.Key('aurora', 'realmlist', realmAddress);

            global.logger.debug('Received RealmJoinRequest for realm: ' + realmAddress);

            let responseParams = {
                ServerAddresses: Variant.create(),
                RealmJoinTicket: Variant.create(),
                JoinSecret: Variant.create()
            };

            return global.aerospike.get(realmKey).then((realmRecord) => {
                responseParams.ServerAddresses.blobValue = deflateJSONAttributeValue('JSONRealmListServerIPAddresses',
                    { families: realmRecord.bins.families});

                return global.aerospike.get(listTicketKey);
            }).then((listTicketRecord) => {
                responseParams.RealmJoinTicket.blobValue = crypto.randomBytes(20);
                responseParams.JoinSecret.blobValue = crypto.randomBytes(32);

                let joinTicket = {
                    clientSecret: listTicketRecord.bins.clientSecret,
                    serverSecret: responseParams.JoinSecret.toString('hex')
                };

                let joinKeyTicket = new Aerospike.Key('aurora', 'WoWService', responseParams.RealmJoinTicket.toString('hex'));

                return global.aerospike.put(joinKeyTicket, joinTicket);
            }).then(() => {
                return Promise.resolve(responseParams);
            });
        })
    }

    registerCommand(command, handler) {
        this.commandHandlers[command] = handler;
    }

    handleCommand(command, params) {
        if (this.commandHandlers.hasOwnProperty(command.name)) {
            return this.commandHandlers[command.name](params, command.value).then((responseParams) => {
                let attributes = [];
                Object.getOwnPropertyNames(responseParams).forEach((responseParamName) => {
                    let attribute = Attribute.create();
                    attribute.name = 'Param_' + responseParamName;
                    attribute.value = responseParams[responseParamName];
                    attributes.push(attribute);
                });

                return Promise.resolve(attributes);
            }, (error) => {
                global.logger.error('Error in command: ' + command.name);
                global.logger.error(error);
            });
        }
        else {
            //reject with unknown command ?
            global.logger.error('Unknown command: ' + command.name + ' received from client');
            return Promise.reject(0x000084D3);
        }
    }
};