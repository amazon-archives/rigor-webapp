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


#--------------------------------------------------------------------------------

def clean(schema, input, allowMissingKeys=False):
    """Return a new dict which is a copy of input with any extra keys removed.
    If not allowMissingKeys, check for missing keys and raise a MissingKeyException if needed.
    Can also raise a WrongTypeException if the input types don't match the schema types.
    """
    validate(schema, input, allowExtraKeys=True, allowMissingKeys=allowMissingKeys)
    result = {}
    for key in schema.keys():
        if key not in input: continue
        if isinstance(schema[key],dict):
            result[key] = clean(schema[key], input[key], allowMissingKeys)
        else:
            result[key] = input[key]
    return result


def validate(schema, input, allowExtraKeys=False, allowMissingKeys=False, stack=[]):
    """Input: a schema dict and an input dict.
    Output: either True, or an exception.
    If not allowExtraKeys, raise an ExtraKeyException if extra keys are present in input.
    If not allowMissingKeys, raise a MissingKeyException if keys are missing from the input.
    Ignore the "stack" variable; it's for internal use.

    A schema is a dict containing the keys you want your actual data to have.
    The values can either be types (int, str, ...) or instances of those types (123, "hello", ...).
    Dictionaries can be nested.
    Lists are treated as opaque and their length and contents don't matter.
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
            validate(expectedVal,actualVal,allowExtraKeys=allowExtraKeys,allowMissingKeys=allowMissingKeys,stack=stack+[key])

    return True

#--------------------------------------------------------------------------------


if __name__ == '__main__':
    testlib.begin('jsonschema')

    schemaWithTypes = dict(a=str,b=str)
    schemaWithExamples = dict(a='a',b='b')
    inputMatch = dict(schemaWithExamples)
    inputExtra = dict(a='a',b='b',c='c')
    inputMissing = dict(a='a')
    inputBadType = dict(a='a',b=123)

    #--------------------------
    # CLEAN

    testlib.eq(  clean(schemaWithTypes, inputMatch), inputMatch, 'clean with perfect match changes nothing'  )
    testlib.eq(  clean(schemaWithExamples, inputMatch), inputMatch, 'clean with perfect match changes nothing (using examples)'  )
    testlib.eq(  clean(schemaWithTypes, inputExtra), inputMatch, 'clean removes extra keys'  )
    testlib.eq(  clean(schemaWithTypes, inputMissing, allowMissingKeys=True), inputMissing, 'clean can allow missing keys'  )
    testlib.expectException(    clean, [],
                                dict(schema=schemaWithTypes, input=inputMissing, allowMissingKeys=False),
                                MissingKeyException, 'clean can die on missing keys'  )
    testlib.expectException(    clean, [],
                                dict(schema=schemaWithTypes, input=inputBadType),
                                WrongTypeException, 'clean detects wrong types'  )

    #--------------------------
    # EXTRA KEYS, MISSING KEYS

    # perfect match
    testlib.eq(   validate(schemaWithTypes,    inputMatch), True, 'perfect match using types -> True'   )
    testlib.eq(   validate(schemaWithExamples, inputMatch), True, 'perfect match using example -> True'   )

    # missing keys
    testlib.eq(   validate(schemaWithTypes, inputMissing, allowMissingKeys=True), True, 'missing keys allowed -> True'  )
    testlib.expectException(    validate, [],
                                dict(schema=schemaWithTypes, input=inputMissing, allowMissingKeys=False),
                                MissingKeyException, 'missing keys not allowed -> MissingKeyException'  )

    # extra keys
    testlib.eq(   validate(schemaWithTypes, inputExtra, allowExtraKeys=True), True, 'extra keys allowed -> True'  )
    testlib.expectException(    validate, [],
                                dict(schema=schemaWithTypes, input=inputExtra, allowExtraKeys=False),
                                ExtraKeyException, 'extra keys not allowed -> ExtraKeyException'  )

    #--------------------------
    # EXTRA KEYS, MISSING KEYS IN NESTED DICTS

    schemaWithTypes = dict(nest=dict(a=str,b=str))
    schemaWithExamples = dict(nest=dict(a='a',b='b'))
    schemaWithExamples = dict(nest=dict(a='a',b='b'))
    inputMatch = dict(schemaWithExamples)
    inputExtra = dict(nest=dict(a='a',b='b',c='c'))
    inputMissing = dict(nest=dict(a='a'))

    # perfect match
    testlib.eq(   validate(schemaWithTypes,    inputMatch), True, 'perfect match using types -> True'   )
    testlib.eq(   validate(schemaWithExamples, inputMatch), True, 'perfect match using example -> True'   )

    # missing keys
    testlib.eq(   validate(schemaWithTypes, inputMissing, allowMissingKeys=True), True, 'missing keys allowed -> True'  )
    testlib.expectException(    validate, [],
                                dict(schema=schemaWithTypes, input=inputMissing, allowMissingKeys=False),
                                MissingKeyException, 'missing keys not allowed -> MissingKeyException'  )

    # extra keys
    testlib.eq(   validate(schemaWithTypes, inputExtra, allowExtraKeys=True), True, 'extra keys allowed -> True'  )
    testlib.expectException(    validate, [],
                                dict(schema=schemaWithTypes, input=inputExtra, allowExtraKeys=False),
                                ExtraKeyException, 'extra keys not allowed -> ExtraKeyException'  )

    #--------------------------
    # TYPES

    # special-cased type mismatches which are ok
    testlib.eq(   validate(dict(a=1.0), dict(a=1)), True, 'int is ok where float is expected'   )

    # wrong type
    testlib.expectException(    validate, [],
                                dict(   schema=dict(a=str),
                                        input=dict(a=1)
                                ),
                                WrongTypeException, 'wrongTypeException with type: expected str, got int'  )
    testlib.expectException(    validate, [],
                                dict(   schema=dict(a='a'),
                                        input=dict(a=1)
                                ),
                                WrongTypeException, 'wrongTypeException with example: expected str, got int'  )
    testlib.expectException(    validate, [],
                                dict(   schema=dict(a=int),
                                        input=dict(a=1.1)
                                ),
                                WrongTypeException, 'wrongTypeException with type: expected int, got float'  )
    testlib.expectException(    validate, [],
                                dict(   schema=dict(a=1),
                                        input=dict(a=1.1)
                                ),
                                WrongTypeException, 'wrongTypeException with example: expected int, got float'  )

    # todo: tests for nested dicts

    testlib.end()

