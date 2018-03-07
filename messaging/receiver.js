'use strict';

module.exports = class Receiver{
    constructor(service){
        global.amqpConnection.createChannel().then((channel) => {
            channel.assertExchange('battlenet_aurora_bus', 'direct').then(() => {
                channel.assertQueue('', {autoDelete: true}).then((ok) => {
                    channel.bindQueue(ok.name, 'battlenet_aurora_bus', service.getServiceHash().toString()).then(() => {
                        channel.consume(ok.name, (message) => {
                            service.setClientQueueName(message.properties.replyTo);
                            channel.sendToQueue(message.properties.replyTo, service.handleCall(message.properties.headers, message.content));
                        });
                        global.etcd.put('aurora/services/'+service.getServiceName()+'/hash').value(service.getServiceHash().toString());
                        global.logger.info(service.getServiceName()+' listening');
                    });
                });
            });
        });
    }
};