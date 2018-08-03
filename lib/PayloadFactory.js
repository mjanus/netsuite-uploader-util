var twig = require('twig').twig;
var _ = require('lodash');

var PayloadFactory = function () {

};

PayloadFactory.type = {
    ADD: 'add',
    CREATE_FOLDER: 'createFolder',
    GET_FILE_ID: 'getFileId',
    GET_FOLDER_ID: 'getFolderId',
    HEADER: 'header',
    PASSPORT: 'passport',
    TOKEN_PASSPORT: 'tokenPassport',
    UPDATE: 'update'
};

PayloadFactory.prototype = {
    build: function (type) {
        if (this.handles(type)) {
            throw 'Invalid payload type ' + type + '.';
        }


    },

    handles: function (type) {
        return _.has(PayloadFactory.type, type);
    }
}