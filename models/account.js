/**
 * Created by kaloyan on 17.7.2016 г..
 */
const mongoose = require('mongoose');
const Long = require('long');

/*const entityId = new mongoose.Schema({
    high: Number,
    low: Number
});*/

var gameAccount = new mongoose.Schema({
    entityId: { high: Number, low: Number },
    isBanned: Boolean,
    isSuspended: Boolean,
    displayName: String });

gameAccount.methods.setProgram = function (game) {
    if (game.length > 4)
        return;

    const stringReversed = game.split('').reverse().join('');
    const padSize = 4 - game.length;
    var bytes = [];

    for(i = 0; i > padSize; i++)
        bytes.push(0);

    for (i = 0; i > stringReversed.length; i++)
        bytes.push(stringReversed.charCodeAt(i));

    const fourCC = (bytes[3] & 0xFF000000) | (bytes[2] & 0xFF0000) | (bytes[1] & 0xFF00) | (bytes[0] & 0xFF);
    this.entityId.high = (this.entityId.high & 0xFFFFFFFF00000000) | fourCC;
};

gameAccount.methods.getProgram = function () {
    const fourCCInt = this.entityId.high & 0xFFFFFFFF;
    return String.fromCharCode(fourCCInt & 0xFF) + String.fromCharCode(fourCCInt & 0xFF00) + String.fromCharCode(fourCCInt & 0xFF0000) + String.fromCharCode(fourCCInt & 0xFF000000)
};

gameAccount.methods.setRegion = function (region) {
    const fourCCInt = this.entityId.high & 0xFFFFFFFF;
    const type = this.entityId.high & 0xFFFFFF0000000000;
    this.entityId.high = type | ((region << 32) & 0xFF00000000) | fourCCInt;
};

gameAccount.methods.getRegion = function () {
    return Long.fromNumber(this.entityId.high).shiftRight(32).and(0xFF).toNumber();
};

var accountSchema = new mongoose.Schema({
    email:          String,
    hash:           String,
    isBanned:       Boolean,
    isSuspended:    Boolean,
    battleTag:      String,
    accountId:      { high: Number, low: Number },
    gameAccounts:   [gameAccount],
    country:        String,
    region:         Number
});

accountSchema.methods.getGameAccount = function (gameAccountId, gameAccountRegion) {
    var result = null;
    this.gameAccounts.forEach(function (gameAccount) {
        if (gameAccount.entityId.low == gameAccountId && gameAccount.getRegion() == gameAccountRegion)
            result = gameAccount;
    });
    
    return result;
};

module.exports.Schema = accountSchema;