const { DataTypes } = require('sequelize');

module.exports = {
  up: async (queryInterface) => {
    await queryInterface.createTable('devices', {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
        allowNull: false
      },
      serial_number: {
        type: DataTypes.STRING(64),
        allowNull: false,
        unique: true,
        validate: {
          len: [8, 64],
          isAlphanumeric: true
        }
      },
      device_type: {
        type: DataTypes.ENUM('smart_meter', 'ev_charger', 'gateway', 'sensor'),
        allowNull: false
      },
      hardware_version: {
        type: DataTypes.STRING(32),
        allowNull: false,
        validate: {
          is: /^\d+\.\d+\.\d+$/
        }
      },
      firmware_version: {
        type: DataTypes.STRING(32),
        allowNull: false,
        validate: {
          is: /^\d+\.\d+\.\d+(-[a-zA-Z0-9]+)?$/
        }
      },
      manufacturer: {
        type: DataTypes.STRING(100),
        allowNull: false,
        validate: {
          len: [2, 100]
        }
      },
      model: {
        type: DataTypes.STRING(100),
        allowNull: false,
        validate: {
          len: [2, 100]
        }
      },
      status: {
        type: DataTypes.ENUM('unprovisioned', 'provisioned', 'active', 'inactive', 'revoked'),
        allowNull: false,
        defaultValue: 'unprovisioned'
      },
      provisioned_at: {
        type: DataTypes.DATE,
        allowNull: true
      },
      last_seen: {
        type: DataTypes.DATE,
        allowNull: true
      },
      pqc_algorithms: {
        type: DataTypes.JSONB,
        allowNull: true,
        defaultValue: {}
      },
      certificates: {
        type: DataTypes.JSONB,
        allowNull: true,
        defaultValue: {}
      },
      attestation_policy: {
        type: DataTypes.JSONB,
        allowNull: true,
        defaultValue: {}
      },
      network_config: {
        type: DataTypes.JSONB,
        allowNull: true,
        defaultValue: {}
      },
      metadata: {
        type: DataTypes.JSONB,
        allowNull: true,
        defaultValue: {}
      },
      created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW
      },
      updated_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW
      }
    });

    // Create indexes for performance
    await queryInterface.addIndex('devices', ['serial_number'], {
      unique: true,
      name: 'devices_serial_number_unique'
    });

    await queryInterface.addIndex('devices', ['device_type'], {
      name: 'devices_device_type_index'
    });

    await queryInterface.addIndex('devices', ['status'], {
      name: 'devices_status_index'
    });

    await queryInterface.addIndex('devices', ['manufacturer', 'model'], {
      name: 'devices_manufacturer_model_index'
    });

    await queryInterface.addIndex('devices', ['last_seen'], {
      name: 'devices_last_seen_index'
    });

    await queryInterface.addIndex('devices', ['created_at'], {
      name: 'devices_created_at_index'
    });

    // Create partial index for active devices
    await queryInterface.addIndex('devices', ['status', 'last_seen'], {
      name: 'devices_active_last_seen_index',
      where: {
        status: 'active'
      }
    });

    // Add constraints
    await queryInterface.addConstraint('devices', {
      fields: ['serial_number'],
      type: 'check',
      name: 'devices_serial_number_format',
      where: {
        serial_number: {
          [require('sequelize').Op.regexp]: '^[A-Za-z0-9\\-_]+$'
        }
      }
    });
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable('devices');
  }
};