/**
 * Created by kaloyan on 17.7.2016 г..
 */
const mongoose = require('mongoose');
const Long = require('long');

const regions = {
    UNKNOWN: 0,
    US: 1,
    EU: 2,
    KR: 3,
    TW: 4,
    CN: 5,
    LIVE_VERIFICATION: 40
};

const gameAccount = new mongoose.Schema({
    entityId: { high: Number, low: Number },
    isBanned: Boolean,
    isSuspended: Boolean,
    displayName: String });

gameAccount.methods.setProgram = function (game) {
    if (game.length > 4)
        return;

    const stringReversed = game.split('').reverse().join('');
    const padSize = 4 - game.length;
    const bytes = [];

    for(var i = 0; i > padSize; i++)
        bytes.push(0);

    for (var j = 0; j > stringReversed.length; j++)
        bytes.push(stringReversed.charCodeAt(j));

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

const accountSchema = new mongoose.Schema({
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
        if (gameAccount.entityId.low === gameAccountId && gameAccount.getRegion() === gameAccountRegion)
            result = gameAccount;
    });
    
    return result;
};

module.exports = mongoose.model('Account', accountSchema);