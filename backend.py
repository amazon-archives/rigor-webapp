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
import jsonschema


#--------------------------------------------------------------------------------
# DB HELPERS

def getDbConnection(database_name):
    DB_CONNECTION_STRING = "host='ea' dbname='%s' user='%s' password='%s'"
    return psycopg2.connect(DB_CONNECTION_STRING%(database_name,config.DB_USER,config.DB_PASSWORD))

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

def _imageDictDbToApi(conn,d):
    """Given an image row from the database, convert it to an API-style object.
    """
    # convert db timestamps to unix time
    # add tags
    d2 = dict(d)

    debugDetail('getting tags for image %s'%d['id'])

    # add tags
    sql = """SELECT * FROM tag WHERE image_id = %s;"""
    values = (d['id'],)
    tags = []
    for row in dbQueryDict(conn,sql,values):
        tags.append(row['name'])
    d2['tags'] = tags

    # convert timestamp from datetime to unix time
    d2['stamp'] = dbTimestampToUTCTime(d['stamp'])

    # add image urls
    d2['thumb_url'] = 'http://ea/thumbnails/64x64/%s/%s/%s.%s'%(d2['locator'][:2], d2['locator'][2:4], d2['locator'].replace('-',''), d2['format'])
    return d2


def getDatabaseNames():
    sql = """ SELECT datname FROM pg_database ORDER BY datname """
    conn = getDbConnection(config.INITIAL_DB_NAME) # hardcode the one we know exists
    rows = list(dbQueryDict(conn,sql))
    return [row['datname'] for row in rows if row['datname'] not in config.DB_BLACKLIST]


# TODO: better handling of None / NULL here
def getSources(database_name):
    sql = """ SELECT DISTINCT source FROM image ORDER BY source """
    conn = getDbConnection(database_name)
    rows = list(dbQueryDict(conn,sql))
    rows = [row['source'] for row in rows]
    # convert None to ''
    if None in rows:
        rows.remove(None)
#         if not '' in rows:
#             rows = [''] + rows
    return rows

def getSensors(database_name):
    sql = """ SELECT DISTINCT sensor FROM image ORDER BY sensor """
    conn = getDbConnection(database_name)
    rows = list(dbQueryDict(conn,sql))
    rows = [row['sensor'] for row in rows]
    # convert None to ''
    if None in rows:
        rows.remove(None)
#         if not '' in rows:
#             rows = [''] + rows
    return rows


def searchImages(queryDict):
    # TODO: allow searching for NULL
    """
        {
            database_name: 'rigor',
    +       has_tags: ['hello', 'there'],
    +       exclude_tags: ['iphone'],
            confidence_range: [1,4],
    +       sensor: 'iphone',
    +       source: 'kevin',
            annotations: {
                'character': {'geo': true},
                'word': {'text': false},
            }
    +       max_count: 50,  // max 50
    +       page: 3         // starts at 0
        }
    """

    schema = dict(
        database_name = str,
        has_tags = [str],
        exclude_tags = [str],
        sensor = str,
        source = str,
        max_count = int,
        page = int
    )
    jsonschema.validate(schema,queryDict, allowExtraKeys=False, allowMissingKeys=True)

    sql = """SELECT * FROM image"""
    clauses = []
    values = []

    if 'sensor' in queryDict:
        clauses.append("""sensor = %s""")
        values.append(queryDict['sensor'])

    if 'source' in queryDict:
        clauses.append("""source = %s""")
        values.append(queryDict['source'])

    for tag in queryDict.get('has_tags',[]):
        clauses.append(
        'EXISTS ('
        '\n    SELECT tag.image_id, tag.name FROM tag'
        '\n    WHERE tag.image_id = id'
        '\n    AND tag.name = %s'
        '\n)'
        )
        values.append(tag)

    for tag in queryDict.get('exclude_tags',[]):
        clauses.append(
        'NOT EXISTS ('
        '\n    SELECT tag.image_id, tag.name FROM tag'
        '\n    WHERE tag.image_id = id'
        '\n    AND tag.name = %s'
        '\n)'
        )
        values.append(tag)

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

    conn = getDbConnection(queryDict['database_name'])
    results = list(dbQueryDict(conn,sql,values))
    results = [_imageDictDbToApi(conn,r) for r in results]
    return results


def getImage(database_name,id=None,uuid=None):
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

    conn = getDbConnection(database_name)
    rows = list(dbQueryDict(conn,sql,values))
    if len(rows) == 0:
        1/0
    elif len(rows) == 1:
        return _imageDictDbToApi(conn,rows[0])
    else:
        1/0

#--------------------------------------------------------------------------------
# MAIN

# connect upon importing this module
# this is messy and should be cleaned up later

if __name__ == '__main__':
#     print getImage(id=23731)
#     print getImage(database_name='rigor',uuid='01bb6939-ac7f-4dbf-84c9-8136eaa3f6ea');

#     debugMain('testing searchImages')
#     images = searchImages({
#         #         'sensor': 'HTC Nexus One',
#         #         'source': 'Guangyu',
#         'database_name': 'rigor',
#         'has_tags': ['money'],
#         'exclude_tags': ['testdata'],
#         'max_count': 2,
#         'page': 0,
#     })
#     for image in images:
#         debugDetail(pprint.pformat(image))

    debugMain('databases:')
    for db in getDatabaseNames():
        debugDetail(db)

    debugMain('sources:')
    for source in getSources('rigor'):
        debugDetail(source)

    debugMain('sensors:')
    for sensor in getSensors('rigor'):
        debugDetail(sensor)




#
