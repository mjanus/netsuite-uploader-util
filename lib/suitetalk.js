module.exports = (function () {
	
    var Q = require('q'),
        https = require('https'),
        restlet = require('./restlet'),
        path = require('path'),
        format = require('string-template'),
        fs = require('fs'),
        oauth = require('oauth'),
        crypto = require('crypto');

    var folder_cache = {};


    function SuiteTalk() {
        let self = this;

        self.nsVersionLatestKnown = '2017_2'

        // Properties
        self.email = '';
        self.password = '';
        self.account = '';
        self.role = '';
        self.hostname = '';
        self.globalApplicationIdFragment = '';

        self.consumerKey = '';
        self.consumerSecret = '';
        self.tokenKey = '';
        self.tokenSecret = '';
        self.useTokenBasedAuthentication = false;

        // Behaviors
        self.init = init;
        self.initTokenBasedAuthentication = initTokenBasedAuthentication;
        self.upload = upload;

        // Public Implementations:
        /**
         * @param {String} email 
         * @param {String} password 
         * @param {String} account 
         * @param {String} role 
         * @param {String} applicationId 
         * @param {String} nsVersion something like '2017_2'. If you use 2015_2 or later you could also need to indicate an application id. If ommited and no applicationId is passed 2015_1 is used, otherwhise the latest known that currently is 2017_2
         */
        function init(email, password, account, role, applicationId, nsVersion) {
            if (!email)
                throw 'email is required';
            if (!password)
                throw 'password is required';
            if (!account)
                throw 'account is required';
            if (!role)
                throw 'role is required';
            self.email = email;
            self.password = password;
            self.account = account;
            self.role = role;

            if (self.applicationId && !nsVersion) {
                nsVersion = self.nsVersionLatestKnown
            }
            self.nsVersion = nsVersion || '2015_1';

            let nsVersionLaterThan2015_2 = parseInt(self.nsVersion.replace('_', '.'), 10) > 2015.19;

            self.applicationId = applicationId;
            if (nsVersionLaterThan2015_2 && !self.applicationId) {
                self.log('WARNING - using suitetalk greater than 2015_2 requires that you also provide an applicationId which you didn\'t');
            }

            self.globalApplicationIdFragment = self.applicationId ? `<applicationInfo xmlns="urn:messages_{{ nsVersion }}.platform.webservices.netsuite.com"><applicationId xmlns="urn:core_{{ nsVersion }}.platform.webservices.netsuite.com">${applicationId}</applicationId></applicationInfo>` : ``;

            var deferred = Q.defer();

            if (self.hostname) {
                deferred.resolve();
            } else {
                restlet.getDataCenter(email, password, account, role).then(function (dataCenter) {
                    self.hostname = path.basename(dataCenter.dataCenterURLs.webservicesDomain);
                    deferred.resolve();
                }).catch((ex) => { self.log('getDataCenter', ex) });
            }

            return deferred.promise;
        }

        /**
         * @param {String} account 
         * @param {String} consumerKey 
         * @param {String} consumerSecret 
         * @param {String} tokenKey 
         * @param {String} tokenSecret 
         * @param {String} nsVersion something like '2017_2'. 
         */
        function initTokenBasedAuthentication(account, consumerKey, consumerSecret, tokenKey, tokenSecret, nsVersion)
        {
            if(!account)
                throw 'account is required';
            if(!consumerKey)
                throw 'consumerKey is required';
            if(!consumerSecret)
                throw 'consumerSecret is required';
            if(!tokenKey)
                throw 'tokenKey is required';
            if(!tokenSecret)
                throw 'tokenSecret is required';

            self.account = account;
            self.consumerKey = consumerKey;
            self.consumerSecret = consumerSecret;
            self.tokenKey = tokenKey;
            self.tokenSecret = tokenSecret;

            self.nsVersion = nsVersion || self.nsVersionLatestKnown;
            self.useTokenBasedAuthentication = true;

            var deferred = Q.defer();

            if (self.hostname) {
                deferred.resolve();
            } else {
                restlet.getDataCenterByAccount(account).then(function (dataCenter) {
                    self.hostname = path.basename(dataCenter.dataCenterURLs.webservicesDomain);
                    deferred.resolve();
                }).catch((ex) => { self.log('getDataCenterByAccount', ex) });
            }

            return deferred.promise;
        }

        function upload(target, dest, recordElements) {
            if (!self.hostname)
                throw 'Must call init first';

            recordElements = recordElements || {};

            return getParentFolderId(dest).then(function (parent) {
                var name = dest.split('/').pop();
                return uploadFile(parent, name, target, recordElements);
            }).catch((ex) => { self.log('getParentFolderId', ex) });

            function getParentFolderId(dest) {
                var deferred = Q.defer();

                var dest_parts = dest.split('/').filter(function (p) { return p });
                function step(parent) {
                    if (dest_parts.length == 1) {
                        deferred.resolve(parent);
                    } else {
                        getFolderId(parent, dest_parts.shift()).then(step).catch((ex) => { self.log('getFolderId', ex) });
                    }
                }
                step();

                return deferred.promise;
            }
        }

        // Private Implementations:

        function formatXML(xmltemplate, fields) {
            var params = {
                email: self.email,
                password: self.password,
                account: self.account,
                role: self.role
            };
            for (var i in fields) {
                params[i] = fields[i];
            }
            return format(xmltemplate, params);
        }

        function generateSOAPHeader(){
            var header =
            `<soap:Header>
                ${self.useTokenBasedAuthentication ? generateTokenPassport() : generatePassport()}
                ${self.globalApplicationIdFragment}
            </soap:Header>`;

            return header;
        };

        function generatePassport(){
            var passport =
            `<passport xmlns="urn:messages_{{ nsVersion }}.platform.webservices.netsuite.com">
                <email xmlns="urn:core_{{ nsVersion }}.platform.webservices.netsuite.com">${self.email}</email>
                <password xmlns="urn:core_{{ nsVersion }}.platform.webservices.netsuite.com">${self.password}</password>
                <account xmlns="urn:core_{{ nsVersion }}.platform.webservices.netsuite.com">${self.account}</account>
                <role internalId="${self.role}" xmlns="urn:core_{{ nsVersion }}.platform.webservices.netsuite.com" />
            </passport>`;

            return passport;
        };

        function generateTokenPassport(){
            var nonce = generateTokenNonce();
            var timestamp = generateTokenTimestamp();
            var signature = generateTokenSignature(nonce, timestamp);

            var passport =
            `<tokenPassport xmlns="urn:messages_{{ nsVersion }}.platform.webservices.netsuite.com">
                <account xmlns="urn:core_{{ nsVersion }}.platform.webservices.netsuite.com">${self.account}</account>
                <consumerKey xmlns="urn:core_{{ nsVersion }}.platform.webservices.netsuite.com">${self.consumerKey}</consumerKey>
                <token xmlns="urn:core_{{ nsVersion }}.platform.webservices.netsuite.com">${self.tokenKey}</token>
                <nonce xmlns="urn:core_{{ nsVersion }}.platform.webservices.netsuite.com">${nonce}</nonce>
                <timestamp xmlns="urn:core_{{ nsVersion }}.platform.webservices.netsuite.com">${timestamp}</timestamp>
                <signature xmlns="urn:core_{{ nsVersion }}.platform.webservices.netsuite.com" algorithm="HMAC_SHA256" >${signature}</signature>
            </tokenPassport>`;

            return passport;
        };

        var nonce_chars = ['a','b','c','d','e','f','g','h','i','j','k','l','m','n',
        'o','p','q','r','s','t','u','v','w','x','y','z','A','B',
        'C','D','E','F','G','H','I','J','K','L','M','N','O','P',
        'Q','R','S','T','U','V','W','X','Y','Z','0','1','2','3',
        '4','5','6','7','8','9'];
        
        function generateTokenNonce(nonceLength){
            nonceLength = nonceLength || 20;

            var index;
            var result = [];
            for(var i = 0; i < nonceLength; i++){
                index = Math.floor(Math.random() * nonce_chars.length);
                result[i] = nonce_chars[index];
            }
            var nonce = result.join('');
            return nonce;
        };

        function generateTokenTimestamp(){
            var timestamp = Math.floor((new Date()).getTime() / 1000);
            return timestamp;
        }

        function generateTokenSignature(nonce, timestamp){
            var signatureKey = self.consumerSecret + '&' + self.tokenSecret;

            var baseString = self.account + '&' + self.consumerKey + '&' + self.tokenKey + '&' + nonce + '&' + timestamp;

            var hmac = crypto.createHmac('sha256', signatureKey);
            hmac.update(baseString);
            var encodedSignature = hmac.digest('base64');

            return encodedSignature;
        }

        function POST(body, soapAction) {
            var deferred = Q.defer();

            var options = {
                hostname: self.hostname,
                port: 443,
                path: `/services/NetSuitePort_{{ nsVersion }}`,
                method: 'POST',
                headers: {
                    'Content-Type': 'text/xml; charset=utf-8'
                }
            };

            if (soapAction) {
                options.headers['SOAPAction'] = soapAction;
            }

            var req = https.request(options, function (res) {
                var res_body = '';
                res.on('data', function (chunk) { res_body += chunk; });
                res.on('end', function () {
                    // self.log('RECEIVED: \r\n' + res_body);
                    var matches = /isSuccess="(.*?)"/.exec(res_body);
                    if (matches) {
                        var result = matches[1];
                        if (result == "false") {
                            var err = /<platformCore:message>([\s|\S]*?)<\/platformCore:message>/.exec(res_body)[1];
                            deferred.reject(err);
                        } else {
                            deferred.resolve(res_body);
                        }
                    } else {
                        matches = /<platformFaults:message>([\s|\S]*?)<\/platformFaults:message>/.exec(res_body);
                        if (matches) {
                            deferred.reject(matches[1]);
                        } else {
                            deferred.reject('Unknown Error: ' + res_body);
                        }
                    }
                });
                res.on('error', function (e) {
                    //self.log('FAILED: ' + e);
                    deferred.reject(e);
                });
            });
            //self.log('SENDING: \r\n' + body);
            req.write(body);
            req.end();
            return deferred.promise;
        }

        //{
        //  hideInBundle : {
        //                      value: 'true'
        //                      node: '<q1:hideInBundle>true</q1:hideInBundle>
        //                  }
        //}
        // value and node are mutually exclusive
        
        function generateRecordElements(recordElements)
        {
            var elements = '';
            for(var key in recordElements){
                var recordElement = recordElements[key];
                if(recordElement.hasOwnProperty('value'))
                {
                    elements += format('<q1:{0}>{1}</q1:{0}>', key, recordElement.value);
                }
                else if(recordElement.hasOwnProperty('node'))
                {
                    elements += recordElement.node;
                }
            };

            return elements;
        }

        function uploadFile(parent, name, target, recordElements) {
            parent = parent || '@NONE@';

            return getFileId(parent, name).then(function (fileid) {
                var xmlAdd = 
                `<?xml version="1.0" encoding="utf-8"?>
                <soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema">
                    ${generateSOAPHeader()}
                    <soap:Body>
                        <add xmlns="urn:messages_{{ nsVersion }}.platform.webservices.netsuite.com">
                            <record xmlns:q1="urn:filecabinet_{{ nsVersion }}.documents.webservices.netsuite.com" xsi:type="q1:File" internalId="">
                                <q1:name>{filename}</q1:name>
                                <q1:content>{content}</q1:content>
                                <q1:folder internalId="{parent}" type="folder" />
                                ${generateRecordElements(recordElements)}
                            </record>
                        </add>
                    </soap:Body>
                </soap:Envelope>`;

                var xmlUpdate = 
                `<?xml version="1.0" encoding="utf-8"?>
                <soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema">
                    ${generateSOAPHeader()}
                    <soap:Body>
                        <update xmlns="urn:messages_{{ nsVersion }}.platform.webservices.netsuite.com">
                            <record xmlns:q1="urn:filecabinet_{{ nsVersion }}.documents.webservices.netsuite.com" xsi:type="q1:File" internalId="{fileid}">
                                <q1:content>{content}</q1:content>
                                ${generateRecordElements(recordElements)}
                            </record>
                        </update>
                    </soap:Body>
                </soap:Envelope>`;
                return readFileContents(target).then(function (content) {
                    var xml = formatXML(fileid ? xmlUpdate : xmlAdd,
                        {
                            filename: name,
                            fileid: fileid,
                            parent: parent,
                            content: content
                        });
                    return POST(xml, fileid ? 'update' : 'add').then(function () {
                        var verb = fileid ? 'Updated ' : 'Added ';
                        self.log(verb + 'file: ' + name);
                    });
                }).catch((ex) => { self.log('readFileContents', ex) });
            }).catch((ex) => { self.log('getFileId', ex) });

            function getFileId(parent, name) {
                var fileIdXml = 
                `<?xml version="1.0" encoding="utf-8"?>
                <soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema">
                    ${generateSOAPHeader()}
                    <soap:Body>
                        <search xmlns="urn:messages_{{ nsVersion }}.platform.webservices.netsuite.com">
                            <searchRecord xmlns:q1="urn:filecabinet_{{ nsVersion }}.documents.webservices.netsuite.com" xsi:type="q1:FileSearchAdvanced">
                                <q1:criteria>
                                    <q1:basic>
                                        <folder operator="anyOf" xmlns="urn:common_{{ nsVersion }}.platform.webservices.netsuite.com">
                                            <searchValue internalId="{parent}" type="folder" xmlns="urn:core_{{ nsVersion }}.platform.webservices.netsuite.com" />
                                        </folder>
                                        <name operator="is" xmlns="urn:common_{{ nsVersion }}.platform.webservices.netsuite.com">
                                            <searchValue xmlns="urn:core_{{ nsVersion }}.platform.webservices.netsuite.com">{filename}</searchValue>
                                        </name>
                                    </q1:basic>
                                </q1:criteria>
                                <q1:columns>
                                    <q1:basic>
                                        <folder xmlns="urn:common_{{ nsVersion }}.platform.webservices.netsuite.com" />
                                        <internalId xmlns="urn:common_{{ nsVersion }}.platform.webservices.netsuite.com" />
                                    </q1:basic>
                                </q1:columns>
                            </searchRecord>
                        </search>
                    </soap:Body>
                </soap:Envelope>`;
                var xml = formatXML(fileIdXml,
                    {
                        filename: name,
                        parent: parent
                    });
                return POST(xml, 'search').then(function (data) {
                    var totalRecords = getTotalRecords(data);

                    if (!totalRecords) {
                        return undefined;
                    }

                    var regex = new RegExp('<platformCore:searchValue internalId="(.*?)"\/>', 'g');

                    for (var i = 0; i < totalRecords; i++) {
                        var foundParentId = regex.exec(data);
                        foundParentId = foundParentId ? parseInt(foundParentId[1], 10) : undefined;
                        var foundFileId = regex.exec(data);
                        foundFileId = foundFileId ? parseInt(foundFileId[1], 10) : undefined;

                        if (foundParentId === parent && foundFileId) {
                            return foundFileId;
                        }
                    }

                    return undefined;
                });
            }

            function readFileContents(target) {
                var deferred = Q.defer();
                fs.readFile(target, function (err, data) {
                    var contents = new Buffer(data).toString('base64');
                    deferred.resolve(contents);
                });
                return deferred.promise;
            }
        }

        function getFolderId(parent, foldername) {
            var key = parent + '|' + foldername.toLowerCase();

            if (folder_cache[key]) {
                var deferred = Q.defer();
                deferred.resolve(folder_cache[key]);
                return deferred.promise;
            }

            var folderIdXml = 
            `<?xml version="1.0" encoding="utf-8"?>
            <soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema">
                ${generateSOAPHeader()}
                <soap:Body>
                    <search xmlns="urn:messages_{{ nsVersion }}.platform.webservices.netsuite.com">
                        <searchRecord xmlns:q1="urn:filecabinet_{{ nsVersion }}.documents.webservices.netsuite.com" xsi:type="q1:FolderSearch">
                            <q1:basic>
                                <name operator="is" xmlns="urn:common_{{ nsVersion }}.platform.webservices.netsuite.com">
                                    <searchValue xmlns="urn:core_{{ nsVersion }}.platform.webservices.netsuite.com">{foldername}</searchValue>
                                </name>
                                <parent operator="anyOf" xmlns="urn:common_{{ nsVersion }}.platform.webservices.netsuite.com">
                                    <searchValue internalId="{parent}" type="folder" xmlns="urn:core_{{ nsVersion }}.platform.webservices.netsuite.com" />
                                </parent>
                            </q1:basic>
                        </searchRecord>
                    </search>
                </soap:Body>
            </soap:Envelope>`;
            var xml = formatXML(folderIdXml,
                {
                    foldername: foldername,
                    parent: parent || '@NONE@'
                });

            return POST(xml, 'search').then(function (data) {
                var totalRecords = getTotalRecords(data);
                if (totalRecords > 0) {
                    var matches = data.match(/internalId="(.*?)"/);
                    if (matches != null) {
                        var id = parseInt(matches[1]);
                        folder_cache[key] = id;
                        return id;
                    } else {
                        throw 'ERR';
                    }
                } else {
                    var folderXml = 
                    `<?xml version="1.0" encoding="utf-8"?>
                    <soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema">
                        ${generateSOAPHeader()}
                        <soap:Body>
                            <add xmlns="urn:messages_{{ nsVersion }}.platform.webservices.netsuite.com">
                                <record xmlns:q1="urn:filecabinet_{{ nsVersion }}.documents.webservices.netsuite.com" xsi:type="q1:Folder">
                                    <q1:name>{foldername}</q1:name>
                                    ${parent ? '<q1:parent internalId="{parent}" type="folder" />' : ''}
                                </record>
                            </add>
                        </soap:Body>
                    </soap:Envelope>`;

                    var create_xml = formatXML(folderXml,
                        {
                            foldername: foldername,
                            parent: parent || '@NONE@'
                        });

                    self.log('Creating Folder: ' + foldername + ' Parent: ' + parent);
                    return POST(create_xml, 'add').then(function (data) {
                        var matches = data.match(/internalId="(.*?)"/);
                        if (matches != null) {
                            var id = parseInt(matches[1]);
                            folder_cache[key] = id;
                            return id;
                        } else {
                            throw 'ERR';
                        }
                    }).catch((ex) => { self.log('POST-add', ex) });
                }
            }).catch((ex) => { self.log('search', ex) });
        };

        function getTotalRecords(body) {
            var matches = body.match(/<platformCore:totalRecords>(.*?)<\/platformCore:totalRecords>/);
            if (matches != null) {
                return parseInt(matches[1]);
            } else {
                return 0;
            }
        }

        function validateRequiredFields(params, field_names) {
            for (var i in field_names) {
                var field_name = field_names[i];
                if (!params[field_name])
                    throw field_name + ' is required';
            }
        }

        self.log = function (msg, ex) {
            if (ex) {
                console.log('ERROR: ', msg, ex, '\n', ex.stack)
            }
            else {
                console.log(msg)
            }
        }
    }

    return SuiteTalk;
})();
