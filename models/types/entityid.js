'use strict';

const mongoose = require('mongoose');
const Long = require('long');

function EntityId(key, options) {
    mongoose.SchemaType.call(this, key, options, 'Int8');
}

EntityId.prototype = Object.create(mongoose.SchemaType.prototype);

EntityId.prototype.cast = function (val) {
    let _val = Long.from(val, true);

    return _val;
};