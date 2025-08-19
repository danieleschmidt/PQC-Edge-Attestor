/**
 * @file localizationManager.js
 * @brief Internationalization (i18n) manager for global PQC Edge Attestor deployment
 * @description Handles multi-language support, cultural adaptations, and locale-specific configurations
 */

const EventEmitter = require('events');
const path = require('path');
const fs = require('fs').promises;

/**
 * @class LocalizationManager
 * @brief Manages internationalization and localization for global deployment
 */
class LocalizationManager extends EventEmitter {
    constructor(options = {}) {
        super();
        
        this.options = {
            // Language settings
            defaultLocale: options.defaultLocale || 'en-US',
            supportedLocales: options.supportedLocales || [
                'en-US', 'en-GB', 'fr-FR', 'de-DE', 'es-ES', 'it-IT',
                'ja-JP', 'ko-KR', 'zh-CN', 'zh-TW', 'ar-SA', 'pt-BR'
            ],
            fallbackLocale: options.fallbackLocale || 'en-US',
            
            // Resource paths
            resourcePath: options.resourcePath || './src/i18n/resources',
            cacheTranslations: options.cacheTranslations !== false,
            
            // Cultural settings
            enableCulturalAdaptation: options.enableCulturalAdaptation !== false,
            dateTimeFormats: options.dateTimeFormats || {},
            numberFormats: options.numberFormats || {},
            
            // RTL support
            enableRTL: options.enableRTL !== false,
            rtlLocales: options.rtlLocales || ['ar-SA', 'he-IL', 'fa-IR'],
            
            // Pluralization
            enablePluralization: options.enablePluralization !== false,
            
            // Regional compliance
            enableRegionalCompliance: options.enableRegionalCompliance !== false,
            complianceRules: options.complianceRules || {},
            
            ...options
        };

        // Translation storage
        this.translations = new Map();
        this.translationCache = new Map();
        
        // Locale-specific configurations
        this.localeConfigs = new Map();
        this.culturalAdaptations = new Map();
        
        // Format configurations
        this.dateTimeFormatters = new Map();
        this.numberFormatters = new Map();
        this.currencyFormatters = new Map();
        
        // Pluralization rules
        this.pluralRules = new Map();
        
        // Statistics
        this.stats = {
            localesLoaded: 0,
            translationsLoaded: 0,
            translationRequests: 0,
            fallbacksUsed: 0,
            cacheHits: 0,
            cacheMisses: 0
        };

        this.initialized = false;
    }

    async initialize() {
        if (this.initialized) return;

        try {
            // Load translations for all supported locales
            await this._loadTranslations();
            
            // Initialize locale configurations
            await this._initializeLocaleConfigs();
            
            // Set up formatters
            this._setupFormatters();
            
            // Initialize pluralization rules
            this._initializePluralizationRules();
            
            // Load cultural adaptations
            await this._loadCulturalAdaptations();
            
            this.initialized = true;
            this.emit('initialized', {
                defaultLocale: this.options.defaultLocale,
                supportedLocales: this.options.supportedLocales,
                localesLoaded: this.stats.localesLoaded
            });

        } catch (error) {
            throw new Error(`Localization manager initialization failed: ${error.message}`);
        }
    }

    translate(key, locale = null, params = {}) {
        this.stats.translationRequests++;
        
        const targetLocale = locale || this.options.defaultLocale;
        const cacheKey = `${targetLocale}:${key}:${JSON.stringify(params)}`;
        
        // Check cache first
        if (this.options.cacheTranslations && this.translationCache.has(cacheKey)) {
            this.stats.cacheHits++;
            return this.translationCache.get(cacheKey);
        }
        
        this.stats.cacheMisses++;
        
        try {
            // Get translation
            let translation = this._getTranslation(key, targetLocale);
            
            // Apply pluralization if needed
            if (params.count !== undefined && this.options.enablePluralization) {
                translation = this._applyPluralization(translation, params.count, targetLocale);
            }
            
            // Interpolate parameters
            translation = this._interpolateParams(translation, params);
            
            // Apply cultural adaptations
            if (this.options.enableCulturalAdaptation) {
                translation = this._applyCulturalAdaptation(translation, targetLocale);
            }
            
            // Cache result
            if (this.options.cacheTranslations) {
                this.translationCache.set(cacheKey, translation);
            }
            
            return translation;
            
        } catch (error) {
            this.emit('translation-error', {
                key,
                locale: targetLocale,
                error: error.message
            });
            
            return key; // Return key as fallback
        }
    }

