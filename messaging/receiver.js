'use strict';

module.exports = class Receiver{
    constructor(service){
        global.amqpConnection.createChannel((err, channel) => {
            channel.assertQueue('', {autoDelete: true}, (ok) => {
                channel.bindQueue(ok.name,'battlenet_aurora_bus', service.hash(), {}, (result) => {
                    channel.consume(ok.name, (message) => {
                        channel.sendToQueue(message.properties.replyTo, service.handleCall(message.properties.headers, message.contents));
                    });
                });
            });
        });
    }
};