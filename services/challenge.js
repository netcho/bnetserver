/**
 * Created by kaloyan on 10.7.2016 г..
 */
const listener = require('../listener');

module.exports.listener = function (socket){
     return listener('challenge', 0xBBDA171F, socket);
};