    formatDateTime(date, locale = null, options = {}) {
        const targetLocale = locale || this.options.defaultLocale;
        const formatter = this.dateTimeFormatters.get(targetLocale);
        
        if (!formatter) {
            // Create formatter for this locale
            const formatOptions = {
                ...this._getDefaultDateTimeFormat(targetLocale),
                ...options
            };
            
            const newFormatter = new Intl.DateTimeFormat(targetLocale, formatOptions);
            this.dateTimeFormatters.set(targetLocale, newFormatter);
            return newFormatter.format(date);
        }
        
        return formatter.format(date);
    }

    formatNumber(number, locale = null, options = {}) {
        const targetLocale = locale || this.options.defaultLocale;
        const formatter = this.numberFormatters.get(targetLocale);
        
        if (!formatter) {
            const formatOptions = {
                ...this._getDefaultNumberFormat(targetLocale),
                ...options
            };
            
            const newFormatter = new Intl.NumberFormat(targetLocale, formatOptions);
            this.numberFormatters.set(targetLocale, newFormatter);
            return newFormatter.format(number);
        }
        
        return formatter.format(number);
    }

    formatCurrency(amount, currency, locale = null) {
        const targetLocale = locale || this.options.defaultLocale;
        const cacheKey = `${targetLocale}-${currency}`;
        
        let formatter = this.currencyFormatters.get(cacheKey);
        
        if (!formatter) {
            formatter = new Intl.NumberFormat(targetLocale, {
                style: 'currency',
                currency: currency.toUpperCase()
            });
            this.currencyFormatters.set(cacheKey, formatter);
        }
        
        return formatter.format(amount);
    }

    getLocaleConfig(locale = null) {
        const targetLocale = locale || this.options.defaultLocale;
        return this.localeConfigs.get(targetLocale) || this.localeConfigs.get(this.options.fallbackLocale);
    }

    isRTL(locale = null) {
        const targetLocale = locale || this.options.defaultLocale;
        return this.options.rtlLocales.includes(targetLocale);
    }

    getDirection(locale = null) {
        return this.isRTL(locale) ? 'rtl' : 'ltr';
    }

    async addTranslations(locale, translations) {
        if (!this.translations.has(locale)) {
            this.translations.set(locale, new Map());
        }
        
        const localeTranslations = this.translations.get(locale);
        
        for (const [key, value] of Object.entries(translations)) {
            localeTranslations.set(key, value);
        }
        
        // Clear cache for this locale
        this._clearCacheForLocale(locale);
        
        this.emit('translations-added', { locale, count: Object.keys(translations).length });
    }

    getSupportedLocales() {
        return [...this.options.supportedLocales];
    }

    getStats() {
        return {
            ...this.stats,
            cachedTranslations: this.translationCache.size,
            supportedLocales: this.options.supportedLocales.length,
            totalTranslations: Array.from(this.translations.values())
                .reduce((total, localeMap) => total + localeMap.size, 0)
        };
    }

    async cleanup() {
        // Clear caches
        this.translationCache.clear();
        this.dateTimeFormatters.clear();
        this.numberFormatters.clear();
        this.currencyFormatters.clear();
        
        this.initialized = false;
        this.emit('cleanup-complete');
    }

    // Private methods

    async _loadTranslations() {
        const resourcePath = this.options.resourcePath;
        
        for (const locale of this.options.supportedLocales) {
            try {
                await this._loadLocaleTranslations(locale, resourcePath);
                this.stats.localesLoaded++;
            } catch (error) {
                this.emit('locale-load-failed', {
                    locale,
                    error: error.message
                });
            }
        }
    }

