var Cache = function() {
    this.data = { };
};

Cache.prototype = {
    set: function (key, value) {
        this.data[key] = value;
    },

    get: function(key) {
        return this.data[key] || undefined;
    }
};

module.exports = Cache;