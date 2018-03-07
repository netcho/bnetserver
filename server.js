/**
 * Created by kaloyan on 6.7.2016 г..
 */
'use strict';

const tls = require('tls');
const https = require('https');
const fs = require('fs');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const etcd = require('etcd3').Etcd3;
const amqplib = require('amqplib');
const winston = require('winston');

const ServiceReceiver = require('./messaging/receiver');
const AuthenticationService = require('./services/authentication');

const Account = require('./models/account.js');

mongoose.Promise = global.Promise;
winston.emitErrs = true;

global.etcd = new etcd().namespace('battlenet/');
global.connection = mongoose.createConnection(process.env.MONGO_URL);
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

amqplib.connect(process.env.RABBIT_URL).then((conn) => {
    global.amqpConnection = conn;
    new ServiceReceiver(new AuthenticationService());
}, (err) => {
    global.logger.error(err);
});

const Connection = require('./connection.js');

const server = tls.Server({
    key: fs.readFileSync('certs/server-key.pem'),
    cert: fs.readFileSync('certs/server-cert.pem')
}, (socket) => {
    global.logger.info('Received a new connection from: ' + socket.remoteAddress);
    new Connection(socket);
});

const rest = express();

rest.use(bodyParser.json());

rest.get('/bnet/login/', (req, res) => {
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

rest.post('/bnet/login/', (req, res) => {
    var username = null;
    var password = null;

    res.setHeader('Content-Type', 'application/json');
    req.body.inputs.forEach(function (input) {
        if (input.input_id === 'account_name')
            username = input.value;

        if (input.input_id === 'password')
            password = input.value;
    });

    let loginResult = {};

    loginResult.authentication_state = "DONE";

    Account.findOne({email: username}, function (err, account) {
        if (err){
            loginResult.authentication_state = "LOGIN";
            global.logger.error("Account "+username+" not found");
        }

        if (account){
            if(bcrypt.compareSync(password, account.hash)) {
                const loginTicket = "TC-"+crypto.randomBytes(20).toString('hex');
                loginResult.login_ticket = loginTicket;
                global.etcd.put('login_tickets/'+loginTicket).value(account.id);
            }else{
                global.logger.error("Failed logging attempt for account: "+username);
            }
        }
        res.json(loginResult);
    });
});

const restServer = https.createServer({
    key: fs.readFileSync("certs/server-key.pem"),
    cert: fs.readFileSync("certs/server-cert.pem")
}, rest);

server.listen(1119, '172.16.1.103', () => {
    global.logger.info('Listening on port 1119');
});

restServer.listen(443, () => {
    global.logger.info('REST Service listening');
});