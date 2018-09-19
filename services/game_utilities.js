const crypto = require('crypto');
const zlib = require('zlib');
const protobuf = require('protobufjs');

const Service = require('./service.js');

const gameUtilitiesTypes = protobuf.loadSync('proto/bnet/game_utilities_types.proto');

const Attribute = gameUtilitiesTypes.lookupType('.bgs.protocol.Attribute');
const Variant = gameUtilitiesTypes.lookupType('.bgs.protocol.Variant');

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

function bufferToArray(buffer) {
    let array = [];
    for (const value of buffer) {
        array.push(value);
    }

    return array;
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
                    return new Promise((resolve, reject) => {
                        global.etcd.get('aurora/services/WoWService/subRegions', (err, result) => {
                            if (err) {
                                reject(0x8000006D); //ERROR_UTIL_SERVER_MISSING_REALM_LIST
                            }

                            result.node.nodes.forEach((node) => {
                                let variant = Variant.create();
                                variant.stringValue = node.key.split('/').pop();
                                context.response.attributeValue.push(variant);
                            });

                            resolve(0);
                        });
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
                info: clientInfo.info,
                identity: identity
            };

            global.logger.debug('Created RealmListRequest with listTicket: ' + listTicket.toString('hex'));

            return new Promise((resolve, reject) => {
                global.etcd.set('aurora/services/' + this.getServiceName() + '/realmListTickets/' + listTicket.toString('hex'), JSON.stringify(listTicketInfo), { ttl: 120 }, (err) => {
                    if (err) {
                        reject(0x80000076) //ERROR_UTIL_SERVER_UNABLE_TO_GENERATE_REALM_LIST_TICKET
                    }

                    let responseParams = {
                        RealmListTicket: null
                    };

                    responseParams.RealmListTicket = Variant.create();
                    responseParams.RealmListTicket.blobValue = listTicket;

                    resolve(responseParams);
                })
            });
        });

        this.registerCommand('RealmListRequest', (params, commandValue) => {
            let listTicket = params.RealmListTicket.blobValue.toString('hex');
            let subRegion = commandValue.stringValue;

            global.logger.debug('Received RealmListRequest with listTicket: ' + listTicket);

            return new Promise((resolve, reject) => {
                global.etcd.get('aurora/services/' + this.getServiceName() + '/realmListTickets/' + listTicket, (err, result) => {
                    if (err) {
                        reject(0x8000012D); //ERROR_WOW_SERVICES_INVALID_REALM_LIST_TICKET
                    }

                    resolve(JSON.parse(result.node.value));
                });
            }).then((listTicketInfo) => {
                return new Promise((resolve, reject) => {
                    global.etcd.get('/aurora/services/WoWService/subRegions/' + subRegion + '/realms', { recursive: true }, (err, result) => {
                        if (err) {
                            reject(0x8000006D); //ERROR_UTIL_SERVER_MISSING_REALM_LIST
                        }

                        let responseParams = {
                            RealmList: Variant.create(),
                            CharacterCountList: Variant.create()
                        };

                        let realmListUpdates = [];
                        let characterCounts = [];

                        result.node.nodes.forEach((realmNode) => {

                            let realmEntry = {
                                update: {},
                                deleting: false
                            };

                            let realmConfiguration = JSON.parse(realmNode.nodes.find((element) => {
                                return element.key.includes('configuration');
                            }).value);

                            realmEntry.update.cfgRealmsID = realmConfiguration.cfgRealmsID;
                            realmEntry.update.cfgTimezonesID = realmConfiguration.cfgTimezonesID;
                            realmEntry.update.cfgLanguagesID = realmConfiguration.cfgLanguagesID;
                            realmEntry.update.cfgCategoriesID = realmConfiguration.cfgCategoriesID;
                            realmEntry.update.cfgConfigsID = realmConfiguration.cfgConfigsID;

                            realmEntry.update.name = realmNode.nodes.find((element) => {
                                return element.key.includes('name');
                            }).value;

                            //TODO set recommended for the same locale, check for build compatability (flags etc.)
                            realmEntry.update.wowRealmAddress = stringToRealmAddress(realmNode.key.split('/').pop());
                            realmEntry.update.populationState = 1;
                            realmEntry.update.flags = 0;

                            realmEntry.update.version = JSON.parse(realmNode.nodes.find((element) => {
                                return element.key.includes('version');
                            }).value);

                            if (realmEntry.update.version.versionMajor !== listTicketInfo.info.version.versionMajor ||
                                realmEntry.update.version.versionMinor !== listTicketInfo.info.version.versionMinor ||
                                realmEntry.update.version.versionRevision !== listTicketInfo.info.version.versionRevision)
                                realmEntry.update.flags |= 0x1;

                            realmEntry.deleting = JSON.parse(realmNode.nodes.find((element) => {
                                return element.key.includes('deleting');
                            }).value);

                            realmListUpdates.push(realmEntry);

                            let count = {
                                wowRealmAddress: realmEntry.update.wowRealmAddress,
                                count: 0
                            };

                            characterCounts.push(count);
                        });

                        responseParams.RealmList.blobValue = deflateJSONAttributeValue('JSONRealmListUpdates', {updates: realmListUpdates});
                        responseParams.CharacterCountList.blobValue = deflateJSONAttributeValue('JSONRealmCharacterCountList', {counts: characterCounts});
                        resolve(responseParams);
                    });
                })
            });
        });

        this.registerCommand('RealmJoinRequest', (params, commandValue) => {
            let subRegion = commandValue.stringValue;
            let listTicket = params.RealmListTicket.blobValue.toString('hex');
            let realmAddress = realmAddressToString(params.RealmAddress.uintValue.getLowBitsUnsigned());

            global.logger.debug('Received RealmJoinRequest for realm: ' + realmAddress);

            let responseParams = {
                ServerAddresses: Variant.create(),
                RealmJoinTicket: Variant.create(),
                JoinSecret: Variant.create()
            };

            return new Promise((resolve, reject) => {
                global.etcd.get('aurora/services/WoWService/subRegions/' + subRegion + '/realms/' + realmAddress + '/families', (err, result) => {
                    if (err) {
                        reject(0x80000071) //ERROR_UTIL_SERVER_INVALID_VIRTUAL_REALM
                    }

                    //let realmEntry = JSON.parse(result.node.value);

                    //if(!realmEntry.hasOwnProperty('families')) {
                    //    reject(0x80000131) //ERROR_WOW_SERVICES_NO_REALM_JOIN_IP_FOUND
                    //}

                    responseParams.ServerAddresses.blobValue = deflateJSONAttributeValue('JSONRealmListServerIPAddresses',
                        { families: JSON.parse(result.node.value)});

                    resolve();
                })
            }).then(() => {
                return new Promise((resolve, reject) => {
                    global.etcd.get('aurora/services/' + this.getServiceName() + '/realmListTickets/' + listTicket, (err, result) => {
                        if (err) {
                            reject(0x8000012D); //ERROR_WOW_SERVICES_INVALID_REALM_LIST_TICKET
                        }

                        resolve(JSON.parse(result.node.value));
                    });
                });
            }).then((listTicketInfo) => {
                responseParams.RealmJoinTicket.blobValue = crypto.randomBytes(20);
                responseParams.JoinSecret.blobValue = crypto.randomBytes(32);

                let joinTicketInfo = {
                    clientSecret: listTicketInfo.info.secret,
                    joinSecret: bufferToArray(responseParams.JoinSecret.blobValue),
                    gameAccount: listTicketInfo.identity
                };

                return new Promise((resolve, reject) => {
                    global.etcd.set('aurora/services/' + this.getServiceName() + '/realmJoinTickets/' + responseParams.RealmJoinTicket.blobValue.toString('hex'), JSON.stringify(joinTicketInfo), { ttl: 180 }, (err) => {
                        if (err) {
                            reject(0x80000075) //ERROR_UTIL_SERVER_UNABLE_TO_GENERATE_JOIN_TICKET
                        }

                        resolve(responseParams);
                    });
                });
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
                global.logger.error('Error: '+ error + ' in command: ' + command.name);
                return Promise.reject(error);
            });
        }
        else {
            //reject with unknown command ?
            global.logger.error('Unknown command: ' + command.name + ' received from client');
            return Promise.reject(0x000084D3);
        }
    }
};