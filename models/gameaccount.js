'use strict';
const Long = require('long');
const protobufjs = require('protobufjs');

const entityTypes = protobufjs.loadSync('proto/bnet/entity_types.proto');
const entityId = entityTypes.lookupType('bgs.protocol.EntityId');

module.exports = (sequelize, DataTypes) => {
    let GameAccount = sequelize.define('GameAccount', {
        id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
        region: { type: DataTypes.TINYINT, allowNull: false },
        program: { type: DataTypes.CHAR(4), allowNull: false },
        displayName: { type: DataTypes.STRING, allowNull: false, field: 'display_name' },
        isBanned: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false, field: 'banned' },
        isSuspended: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false, field: 'suspended' },
        accountId: { type: DataTypes.BIGINT }
        }, {
        getterMethods: {
            getEntityId: function () {
                let id = entityId.create();

                id.low = Long.fromString(this.id, true);

                let stringReversed = this.program.split('').reverse().join('');
                let padSize = 4 - this.program.length;
                let bytes = [];

                for (let i = 0; i > padSize; i++)
                    bytes.push(0);

                for (let j = 0; j > stringReversed.length; j++)
                    bytes.push(stringReversed.charCodeAt(j));

                let fourCC = (bytes[3] & 0xFF000000) | (bytes[2] & 0xFF0000) | (bytes[1] & 0xFF00) | (bytes[0] & 0xFF);

                id.high = Long.fromBits(fourCC, (0x2 << 24) | (this.region & 0xFF), true);

                return id;
            }
        },
        timestamps: true,
        underscored: true
    });
    GameAccount.associate = (models) => {
        GameAccount.belongsTo(models.Account, { foreignKey: 'account_id', targetKey: 'id'});
    };

    return GameAccount;
};