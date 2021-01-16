'use strict';

var Message = require('../message');
var inherits = require('util').inherits;
var bitcore = require('bitcore-lib-cash');
var $ = bitcore.util.preconditions;
var _ = bitcore.deps._;

/**
 * @param {Transaction=} arg - An instance of Transaction
 * @param {Object} options
 * @extends Message
 * @constructor
 */
function ProtoconfMessage(arg, options) {
	Message.call(this, options);
	this.command = 'protoconf';

	/*
  this.Transaction = options.Transaction;
  $.checkArgument(
    _.isUndefined(arg) || arg instanceof this.Transaction,
    'An instance of Transaction or undefined is expected'
  );
  this.transaction = arg;
  if (!this.transaction) {
    this.transaction = new this.Transaction();
  }
  */
}
inherits(ProtoconfMessage, Message);

ProtoconfMessage.prototype.setPayload = function (payload) {
	/*
  if (this.Transaction.prototype.fromBuffer) {
    this.transaction = new this.Transaction().fromBuffer(payload);
  } else {
    this.transaction = this.Transaction.fromBuffer(payload);
  }*/
};

ProtoconfMessage.prototype.getPayload = function () {
	return ''; //this.transaction.toBuffer();
};

module.exports = ProtoconfMessage;