    async _loadLocaleTranslations(locale, resourcePath) {
        const localeFile = path.join(resourcePath, `${locale}.json`);
        
        try {
            // Try to read existing file
            const content = await fs.readFile(localeFile, 'utf8');
            const translations = JSON.parse(content);
            
            this.translations.set(locale, new Map(Object.entries(translations)));
            this.stats.translationsLoaded += Object.keys(translations).length;
            
        } catch (error) {
            // Create default translations if file doesn't exist
            await this._createDefaultTranslations(locale, localeFile);
        }
    }

    async _createDefaultTranslations(locale, filePath) {
        const defaultTranslations = this._getDefaultTranslations(locale);
        
        // Ensure directory exists
        await fs.mkdir(path.dirname(filePath), { recursive: true });
        
        // Write default translations
        await fs.writeFile(filePath, JSON.stringify(defaultTranslations, null, 2));
        
        this.translations.set(locale, new Map(Object.entries(defaultTranslations)));
        this.stats.translationsLoaded += Object.keys(defaultTranslations).length;
    }

    _getDefaultTranslations(locale) {
        const baseTranslations = {
            // Common system messages
            'system.initializing': 'Initializing system...',
            'system.ready': 'System ready',
            'system.error': 'System error occurred',
            
            // Authentication
            'auth.login': 'Login',
            'auth.logout': 'Logout',
            'auth.username': 'Username',
            'auth.password': 'Password',
            'auth.invalid_credentials': 'Invalid credentials',
            
            // Cryptographic operations
            'crypto.generating_keys': 'Generating cryptographic keys...',
            'crypto.key_generation_complete': 'Key generation complete',
            'crypto.encryption_in_progress': 'Encryption in progress...',
            'crypto.decryption_in_progress': 'Decryption in progress...',
            'crypto.signature_verification': 'Verifying digital signature...',
            
            // Device management
            'device.status_online': 'Device online',
            'device.status_offline': 'Device offline',
            'device.attestation_in_progress': 'Attestation in progress...',
            'device.update_available': 'Update available',
            'device.update_installing': 'Installing update...',
            
            // Error messages
            'error.network_timeout': 'Network timeout',
            'error.invalid_input': 'Invalid input provided',
            'error.unauthorized': 'Unauthorized access',
            'error.service_unavailable': 'Service temporarily unavailable',
            
            // Success messages
            'success.operation_completed': 'Operation completed successfully',
            'success.data_saved': 'Data saved successfully',
            'success.configuration_updated': 'Configuration updated',
            
            // Pluralization examples
            'items_count': 'item|items',
            'bytes_transferred': 'byte transferred|bytes transferred',
            'devices_connected': 'device connected|devices connected'
        };

        // Customize for specific locales
        if (locale.startsWith('fr')) {
            return {
                ...baseTranslations,
                'system.initializing': 'Initialisation du système...',
                'system.ready': 'Système prêt',
                'auth.login': 'Connexion',
                'auth.logout': 'Déconnexion',
                'crypto.generating_keys': 'Génération des clés cryptographiques...'
            };
        } else if (locale.startsWith('de')) {
            return {
                ...baseTranslations,
                'system.initializing': 'System wird initialisiert...',
                'system.ready': 'System bereit',
                'auth.login': 'Anmelden',
                'auth.logout': 'Abmelden',
                'crypto.generating_keys': 'Kryptographische Schlüssel werden generiert...'
            };
        } else if (locale.startsWith('es')) {
            return {
                ...baseTranslations,
                'system.initializing': 'Inicializando sistema...',
                'system.ready': 'Sistema listo',
                'auth.login': 'Iniciar sesión',
                'auth.logout': 'Cerrar sesión',
                'crypto.generating_keys': 'Generando claves criptográficas...'
            };
        } else if (locale.startsWith('ja')) {
            return {
                ...baseTranslations,
                'system.initializing': 'システムを初期化中...',
                'system.ready': 'システム準備完了',
                'auth.login': 'ログイン',
                'auth.logout': 'ログアウト',
                'crypto.generating_keys': '暗号化キーを生成中...'
            };
        } else if (locale.startsWith('zh')) {
            return {
                ...baseTranslations,
                'system.initializing': '正在初始化系统...',
                'system.ready': '系统就绪',
                'auth.login': '登录',
                'auth.logout': '注销',
                'crypto.generating_keys': '正在生成加密密钥...'
            };
        }

        return baseTranslations;
    }

