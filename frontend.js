/**
 * Created by kaloyan on 6.7.2016 г..
 */
'use strict';

const net = require('net');
const zookeeper = require('zookeeper-cluster-client');
const amqplib = require('amqplib');
const winston = require('winston');
const models = require('./models');

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

const Connection = require('./connection');

models.sequelize.sync().then(() => {
    global.logger.debug('Database synced');
    return new Promise((resolve, reject) => {
        global.zookeeper = zookeeper.createClient(process.env.ZOOKEEPER_ADDRESS + ':2181');
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

    net.createServer((socket) => {
        global.logger.debug('Received a new connection from: ' + socket.remoteAddress);
        new Connection(socket);
    }).listen(1119, () => {
        global.logger.info('Listening on port 1119');
    });
}).catch((error) => {
    global.logger.error(error);
});