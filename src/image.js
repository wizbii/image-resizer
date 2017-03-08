'use strict';

var _, Logger, env, modifiers, stream, util, imageType;

_         = require('lodash');
Logger    = require('./utils/logger');
env       = require('./config/environment_vars');
modifiers = require('./lib/modifiers');
stream    = require('stream');
util      = require('util');
imageType = require('image-type');


// Simple stream to represent an error at an early stage, for instance a
// request to an excluded source.
function ErrorStream(image){
  stream.Readable.call(this, { objectMode : true });
  this.image = image;
}
util.inherits(ErrorStream, stream.Readable);

ErrorStream.prototype._read = function(){
  this.push(this.image);
  this.push(null);
};


function Image(request){
  // placeholder for any error objects
  this.error = null;

  // set a mark for the start of the process
  this.mark = Date.now();

  // pull the various parts needed from the request params
  this.parseUrl(request);

  // placeholder for the buffer/stream coming from s3, will hold the image
  this.contents = null;

  // placeholder for the size of the original image
  this.originalContentLength = 0;

  // set the default expiry length, can be altered by a source file
  this.expiry = env.IMAGE_EXPIRY;

  // all logging strings will be queued here to be written on response
  this.log = new Logger();
}

Image.validInputFormats  = ['jpeg', 'jpg', 'png', 'webp', 'tiff', 'tif', 'gif'];
Image.validOutputFormats = ['jpeg', 'png', 'webp'];

// Parse tu URL to get all parameters : modifiers, sources and format
Image.prototype.parseUrl = function(request){
  this.image = request.query.source;
  this.outputFormat = request.query.output || 'jpeg';
  this.modifiers = modifiers.parse(request.query);
};


Image.prototype.isError = function(){ return this.error !== null; };


Image.prototype.isStream = function(){
  var Stream = require('stream').Stream;
  return !!this.contents && this.contents instanceof Stream;
};


Image.prototype.isBuffer = function(){
  return !!this.contents && Buffer.isBuffer(this.contents);
};


Image.prototype.getFile = function(){
  var sources = require('./streams/sources');
  Stream = sources.external;
  return new Stream(this, this.modifiers.external, env.externalSources[this.modifiers.external]);

  var excludes = env.EXCLUDE_SOURCES ? env.EXCLUDE_SOURCES.split(',') : [],
      streamType = env.DEFAULT_SOURCE,
      Stream = null;

  // look to see if the request has a specified source
  if (_.has(this.modifiers, 'external')){
    if (_.has(sources, this.modifiers.external)){
      streamType = this.modifiers.external;
    } else if (_.has(env.externalSources, this.modifiers.external)) {
      Stream = sources.external;
      return new Stream(this, this.modifiers.external, env.externalSources[this.modifiers.external]);
    }
  }

  // if this request is for an excluded source create an ErrorStream
  if (excludes.indexOf(streamType) > -1){
    this.error = new Error(streamType + ' is an excluded source');
    Stream = ErrorStream;
  }

  // if all is well find the appropriate stream
  else {
    Stream = sources[streamType];
  }

  return new Stream(this);
};


Image.prototype.sizeReduction = function(){
  var size = this.contents.length;
  return (this.originalContentLength - size)/1000;
};


Image.prototype.sizeSaving = function(){
  var oCnt = this.originalContentLength,
      size = this.contents.length;
  return ((oCnt - size)/oCnt * 100).toFixed(2);
};


Image.prototype.isFormatValid = function () {
  if (!this.format) {
    this.error = new Error('Input format not recognized');

    return;
  }

  if (Image.validInputFormats.indexOf(this.format) === -1) {
    this.error = new Error('Unsupported input format "' + this.format + '"');
  } else if (Image.validOutputFormats.indexOf(this.format) === -1 && !this.outputFormat) {
    this.error = new Error('Unsupported output format "' + this.format + '"');
  }
};

// Setter/getter for image format that normalizes formats
Object.defineProperty(Image.prototype, 'format', {
  get: function () { return this._format; },
  set: function (value) {
    this._format = value.toLowerCase();
    if (this._format === 'jpg') { this._format = 'jpeg'; }
    else if (this._format === 'tif') { this._format = 'tiff'; }
  }
});

// Setter/getter for image contents that determines the format from the content
// of the image to be processed.
Object.defineProperty(Image.prototype, 'contents', {
  get: function () { return this._contents; },
  set: function (data) {
    var imgType;

    this._contents = data;

    if (this.isBuffer()) {
      imgType = imageType(data);
      if (imgType) {
        this.format = imgType.ext;
      }
      this.isFormatValid();
    }
  }
});


module.exports = Image;
