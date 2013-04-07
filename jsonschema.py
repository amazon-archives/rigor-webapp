#!/usr/bin/env python

from __future__ import division
import os
import random
import time
import json
import pprint
import testlib

#--------------------------------------------------------------------------------

class ExtraKeyException(Exception): pass
class MissingKeyException(Exception): pass
class WrongTypeException(Exception): pass

# todo:
#   coerce types (unicode, str->int...)
#   remove extra keys
#   allow only some keys to be required and some to be optional
#   handle lists
#   write a ton of tests


def validate(schema, input, allowExtraKeys=False, allowMissingKeys=False, stack=[]):
    """Input: a schema dict and an input dict.
    Output: either True, or an exception.
    If not allowExtraKeys, raise an ExtraKeyException if extra keys are present in input.
    If not allowMissingKeys, raise a MissingKeyException if keys are missing from the input.
    Ignore the "stack" variable; it's for internal use.
    """
    schemaKeys = set(schema.keys())
    inputKeys = set(input.keys())

    if not allowExtraKeys:
        if inputKeys - schemaKeys:
            raise ExtraKeyException('extra key(s): %s'%str(list(inputKeys-schemaKeys)))
    if not allowMissingKeys:
        if schemaKeys - inputKeys:
            raise MissingKeyException('missing key(s): %s'%str(list(schemaKeys-inputKeys)))

    for key, expectedVal in schema.items():
        if key not in input: continue

        if type(expectedVal) == type:
            expectedType = expectedVal
        else:
            expectedType = type(expectedVal)

        actualVal = input[key]
        actualType = type(actualVal)
        if not isinstance(actualVal,expectedType):
            # allow an int where we expected a float
            if actualType == int and expectedType == float:
                pass
            else:
                raise WrongTypeException('in %s: key %s should be %s but is %s which is type %s'%('/'+'/'.join([str(s) for s in stack]),repr(key),expectedType,repr(actualVal),actualType))

        if isinstance(actualVal,dict):
            validate(expectedVal,actualVal,stack=stack+[key])

    return True


#--------------------------------------------------------------------------------

if __name__ == '__main__':
    testlib.begin('jsonschema')

    schemaType = dict(a=str,b=str)
    schemaExample = dict(a='a',b='b')

    # perfect match
    testlib.eq(   validate(schemaType,    dict(a='a',b='b')), True, 'perfect match using types -> True'   )
    testlib.eq(   validate(schemaExample, dict(a='a',b='b')), True, 'perfect match using example -> True'   )

    # special-cased ok type mismatches
    testlib.eq(   validate(dict(a=1.0), dict(a=1)), True, 'int is ok where float is expected'   )

    # missing keys
    testlib.eq(   validate(schemaType, dict(a='a'), allowMissingKeys=True), True, 'missing keys allowed -> True'  )
    testlib.expectException(    validate, [],
                                dict(schema=schemaType, input=dict(a='a'), allowMissingKeys=False),
                                MissingKeyException,
                                'missing keys not allowed -> MissingKeyException'  )

    # extra keys
    testlib.eq(   validate(schemaType, dict(a='a',b='b',c='c'), allowExtraKeys=True), True, 'extra keys allowed -> True'  )
    testlib.expectException(    validate, [],
                                dict(schema=schemaType, input=dict(a='a',b='b',c='c'), allowExtraKeys=False),
                                ExtraKeyException,
                                'extra keys not allowed -> ExtraKeyException'  )
    # wrong type
    testlib.expectException(    validate, [],
                                dict(   schema=dict(a=str),
                                        input=dict(a=1)
                                ),
                                WrongTypeException,
                                'str is not int (type check): wrongTypeException'  )
    testlib.expectException(    validate, [],
                                dict(   schema=dict(a='a'),
                                        input=dict(a=1)
                                ),
                                WrongTypeException,
                                'str is not int (example check): wrongTypeException'  )
    testlib.expectException(    validate, [],
                                dict(   schema=dict(a=1),
                                        input=dict(a=1.1)
                                ),
                                WrongTypeException,
                                'float is not int (example check): wrongTypeException'  )
    testlib.expectException(    validate, [],
                                dict(   schema=dict(a=int),
                                        input=dict(a=1.1)
                                ),
                                WrongTypeException,
                                'float is not int (example check): wrongTypeException'  )

    # todo: tests for nested dicts

    testlib.end()

