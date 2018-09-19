'use strict';

module.exports = {
    up: (queryInterface, Sequelize) => {
        return queryInterface.addColumn('GameAccounts', 'tutorial_data', {
            type: Sequelize.BLOB('tiny'),
            allowNull: true
        });
    },

    down: (queryInterface) => {
        return queryInterface.removeColumn('GameAccounts', 'tutorial_data');
    }
};
