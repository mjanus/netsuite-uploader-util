var ConnectionSettings = function(settings) {
    settings = settings || {};

    if (settings.email) {
        this.setEmail(settings.email);
    }

    if (settings.password) {
        this.setPassword(settings.password);
    }

    if (settings.account) {
        this.setAccount(settings.account);
    }

    if (settings.role) {
        this.setRole(role);
    }

    if (settings.hostname) {
        this.setHostname(settings.hostname);
    }
};

ConnectionSettings.prototype = {
    getEmail: function () {
        return this.email;
    },

    setEmail: function (email) {
        this.email = email;

        return this;
    },

    getPassword: function () {
        return this.password;
    },

    setPassword: function (password) {
        this.password = password;

        return this;
    },

    getAccount: function() {
        return this.account;
    },

    setAccount: function (account) {
        this.account = account;

        return this;
    },

    getRole: function () {
        return this.role;
    },

    setRole: function (role) {
        this.role = role;

        return this;
    },

    getHostname: function () {
        return this.hostname;
    },

    setHostname: function (hostname) {
        this.hostname = hostname;

        return this;
    },

    validate: function() {
        if (!this.getEmail()) {
            throw 'email is required';
        }

        if (!this.getPassword()) {
            throw 'password is required';
        }

        if (!this.getAccount()) {
            throw 'account is required';
        }

        if (!this.getRole()) {
            throw 'role is required';
        }
    }
};