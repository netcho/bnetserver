/**
 * Created by kaloyan on 6.7.2016 г..
 */
'use strict';

const tls = require('tls');
const https = require('https');
const fs = require('fs');
const Etcd = require('node-etcd');
const amqplib = require('amqplib');
const winston = require('winston');
const models = require('./models');

const ServiceReceiver = require('./messaging/receiver');
const AuthenticationService = require('./services/authentication');
const AccountService = require('./services/account');
const GameUtilitiesService = require('./services/game_utilities');

winston.emitErrs = true;
global.logger = new winston.Logger({
    transports: [
        new winston.transports.File({
            level: 'info',
            filename: './logs/all-logs.log',
            handleExceptions: true,
            json: true,
            maxsize: 5242880, //5MB
            maxFiles: 5,
            colorize: false
        }),
        new winston.transports.Console({
            level: 'debug',
            handleExceptions: true,
            json: false,
            colorize: true
        })
    ],
    exitOnError: false
});

const Connection = require('./connection');
const RestAPI = require('./rest');

models.sequelize.sync().then(() => {
    global.logger.debug('Database synced');
    global.etcd = new Etcd(process.env.ETCD_URL);
    return new Promise((resolve, reject) => {
        global.etcd.mkdir('aurora/services', { prevExist: true }, function (err, result) {
            if (err) {
                reject(err);
            }

            resolve(result);
        })
    });
}).then((result) => {
    global.logger.debug('Connected to etcd');
    return amqplib.connect(process.env.RABBIT_URL);
}).then((conn) => {
    global.logger.debug('Connected to RabbitMQ');
    global.amqpConnection = conn;
    new ServiceReceiver(new AuthenticationService());
    new ServiceReceiver(new AccountService());
    new ServiceReceiver(new GameUtilitiesService());
    return Promise.resolve();
}).then(() => {
    tls.createServer({
        key: fs.readFileSync('certs/server-key.pem'),
        cert: fs.readFileSync('certs/server-cert.pem')
    }, (socket) => {
        global.logger.debug('Received a new connection from: ' + socket.remoteAddress);
        new Connection(socket);
    }).listen(1119, () => {
        global.logger.info('Listening on port 1119');
    });

    https.createServer({
        key: fs.readFileSync('certs/server-key.pem'),
        cert: fs.readFileSync('certs/server-cert.pem')
    }, RestAPI).listen(443, () => {
        global.etcd.set('/aurora/services/AuthenticationService/WebAuthUrl', 'https://127.0.0.1:443/bnetserver/login/');
        global.logger.info('REST Service listening');
    });
}).catch((error) => {
    global.logger.error(error);
});