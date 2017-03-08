// Fetches an image from an external URL

'use strict';

var env, string, stream, util, request;

env    = require('../../config/environment_vars');
string  = require('../../utils/string');
stream  = require('stream');
util    = require('util');
request = require('request');

function contentLength(bufs){
  return bufs.reduce(function(sum, buf){
    return sum + buf.length;
  }, 0);
}

function External(url){
  this.url = url;
  this.ended = false;
  stream.Readable.call(this, { objectMode : true });
}

util.inherits(External, stream.Readable);

External.prototype._read = function(){
  var _this = this,
    imgStream,
    bufs = [];

  if ( this.ended ){ return; }

  // pass through if there is an error on the image object
  if (this.image.isError()){
    this.ended = true;
    this.push(this.image);
    return this.push(null);
  }

  this.image.log.time('source:' + this.key);

  var options = {
    url: this.url,
    headers: {
      'User-Agent': env.USER_AGENT
    }
  };
  imgStream = request.get(options);
  imgStream.on('data', function(d){ bufs.push(d); });
  imgStream.on('error', function(err){
    _this.image.error = new Error(err);
  });
  imgStream.on('response', function(response) {
    if (response.statusCode !== 200) {
      _this.image.error = new Error('Error ' + response.statusCode + ':');
    }
  });
  imgStream.on('end', function(){
    _this.image.log.timeEnd('source:' + _this.key);
    if(_this.image.isError()) {
      _this.image.error.message += Buffer.concat(bufs);
    } else {
      _this.image.contents = Buffer.concat(bufs);
      _this.image.originalContentLength = contentLength(bufs);
    }
    _this.ended = true;
    _this.push(_this.image);
    _this.push(null);
  });

};


module.exports = External;
