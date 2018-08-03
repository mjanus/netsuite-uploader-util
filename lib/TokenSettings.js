var TokenSettings = function() {

};

TokenSettings.prototype = {
    getConsumerKey: function () {
        return this.consumerKey;
    },

    setConsumerKey: function (consumerKey) {
        this.consumerKey = consumerKey;

        return this
    },
    getConsumerSecret: function () {
        return this.consumerSecret;
    },

    setConsumerSecret: function (consumerSecret) {
        this.consumerSecret = consumerSecret;

        return this
    },
    getTokenKey: function () {
        return this.tokenKey;
    },

    setTokenKey: function (tokenKey) {
        this.tokenKey = tokenKey;

        return this
    },
    getTokenSecret: function () {
        return this.tokenSecret;
    },

    setTokenSecret: function (tokenSecret) {
        this.tokenSecret = tokenSecret;

        return this
    },
    useTokenBasedAuthentication: function () {
        return this.useTokenBasedAuthentication || false;
    },

    setUseTokenBasedAuthentication: function (useTokenBasedAuthentication) {
        this.useTokenBasedAuthentication = useTokenBasedAuthentication;

        return this
    },

    validate: function () {
        if (!this.getAccount()) {
            throw 'account is required';
        }

        if(!this.getConsumerKey()) {
            throw 'consumerKey is required';
        }

        if(!this.getConsumerSecret()) {
            throw 'consumerSecret is required';
        }

        if(!this.getTokenKey()) {
            throw 'tokenKey is required';
        }

        if(!this.getTokenSecret())  {
            throw 'tokenSecret is required';
        }
    }
};

module.exports = TokenSettings;