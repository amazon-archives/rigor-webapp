#!/usr/bin/env python

from __future__ import division
import os
import random
import time
import json
import pprint


SUCCESSES = 0
FAILS = 0


def begin(testname=''):
    global SUCCESSES, FAILS
    SUCCESSES = FAILS = 0
    print '---------------------------------------------------\\'
    print 'beginning tests: %s'%testname

def end():
    global SUCCESSES, FAILS
    print '%s tests passed'%SUCCESSES
    if FAILS:
        print '%s TESTS FAILED'%FAILS
    print '---------------------------------------------------/'

def eq(a,b,msg):
    global SUCCESSES, FAILS
    if a == b:
        SUCCESSES += 1
    else:
        print 'test fail: %s != %s.  %s'%(a,b,msg)
        FAILS += 1

def expectException(fn, args, kwargs, exceptionType, msg):
    global SUCCESSES, FAILS
    try:
        fn(*args,**kwargs)
        FAILS += 1
        print 'test fail: exception %s did not occur.  %s'%(exceptionType, msg)
    except exceptionType:
        SUCCESSES += 1
    except:
        FAILS += 1
        print 'test fail: wrong exception type %s.  %s'%(sys.exc_info()[0], msg)


