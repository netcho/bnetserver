'use strict';

module.exports = {
    up: (queryInterface, Sequelize) => {
        return queryInterface.addColumn('GameAccounts', 'billing_plan', {
            type: Sequelize.TINYINT.UNSIGNED,
            allowNull: true,
            defaultValue: 0
        }).then(() => {
            return queryInterface.addColumn('GameAccounts', 'billing_time_remaining', {
                type: Sequelize.INTEGER.UNSIGNED,
                allowNull: true,
                defaultValue: 0
            });
        })
    },

    down: (queryInterface) => {
        return queryInterface.removeColumn('GameAccounts', 'billing_plan').then(() => {
            return queryInterface.removeColumn('GameAccounnts', 'billing_time_remaining');
        });
    }
};
