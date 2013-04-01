#!/usr/bin/env python

from __future__ import division
import os
import random
import time
import json
import pprint
import datetime
import calendar

import psycopg2

from utils import *
import config


#--------------------------------------------------------------------------------
# DB HELPERS

def getDbConnection():
    return psycopg2.connect(config.DB_CONNECTION_STRING)

def getColumnNames(conn,table):
    """Return a list of column names for the given table.
    """
    sql = "SELECT * FROM %s LIMIT 1;"%table
    cursor = conn.cursor()
    cursor.execute(sql)
    return [column[0] for column in cursor.description]

def dbQueryDict(conn,sql,values=()):
    """Run the sql and yield the results as dictionaries
    This is useful for SELECTs
    """
    debugSQL(sql)
    debugSQL('... %s'%str(values))
    cursor = conn.cursor()
    cursor.arraysize = 2000
    cursor.execute(sql,values)
    def iterator():
        columnNames = None
        while True:
            rows = cursor.fetchmany(size=2000)
            if not rows:
                break
            if not columnNames:
                columnNames = [column[0] for column in cursor.description]
            for row in rows:
                d = dict(zip(columnNames,row))
                yield d
    return iterator()

def dbExecute(conn,sql):
    """Run the sql and return the number of rows affected.
    This is useful for delete or insert commands
    """
    cursor = conn.cursor()
#     cursor = conn.cursor(cursor_factory=psycopg2.extras.DictCursor)
    cursor.execute(sql)
    return cursor.rowcount

def dbTimestampToUTCTime(dt):
    """Convert a time from the database to a unix seconds-since-epoch time
    """
    return calendar.timegm(dt.utctimetuple())

#--------------------------------------------------------------------------------
# MAIN

def sanitizeRow(d):
    d2 = dict(d)
    for key,val in d2.items():
        print type(val)
        if type(val) == datetime.datetime:
            d2[key] = dbTimestampToUTCTime(val)
    return d2

def searchImages(queryDict):
    """
        {
            db_version: 'whatever',
            has_tags: ['hello', 'there'],
            exclude_tags: ['iphone'],
            confidence_range: [1,4],
            annotations: {
                'character': {'geo': true},
                'word': {'text': false},
            }
            max_count: 50,  // max 50
            page: 3         // starts at 0
        }
    """

    sql = """SELECT * FROM image"""
    clauses = []
    values = []

    if 'sensor' in queryDict:
        clauses.append("""sensor = %s""")
        values.append(queryDict['sensor'])

    if 'source' in queryDict:
        clauses.append("""source = %s""")
        values.append(queryDict['source'])

    if clauses:
        sql = sql + '\nWHERE ' + '\nAND '.join(clauses)

    sql += '\nORDER BY stamp'

    max_count = min(int(queryDict.get('max_count',50)),50)
    sql += '\nLIMIT %s';
    values.append(max_count)

    if 'page' in queryDict:
        page = int(queryDict['page'])
        sql += '\nOFFSET %s'
        values.append(page * max_count)

    results = list(dbQueryDict(CONN,sql,values))
    results = [sanitizeRow(r) for r in results]
    return results


def getImage(id=None,uuid=None):
    if id and uuid:
        1/0
    elif not id and not uuid:
        1/0
    elif id:
        sql = """
            SELECT * FROM image WHERE id = %s;
        """
        values = ( id, )
    elif uuid:
        sql = """
            SELECT * FROM image WHERE locator = %s;
        """
        values = ( uuid, )

    rows = list(dbQueryDict(CONN,sql,values))
    if len(rows) == 0:
        1/0
    elif len(rows) == 1:
        return sanitizeRow(rows[0])
    else:
        1/0

#--------------------------------------------------------------------------------
# MAIN

# connect upon importing this module
# this is messy and should be cleaned up later
debugMain('connecting to db')
CONN = getDbConnection()

if __name__ == '__main__':
    #     print getImage(id=23731)
#     print getImage(uuid='01bb6939-ac7f-4dbf-84c9-8136eaa3f6ea');
    debugMain('testing searchImages')
    images = searchImages({
        'sensor': 'HTC Nexus One',
        'source': 'Guangyu',
        'max_count': 4,
        'page': 0,
    })
    for image in images:
        debugDetail(pprint.pformat(image))





#
