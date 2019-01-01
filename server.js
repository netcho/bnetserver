/**
 * Created by kaloyan on 6.7.2016 г..
 */
'use strict';

const amqplib = require('amqplib');
const winston = require('winston');
const models = require('./models');
const { Etcd3 } = require('etcd3');

const ServiceReceiver = require('./messaging/receiver');

const winstonFileTransportConfig = require('./config/winston.json');
const winstonFileTransport = new winston.transports.File(winstonFileTransportConfig);
let winstonTransports = [winstonFileTransport];

if (process.env.NODE_ENV === 'development') {
    const winstonConsoleTransport = new winston.transports.Console({
        level: 'debug',
        handleExceptions: true,
        json: false,
        colorize: true
    });

    winstonTransports.push(winstonConsoleTransport);
}

winston.emitErrs = true;

global.amqpConnection = null;
global.serviceReceiver = null;
global.logger = new winston.Logger({transports: winstonTransports, exitOnError: false});
global.etcd3 = new Etcd3({hosts: process.env.ETCD_HOST});

let amqpUrl = 'amqp://' + process.env.RABBITMQ_USERNAME + ':' + process.env.RABBITMQ_PASSWORD + '@' + process.env.RABBITMQ_SERVICE_NAME;

let promises = [];

process.on('unhandledRejection', (error) => {
    global.logger.error(error);
    process.exit(1);
});

process.on('SIGINT', () => {
    if (global.serviceReceiver) {
        global.serviceReceiver.closeChannel().then(() => {
            if (global.amqpConnection) {
                global.amqpConnection.close();
            }
        });
    }

    global.etcd3.close();
});

promises.push(amqplib.connect(amqpUrl));
promises.push(models.sequelize.sync());

Promise.all(promises).then(([conn]) => {
    global.amqpConnection = conn;
    const ServiceName = process.argv[2];
    const Service = require('./services/' + ServiceName);
    global.serviceReceiver = new ServiceReceiver(new Service());
});