    async _initializeLocaleConfigs() {
        for (const locale of this.options.supportedLocales) {
            const config = {
                locale,
                direction: this.isRTL(locale) ? 'rtl' : 'ltr',
                dateFormat: this._getDefaultDateFormat(locale),
                timeFormat: this._getDefaultTimeFormat(locale),
                numberFormat: this._getDefaultNumberFormat(locale),
                currency: this._getDefaultCurrency(locale),
                firstDayOfWeek: this._getFirstDayOfWeek(locale),
                decimalSeparator: this._getDecimalSeparator(locale),
                thousandsSeparator: this._getThousandsSeparator(locale)
            };
            
            this.localeConfigs.set(locale, config);
        }
    }

    _setupFormatters() {
        for (const locale of this.options.supportedLocales) {
            // Date/time formatters
            this.dateTimeFormatters.set(locale, new Intl.DateTimeFormat(locale, {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            }));
            
            // Number formatters
            this.numberFormatters.set(locale, new Intl.NumberFormat(locale));
        }
    }

    _initializePluralizationRules() {
        // Simple pluralization rules - can be extended with more sophisticated rules
        for (const locale of this.options.supportedLocales) {
            if (locale.startsWith('en')) {
                this.pluralRules.set(locale, this._englishPluralRule);
            } else if (locale.startsWith('fr')) {
                this.pluralRules.set(locale, this._frenchPluralRule);
            } else if (locale.startsWith('de')) {
                this.pluralRules.set(locale, this._germanPluralRule);
            } else if (locale.startsWith('es')) {
                this.pluralRules.set(locale, this._spanishPluralRule);
            } else {
                this.pluralRules.set(locale, this._englishPluralRule); // Default fallback
            }
        }
    }

    async _loadCulturalAdaptations() {
        // Load cultural adaptations for each locale
        for (const locale of this.options.supportedLocales) {
            const adaptations = {
                honorifics: this._getHonorifics(locale),
                formalityLevel: this._getFormalityLevel(locale),
                culturalNorms: this._getCulturalNorms(locale)
            };
            
            this.culturalAdaptations.set(locale, adaptations);
        }
    }

    _getTranslation(key, locale) {
        // Try target locale first
        const localeTranslations = this.translations.get(locale);
        if (localeTranslations && localeTranslations.has(key)) {
            return localeTranslations.get(key);
        }
        
        // Try fallback locale
        const fallbackTranslations = this.translations.get(this.options.fallbackLocale);
        if (fallbackTranslations && fallbackTranslations.has(key)) {
            this.stats.fallbacksUsed++;
            return fallbackTranslations.get(key);
        }
        
        throw new Error(`Translation not found for key: ${key}`);
    }

    _applyPluralization(translation, count, locale) {
        if (!translation.includes('|')) {
            return translation;
        }
        
        const forms = translation.split('|');
        const pluralRule = this.pluralRules.get(locale) || this._englishPluralRule;
        const formIndex = pluralRule(count);
        
        return forms[formIndex] || forms[0];
    }

    _interpolateParams(translation, params) {
        let result = translation;
        
        for (const [key, value] of Object.entries(params)) {
            const placeholder = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
            result = result.replace(placeholder, value);
        }
        
        return result;
    }

    _applyCulturalAdaptation(translation, locale) {
        const adaptations = this.culturalAdaptations.get(locale);
        if (!adaptations) {
            return translation;
        }
        
        // Apply formality adaptations, honorifics, etc.
        // This is a simplified implementation
        return translation;
    }

    _clearCacheForLocale(locale) {
        const keysToDelete = [];
        
        for (const cacheKey of this.translationCache.keys()) {
            if (cacheKey.startsWith(`${locale}:`)) {
                keysToDelete.push(cacheKey);
            }
        }
        
        keysToDelete.forEach(key => this.translationCache.delete(key));
    }

