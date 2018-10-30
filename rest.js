'use strict';

const bcrypt = require('bcrypt');
const http = require('http');
const express = require('express');
const bodyParser = require('body-parser');
const zookeeper = require('zookeeper-cluster-client');
const winston = require('winston');
const morgan = require('morgan');
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

const rest = express();

rest.use(bodyParser.json());
rest.use(bodyParser.urlencoded({ extended: true }));
rest.use(morgan('combined', { stream: { write: message => global.logger.info(message) }}));

rest.get('/healthz', (req, res) => {
    res.sendStatus(200);
});

rest.get('/bnetserver/login/:loginTicket', (req, res) => {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.json({
        "type": 1,
        "inputs": [{
            "input_id": "account_name",
            "type": "text",
            "label": "E-mail",
            "max_length": 320
        }, {
            "input_id": "password",
            "type": "password",
            "label": "Password",
            "max_length": 16
        }, {
            "input_id": "log_in_submit",
            "type": "submit",
            "label": "Log In"
        }]
    });
});

rest.post('/bnetserver/login/:loginTicket', (req, res) => {
    let username = null;
    let password = null;

    res.setHeader('Content-Type', 'application/json');
    req.body.inputs.forEach(function (input) {
        if (input.input_id === 'account_name')
            username = input.value;

        if (input.input_id === 'password')
            password = input.value;
    });

    let loginResult = {};

    models.Account.findOne({where: {email: username}}).then((account) => {
        if (account){
            if(bcrypt.compareSync(password, account.hash) && req.params.hasOwnProperty('loginTicket')) {
                let loginTicketPath = '/aurora/services/AuthenticationService/loginTickets/' + req.params.loginTicket;
                return global.zookeeper.exists(loginTicketPath).
                    then(() => {
                        return global.zookeeper.create(loginTicketPath + '/accountId', account.id);
                    }).
                    then(() => {
                        loginResult.login_ticket = req.params.loginTicket;
                        return Promise.resolve('DONE');
                }).catch(() => {
                    return Promise.resolve('LOGIN');
                });
            }
            else {
                global.logger.info('Invalid password for account: ' + username);
                return Promise.resolve('LOGIN');
            }
        }
        else {
            global.logger.debug('No account found: ' + username);
            return Promise.resolve('LOGIN');
        }
    }).then((state) => {
        loginResult.authentication_state = state;
        res.json(loginResult);
    });
});

models.sequelize.sync().then(() => {
    global.logger.debug('Database synced');
    return new Promise((resolve, reject) => {
        global.zookeeper = zookeeper.createClient(process.env.ZOOKEEPER_ADDRESS + ':2181');
        global.zookeeper.once('connected', () => {
            resolve();
        });
        global.zookeeper.connect();
    });
}).then(()=> {
    global.logger.debug('Connected to Zookeeper');
    http.createServer(rest).listen(80, () => {
        //TODO add a method to dynamically retrieve the external address of the service
        //global.etcd.set('/aurora/services/AuthenticationService/WebAuthUrl', 'https://127.0.0.1:443/bnetserver/login/');
        global.logger.info('REST Service listening');
    });
});