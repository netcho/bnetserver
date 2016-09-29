/**
 * Created by kaloyan on 15.9.2016 г..
 */
var mongoose = require('mongoose');
mongoose.Promise = global.Promise;
const zlib = require('zlib');

var realmHandle = new mongoose.Schema({
    region: Number,
    subRegion: Number,
    realm: Number
});

realmHandle.methods.getAddress = function () {
    return ((this.region & 0xFF) << 24) | ((this.subRegion & 0xFF) << 16) | (this.realm & 0xFFFF);
};

var realmBuildInfo = new mongoose.Schema({
    major: { type: Number, default: 7 },
    minor: { type: Number, default: 0 },
    revision: { type: Number, default: 3 },
    build: { type: Number, default: 22566 }
});

var realmSchema = new mongoose.Schema({
    handle: realmHandle,
    timezone: Number,
    population: Number,
    category: Number,
    build: realmBuildInfo,
    name: String,
    flags: Number,
    config: Number,
    language: Number
});

module.exports.Schema = realmSchema;