    // Locale-specific helper methods

    _getDefaultDateFormat(locale) {
        const formats = {
            'en-US': 'MM/dd/yyyy',
            'en-GB': 'dd/MM/yyyy',
            'fr-FR': 'dd/MM/yyyy',
            'de-DE': 'dd.MM.yyyy',
            'ja-JP': 'yyyy/MM/dd',
            'zh-CN': 'yyyy-MM-dd'
        };
        
        return formats[locale] || 'dd/MM/yyyy';
    }

    _getDefaultTimeFormat(locale) {
        const formats = {
            'en-US': '12', // 12-hour
            'en-GB': '24', // 24-hour
            'fr-FR': '24',
            'de-DE': '24',
            'ja-JP': '24',
            'zh-CN': '24'
        };
        
        return formats[locale] || '24';
    }

    _getDefaultNumberFormat(locale) {
        return {
            minimumFractionDigits: 0,
            maximumFractionDigits: 2
        };
    }

    _getDefaultDateTimeFormat(locale) {
        return {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        };
    }

    _getDefaultCurrency(locale) {
        const currencies = {
            'en-US': 'USD',
            'en-GB': 'GBP',
            'fr-FR': 'EUR',
            'de-DE': 'EUR',
            'ja-JP': 'JPY',
            'zh-CN': 'CNY',
            'zh-TW': 'TWD'
        };
        
        return currencies[locale] || 'USD';
    }

    _getFirstDayOfWeek(locale) {
        // 0 = Sunday, 1 = Monday
        const firstDays = {
            'en-US': 0,
            'en-GB': 1,
            'fr-FR': 1,
            'de-DE': 1,
            'ja-JP': 0,
            'zh-CN': 1
        };
        
        return firstDays[locale] || 1;
    }

    _getDecimalSeparator(locale) {
        const separators = {
            'en-US': '.',
            'en-GB': '.',
            'fr-FR': ',',
            'de-DE': ',',
            'ja-JP': '.',
            'zh-CN': '.'
        };
        
        return separators[locale] || '.';
    }

    _getThousandsSeparator(locale) {
        const separators = {
            'en-US': ',',
            'en-GB': ',',
            'fr-FR': ' ',
            'de-DE': '.',
            'ja-JP': ',',
            'zh-CN': ','
        };
        
        return separators[locale] || ',';
    }

    _getHonorifics(locale) {
        // Cultural honorifics and titles
        const honorifics = {
            'ja-JP': ['さん', '様', '先生', '君'],
            'ko-KR': ['씨', '님', '선생님'],
            'zh-CN': ['先生', '女士', '老师'],
            'de-DE': ['Herr', 'Frau', 'Dr.'],
            'fr-FR': ['Monsieur', 'Madame', 'Docteur']
        };
        
        return honorifics[locale] || [];
    }

    _getFormalityLevel(locale) {
        // Default formality level for the locale
        const formality = {
            'ja-JP': 'high',
            'ko-KR': 'high',
            'de-DE': 'medium',
            'fr-FR': 'medium',
            'en-US': 'low',
            'en-GB': 'medium'
        };
        
        return formality[locale] || 'medium';
    }

    _getCulturalNorms(locale) {
        return {
            useHonorificsByDefault: ['ja-JP', 'ko-KR'].includes(locale),
            preferDirectCommunication: ['en-US', 'de-DE'].includes(locale),
            emphasizeHierarchy: ['ja-JP', 'ko-KR', 'zh-CN'].includes(locale)
        };
    }

    // Pluralization rules

    _englishPluralRule(count) {
        return count === 1 ? 0 : 1;
    }

    _frenchPluralRule(count) {
        return count <= 1 ? 0 : 1;
    }

    _germanPluralRule(count) {
        return count === 1 ? 0 : 1;
    }

    _spanishPluralRule(count) {
        return count === 1 ? 0 : 1;
    }
}

module.exports = { LocalizationManager };