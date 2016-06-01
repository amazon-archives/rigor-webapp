'use strict';

var test = require('tape');
var deepEquals = require('lodash').isEqual;

var StateObserver = require('../state-observer.js');

//================================================================================

var getInitialState = function() {
	return {
		num: 1,
		list: [1, 2, 3],
		a: {
			b: {
				c: 1,
			},
		},
	};
};

test('get()', function(t) {
	var initialState = getInitialState();
	var so = new StateObserver(initialState);
	t.deepEqual(so.get(), initialState, 'get with no argument returns root state');
	t.deepEqual(so.get(''), initialState, 'get with empty string returns root state');
	t.deepEqual(so.get('num'), initialState.num, 'get works on root level properties that are ints');
	t.deepEqual(so.get('list'), initialState.list, 'get works on root level properties that are lists');
	t.deepEqual(so.get('list.1'), initialState.list[1], 'get works using numeric list indices');
	t.deepEqual(so.get('a.b'), initialState.a.b, 'get works with deep properties');
	t.deepEqual(so.get('a.b.c'), initialState.a.b.c, 'get works with deep properties');
	t.deepEqual(so.get('nope'), undefined, 'get on a missing root level returns undefined');
	t.deepEqual(so.get('nope.nope'), undefined, 'get on a completely missing deep path returns undefined');
	t.deepEqual(so.get('a.nope'), undefined, 'get on a partially missing deep path returns undefined');
	t.deepEqual(so.get('num.nope'), undefined, 'get does not die on a path that delves into an int');
	t.deepEqual(so.get('list.10'), undefined, 'get returns undefined with bad list index');
	t.notEqual(so.get(), initialState, 'get returns a copy of the original state (root)');
	t.notEqual(so.get('list'), initialState.list, 'get returns a copy of the original state (list)');
	t.notEqual(so.get('a'), initialState.a, 'get returns a copy of the original state (obj)');
	t.notEqual(so.get('a.b'), initialState.a.b, 'get returns a copy of the original state (nested obj)');
	t.end();
});

test('subscribe to root', function(t) {
	t.plan(6);
	var initialState = getInitialState();
	var newState = {num: 1, list: [1, 2, 3], newKey: 'newKey'};
	var so = new StateObserver(initialState);
	so.onChange(function(newVal, oldVal) {
		t.pass('callback was called, no string');
		t.deepEqual(newVal, newState, 'newVal should be correct');
		t.deepEqual(oldVal, initialState, 'oldVal should be correct');
	});
	so.onChange('', function(newVal, oldVal) {
		t.pass('callback was called, empty string');
		t.deepEqual(newVal, newState, 'newVal should be correct');
		t.deepEqual(oldVal, initialState, 'oldVal should be correct');
	});
	so.set('', newState);
});

test('unsubscribe', function(t) {
	t.plan(3);
	var initialState = getInitialState();
	var newState = {num: 1, list: [1, 2, 3], newKey: 'newKey'};
	var so = new StateObserver(initialState);
	var unsubscribe1 = so.onChange(function(newVal, oldVal) {
		t.pass('callback was called, no string');
	});
	var unsubscribe2 = so.onChange('', function(newVal, oldVal) {
		t.pass('callback was called, empty string');
	});
	so.set('', {a: 1});
	unsubscribe1();
	so.set('', {a: 2});
	unsubscribe2();
	unsubscribe2();
	so.set('', {a: 3});
});

//================================================================================

test('legacy tests', function(t) {
	var goodTests = 0;
	var failedTests = 0;
	var testDeepEq = function(a, b, msg) {
		if (deepEquals(a, b)) {
			goodTests += 1;
		} else {
			failedTests += 1;
			msg = msg ? msg : '';
			console.log('fail: ' + msg + ': ' + a + ' !== ' + b);
		}
	};
	var testReport = function() {
		console.log(goodTests + ' tests passed.  ' + failedTests + ' tests failed.');
	};
	//----------------------------------------
	var initialState = getInitialState();

	var so = new StateObserver(initialState);

	var numCallbacks = 0;
	var numCallbacksExpected = 0;
	so.onChange('', function() {
		numCallbacks += 1;
	});
	so.onChange(function(newVal, oldVal) {});
	so.onChange('a.b', function(newVal, oldVal) {});
	so.onChange('floop.doop', function(newVal, oldVal) {});

	testDeepEq(so.get(), initialState, 'inital state: get of root level');
	testDeepEq(so.get('num'), 1, 'initial state: get of top-level state');
	testDeepEq(so.get('list'), [1, 2, 3], 'initial state: get of top-level state');
	testDeepEq(so.get('nope'), undefined, 'initial state: get of missing state');

	numCallbacksExpected = numCallbacks + 1;
	so.set('num', 2);
	testDeepEq(numCallbacks, numCallbacksExpected, 'callback was fired');
	testDeepEq(so.get('num'), 2, 'num was changed');

	so.set('', {replaced: 'the entire object'});

	testReport();

	t.equal(failedTests, 0, 'no legacy tests failed');
	t.end();
});
