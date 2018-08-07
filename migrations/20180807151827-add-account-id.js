'use strict';

module.exports = {
    up: (queryInterface, Sequelize) => {
        return queryInterface.addColumn('GameAccounts', 'account_id', {
            type: Sequelize.BIGINT,
            allowNull: false
        }).then(() => {
            return queryInterface.addConstraint('GameAccounts', ['account_id'], {
                type: 'foreign key',
                name: 'account_key',
                references: {
                    table: 'accounts',
                    field: 'id'
                },
                onDelete: 'cascade',
                onUpdate: 'cascade'
            });
        });
    },

    down: (queryInterface) => {
        return queryInterface.removeColumn('GameAccounts', 'account_id');
    }
};
