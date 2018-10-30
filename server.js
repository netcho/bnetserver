/**
 * Created by kaloyan on 6.7.2016 г..
 */
'use strict';

const zookeeperClient = require('zookeeper-cluster-client');
const amqplib = require('amqplib');
const winston = require('winston');
const models = require('./models');

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
global.logger = new winston.Logger({transports: winstonTransports, exitOnError: false});

models.sequelize.sync().then(() => {
    global.logger.debug('Database synced');
    return new Promise((resolve, reject) => {
        global.zookeeper = zookeeperClient.createClient(process.env.ZOOKEEPER_ADDRESS + ':2181');
        global.zookeeper.once('connected', () => {
            resolve();
        });
        global.zookeeper.connect();
    });
}).then(() => {
    global.logger.debug('Connected to Zookeeper');
    return amqplib.connect('amqp://' + process.env.RABBITMQ_USERNAME + ':' + process.env.RABBITMQ_PASSWORD + '@' + process.env.RABBITMQ_SERVICE_NAME);
}).then((conn) => {
    global.logger.debug('Connected to RabbitMQ');
    global.amqpConnection = conn;
    const ServiceName = process.argv[2];
    const Service = require('./services/' + ServiceName);
    new ServiceReceiver(new Service());
}).catch((error) => {
    global.logger.error(error);
});