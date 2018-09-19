const bcrypt = require('bcrypt');
const express = require('express');
const bodyParser = require('body-parser');
const Aerospike = require('aerospike');
const models = require('./models');

const rest = express();

rest.use(bodyParser.json());
rest.use(bodyParser.urlencoded({ extended: true }));

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
                return new Promise((resolve) => {
                    global.etcd.set('/aurora/services/AuthenticationService/loginTickets/' + req.params.loginTicket + '/accountId', account.id, { ttl: 120 },(err) => {
                        if (err) {
                            return Promise.resolve('LOGIN');
                        }

                        loginResult.login_ticket = req.params.loginTicket;
                        resolve('DONE');
                    })
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

module.exports = rest;