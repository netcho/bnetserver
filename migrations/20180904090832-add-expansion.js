'use strict';

module.exports = {
  up: (queryInterface, Sequelize) => {
      return queryInterface.addColumn('GameAccounts', 'expansion', {
          type: Sequelize.TINYINT,
          allowNull: false,
          defaultValue: 6
      });
  },

  down: (queryInterface) => {
    return queryInterface.removeColumn('GameAccounts', 'expansion');
  }
};
