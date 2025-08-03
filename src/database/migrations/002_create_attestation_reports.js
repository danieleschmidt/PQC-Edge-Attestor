const { DataTypes } = require('sequelize');

module.exports = {
  up: async (queryInterface) => {
    await queryInterface.createTable('attestation_reports', {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
        allowNull: false
      },
      device_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
          model: 'devices',
          key: 'id'
        },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE'
      },
      report_hash: {
        type: DataTypes.STRING(64),
        allowNull: false,
        unique: true,
        validate: {
          is: /^[a-f0-9]{64}$/
        }
      },
      nonce: {
        type: DataTypes.STRING(64),
        allowNull: false,
        validate: {
          is: /^[a-f0-9]+$/,
          len: [16, 64]
        }
      },
      measurements: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: {}
      },
      signature: {
        type: DataTypes.TEXT,
        allowNull: false
      },
      signature_algorithm: {
        type: DataTypes.ENUM('dilithium3', 'dilithium5', 'falcon512', 'falcon1024', 'hybrid'),
        allowNull: false,
        defaultValue: 'dilithium5'
      },
      attestation_level: {
        type: DataTypes.ENUM('device', 'component', 'system'),
        allowNull: false,
        defaultValue: 'device'
      },
      platform_info: {
        type: DataTypes.JSONB,
        allowNull: true,
        defaultValue: {}
      },
      verification_result: {
        type: DataTypes.BOOLEAN,
        allowNull: true
      },
      verification_details: {
        type: DataTypes.JSONB,
        allowNull: true,
        defaultValue: {}
      },
      risk_assessment: {
        type: DataTypes.JSONB,
        allowNull: true,
        defaultValue: {}
      },
      policy_compliance: {
        type: DataTypes.BOOLEAN,
        allowNull: true
      },
      processed_at: {
        type: DataTypes.DATE,
        allowNull: true
      },
      expires_at: {
        type: DataTypes.DATE,
        allowNull: true
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
    await queryInterface.addIndex('attestation_reports', ['device_id'], {
      name: 'attestation_reports_device_id_index'
    });

    await queryInterface.addIndex('attestation_reports', ['report_hash'], {
      unique: true,
      name: 'attestation_reports_hash_unique'
    });

    await queryInterface.addIndex('attestation_reports', ['verification_result'], {
      name: 'attestation_reports_verification_index'
    });

    await queryInterface.addIndex('attestation_reports', ['signature_algorithm'], {
      name: 'attestation_reports_algorithm_index'
    });

    await queryInterface.addIndex('attestation_reports', ['created_at'], {
      name: 'attestation_reports_created_at_index'
    });

    await queryInterface.addIndex('attestation_reports', ['expires_at'], {
      name: 'attestation_reports_expires_at_index'
    });

    // Composite indexes for common queries
    await queryInterface.addIndex('attestation_reports', ['device_id', 'created_at'], {
      name: 'attestation_reports_device_time_index'
    });

    await queryInterface.addIndex('attestation_reports', ['device_id', 'verification_result'], {
      name: 'attestation_reports_device_verification_index'
    });

    // Partial indexes for performance
    await queryInterface.addIndex('attestation_reports', ['device_id', 'created_at'], {
      name: 'attestation_reports_valid_recent_index',
      where: {
        verification_result: true,
        expires_at: {
          [require('sequelize').Op.gt]: new Date()
        }
      }
    });

    // GIN index for JSONB fields
    await queryInterface.addIndex('attestation_reports', ['measurements'], {
      name: 'attestation_reports_measurements_gin',
      using: 'gin'
    });

    await queryInterface.addIndex('attestation_reports', ['risk_assessment'], {
      name: 'attestation_reports_risk_gin',
      using: 'gin'
    });
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable('attestation_reports');
  }
};