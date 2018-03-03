/**
 * Created by kaloyan on 6.7.2016 г..
 */
'use strict';

const tls = require('tls');
const https = require('https');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const redis = require('promise-redis')();
const amqplib = require('amqplib');
const winston = require('winston');

const ServiceReceiver = require('./messaging/receiver');
const AuthenticationService = require('./services/authentication');

const accountSchema = require('./models/account.js').Schema;

mongoose.Promise = global.Promise;
winston.emitErrs = true;

global.redisConnection = redis.createClient({host: process.env.REDIS_HOST, port: process.env.REDIS_PORT});
global.connection = mongoose.createConnection("mongodb://localhost/battlenet");
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

amqplib.connect('amqp://localhost').then((conn) => {
    global.amqpConnection = conn;
});

const Connection = require('./connection.js');

const server = tls.Server({
    key: fs.readFileSync('certs/server-key.pem'),
    cert: fs.readFileSync('certs/server-cert.pem')
}, (socket) => {
    global.logger.info('Received a new connection from:' + socket.remoteAddress);
    new Connection(socket);
    new ServiceReceiver(new AuthenticationService());
});

const rest = express();

rest.use(bodyParser.json());

rest.get('/bnet/login/', function(req, res){
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

rest.post('/bnet/login/', function (req, res) {
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

    const accountModel = global.connection.model('Account', accountSchema);
    accountModel.findOne({email: username}, function (err, account) {
        if (err){
            loginResult.authentication_state = "LOGIN";
            console.log("Account "+username+" not found");
        }

        if (account){
            if(bcrypt.compareSync(password, account.hash)) {
                const loginTicket = "TC-"+crypto.randomBytes(20).toString('hex');
                loginResult.login_ticket = loginTicket;
                global.loginTickets[loginTicket] = account;
            }else{
                console.log("Failed logging attempt for account: "+username);
            }
        }

        res.json(loginResult);
    });
});

const restServer = https.createServer({
    key: fs.readFileSync("certs/server-key.pem"),
    cert: fs.readFileSync("certs/server-cert.pem")
}, rest);

server.listen(1119, global.listenAddress, function (){
    global.amqpConnection.assertExchange('battlenet_aurora_bus', 'direct');
    global.logger.log('Listening on port 1119');
});

restServer.listen(443, function () {
    global.logger.log('REST Service listening');
});