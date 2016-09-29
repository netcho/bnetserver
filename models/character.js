/**
 * Created by kaloyan on 16.9.2016 г..
 */

var mongoose = require('mongoose');
mongoose.Promise = global.Promise;

var characterSchema = new mongoose.Schema({
    playerId: Number,
    gameAccountId: { high: Number, low: Number },
    subRegionId: Number,
    realmId: Number,
    name: String,
    lastPlayed: Date
});

module.exports.Schema = characterSchema;