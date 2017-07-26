/**
 * Created by blarsen on 03.10.14.
 */


var Buffer = function(data, index) {
    this.data = data;
    this.index = index;

    this.skipSpaces = function() {
        while (this.hasMore() && this.data[this.index] == ' ')
            this.index++;
    }

    this.getOne = function() {
        return this.data[this.index++];
    }

    this.getUpto = function(char) {
        if (!this.hasMore())
            return undefined;
        var result = '';
        while (this.hasMore() && (this.data[this.index] != char || this.data[this.index-1] == '\\')) {
            result += this.data[this.index++];
        }
        return result;
    }

    this.findPos = function(char) {
        if (!this.hasMore())
            return undefined;
        var result = '';
        var pos = this.index;
        while ((this.data.length - pos) > 0 && (this.data[pos] != char || this.data[pos-1] == '\\')) {
            pos += 1;
        }
        return pos;
    }

    this.skip = function(count) {
        count = count || 1;
        var before = this.index;
        this.index = Math.min(this.index+count, this.data.length);
    }

    this.rewind = function() {
        this.index = 0;
    }

    this.lookingAt = function() {
        if (!this.hasMore())
            return undefined;
        return this.data[this.index];
    }

    this.hasMore = function() {
        return this.remaining() > 0;
    }

    this.remaining = function() {
        return this.data.length - this.index;
    }

}

module.exports = Buffer;
