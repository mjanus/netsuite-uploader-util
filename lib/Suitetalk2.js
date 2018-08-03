var Cache = require('Cache');
var restlet = require('./restlet');
var path = require('path');

var SuiteTalk = function() {
    this.directoryCache = new Cache();
};

SuiteTalk.prototype = {
    nsVersion: '2015_1',

    init: function (connectionSettings) {
        if (!connectionSettings) {
            throw 'Connection settings required';
        }

        connectionSettings.validate();

        this.connectionSettings = connectionSettings;

        if (connectionSettings.getHostname()) {
            var deferred = Q.defer();
            deferred.resolve();
            return deferred.promise;
        }

        return this._fetchDataCenter();
    },

    _fetchDataCenter: function() {
        var deferred = Q.defer();

        restlet.getDataCenter(connectionSettings)
            .then(this._onDataCenterRetrieved.bind(this, deferred))
            .catch(function(ex) {
                self.log('getDataCenter', ex)
            });

        return deferred.promise;
    },

    _fetchDataCenterByAccount: function() {
        var deferred = Q.defer();

        restlet.getDataCenterByAccount(connectionSettings.getAccount())
            .then(this._onDataCenterRetrieved.bind(this, deferred))
            .catch(function(ex) {
                self.log('getDataCenter', ex)
            });

        return deferred.promise;
    },

    _onDataCenterRetrieved: function (deferred, dataCenter) {
        this.connectionSettings.setHostname(path.basename(dataCenter.dataCenterURLs.webservicesDomain));
        deferred.resolve();
    },

    generateTokenTimestamp: function (){
        var timestamp = Math.floor((new Date()).getTime() / 1000);
        return timestamp;
    },

    nonce_chars: ['a','b','c','d','e','f','g','h','i','j','k','l','m','n',
        'o','p','q','r','s','t','u','v','w','x','y','z','A','B',
        'C','D','E','F','G','H','I','J','K','L','M','N','O','P',
        'Q','R','S','T','U','V','W','X','Y','Z','0','1','2','3',
        '4','5','6','7','8','9'],

    generateTokenNonce: function(nonceLength) {
        nonceLength = nonceLength || 20;

        var index;
        var result = [];
        for(var i = 0; i < nonceLength; i++){
            index = Math.floor(Math.random() * this.nonce_chars.length);
            result[i] = this.nonce_chars[index];
        }
        var nonce = result.join('');

        return nonce;
    },

    /**
     * @param {TokenSettings} tokenSettings
     */
    initTokenBasedAuthentication: function (tokenSettings) {
        tokenSettings.validate();
        tokenSettings.setUseTokenBasedAuthentication(true);

        this.tokenSettings = tokenSettings;

        if (self.hostname) {
            var deferred = Q.defer();
            deferred.resolve();
            return deferred.promise;
        }

        return this._fetchDataCenterByAccount();
    }


};

module.exports = SuiteTalk;